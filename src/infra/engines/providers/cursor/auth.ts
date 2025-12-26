import { stat, rm, mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';

import { expandHomeDir } from '../../../../shared/utils/index.js';
import { metadata } from './metadata.js';
import {
  isCliInstalled,
  isCliNotFoundError,
  displayCliNotInstalledError,
  displayCliNotFoundError,
} from '../../core/cli-utils.js';

export interface CursorAuthOptions {
  cursorConfigDir?: string;
}

/**
 * Resolves the Cursor config directory (shared for authentication)
 */
export function resolveCursorConfigDir(options?: CursorAuthOptions): string {
  if (options?.cursorConfigDir) {
    return expandHomeDir(options.cursorConfigDir);
  }

  if (process.env.CURSOR_CONFIG_DIR) {
    return expandHomeDir(process.env.CURSOR_CONFIG_DIR);
  }

  // Authentication is shared globally
  return path.join(homedir(), '.codemachine', 'cursor');
}

/**
 * Gets the path to cursor's cli-config.json file
 * Cursor stores configuration and authentication data here
 */
export function getCursorConfigPath(configDir: string): string {
  return path.join(configDir, 'cli-config.json');
}

/**
 * Gets paths to all Cursor-related files that need to be cleaned up
 */
export function getCursorAuthPaths(configDir: string): string[] {
  return [
    getCursorConfigPath(configDir), // cli-config.json
    path.join(configDir, 'chats'),   // chats directory
    path.join(configDir, 'projects'), // projects directory
  ];
}

/**
 * Checks if Cursor is authenticated
 */
export async function isAuthenticated(options?: CursorAuthOptions): Promise<boolean> {
  const configDir = resolveCursorConfigDir(options);
  const configPath = getCursorConfigPath(configDir);

  try {
    const stats = await stat(configPath);
    // Check if cli-config.json exists and is a file
    return stats.isFile();
  } catch (_error) {
    return false;
  }
}

/**
 * Ensures Cursor is authenticated, running login if needed
 */
export async function ensureAuth(options?: CursorAuthOptions): Promise<boolean> {
  const configDir = resolveCursorConfigDir(options);
  const configPath = getCursorConfigPath(configDir);

  // If already authenticated, nothing to do
  try {
    const stats = await stat(configPath);
    if (stats.isFile()) {
      return true;
    }
  } catch {
    // Config file doesn't exist
  }

  if (process.env.CODEMACHINE_SKIP_AUTH === '1') {
    // Create a placeholder for testing/dry-run mode
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify({ version: 1 }), 'utf8');
    return true;
  }

  // Check if CLI is installed
  const cliInstalled = await isCliInstalled(metadata.cliBinary);
  if (!cliInstalled) {
    displayCliNotInstalledError(metadata);
    throw new Error(`${metadata.name} CLI is not installed.`);
  }

  // Run interactive login via Cursor CLI with proper env
  console.log(`\nRunning Cursor authentication...\n`);
  console.log(`Config directory: ${configDir}\n`);

  // Ensure the config directory exists before login
  await mkdir(configDir, { recursive: true });

  // Set CURSOR_CONFIG_DIR to control where cursor-agent stores authentication
  try {
    // Resolve cursor-agent command to handle Windows .cmd files
    const resolvedCursorAgent = Bun.which('cursor-agent') ?? 'cursor-agent';

    const proc = Bun.spawn([resolvedCursorAgent, 'login'], {
      env: {
        ...process.env,
        CURSOR_CONFIG_DIR: configDir,
      },
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    await proc.exited;
  } catch (error) {
    if (isCliNotFoundError(error)) {
      displayCliNotFoundError(metadata, 'login');
      throw new Error(`${metadata.name} CLI is not installed.`);
    }
    throw error;
  }

  // Verify the config file was created
  try {
    const stats = await stat(configPath);
    if (stats.isFile()) {
      return true;
    }
  } catch {
    // Config file wasn't created
    console.error(`\n────────────────────────────────────────────────────────────`);
    console.error(`  ℹ️  Cursor CLI Authentication Notice`);
    console.error(`────────────────────────────────────────────────────────────`);
    console.error(`\nCursor authentication was not completed successfully.`);
    console.error(`The config file was not created at: ${configPath}`);
    console.error(`\nPlease try running 'cursor-agent login' manually with:`);
    console.error(`  CURSOR_CONFIG_DIR="${configDir}" cursor-agent login\n`);
    console.error(`────────────────────────────────────────────────────────────\n`);

    throw new Error('Authentication incomplete. Config file was not created.');
  }

  return true;
}

/**
 * Clears all Cursor authentication data
 */
export async function clearAuth(options?: CursorAuthOptions): Promise<void> {
  const configDir = resolveCursorConfigDir(options);
  const authPaths = getCursorAuthPaths(configDir);

  // Remove all auth-related files/folders
  await Promise.all(
    authPaths.map(async (authPath) => {
      try {
        await rm(authPath, { force: true, recursive: true });
      } catch (_error) {
        // Ignore removal errors; treat as cleared
      }
    }),
  );
}

/**
 * Returns the next auth menu action based on current auth state
 */
export async function nextAuthMenuAction(options?: CursorAuthOptions): Promise<'login' | 'logout'> {
  return (await isAuthenticated(options)) ? 'logout' : 'login';
}
