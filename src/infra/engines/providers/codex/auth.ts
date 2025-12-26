import { stat, rm, writeFile, mkdir } from 'node:fs/promises';
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

/**
 * Resolves the Codex home directory
 */
async function resolveCodexHome(codexHome?: string): Promise<string> {
  const rawPath = codexHome ?? process.env.CODEX_HOME ?? path.join(homedir(), '.codemachine', 'codex');
  const targetHome = expandHomeDir(rawPath);
  await mkdir(targetHome, { recursive: true });
  return targetHome;
}

export function getAuthFilePath(codexHome: string): string {
  return path.join(codexHome, 'auth.json');
}

export async function isAuthenticated(): Promise<boolean> {
  const codexHome = await resolveCodexHome();
  const authPath = getAuthFilePath(codexHome);
  try {
    await stat(authPath);
    return true;
  } catch (_error) {
    return false;
  }
}

export async function ensureAuth(): Promise<boolean> {
  const codexHome = await resolveCodexHome();
  const authPath = getAuthFilePath(codexHome);

  // If already authenticated, nothing to do.
  try {
    await stat(authPath);
    return true;
  } catch {
    // Auth file doesn't exist
  }

  if (process.env.CODEMACHINE_SKIP_AUTH === '1') {
    await writeFile(authPath, '{}', { encoding: 'utf8' });
    return true;
  }

  // Check if CLI is installed
  const cliInstalled = await isCliInstalled(metadata.cliBinary);
  if (!cliInstalled) {
    displayCliNotInstalledError(metadata);
    throw new Error(`${metadata.name} CLI is not installed.`);
  }

  // Run interactive login via Codex CLI with proper env.
  try {
    // Resolve codex command to handle Windows .cmd files
    const resolvedCodex = Bun.which('codex') ?? 'codex';

    const proc = Bun.spawn([resolvedCodex, 'login'], {
      env: { ...process.env, CODEX_HOME: codexHome },
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

  // Ensure the auth credential path exists; create a placeholder if still absent.
  try {
    await stat(authPath);
  } catch {
    await writeFile(authPath, '{}', 'utf8');
  }

  return true;
}

export async function clearAuth(): Promise<void> {
  const codexHome = await resolveCodexHome();
  const authPath = getAuthFilePath(codexHome);
  try {
    await rm(authPath, { force: true });
  } catch (_error) {
    // Ignore removal errors; treat as cleared
  }
}

export async function nextAuthMenuAction(): Promise<'login' | 'logout'> {
  return (await isAuthenticated()) ? 'logout' : 'login';
}
