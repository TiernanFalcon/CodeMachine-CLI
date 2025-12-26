/**
 * Shared CLI utilities for engine providers
 *
 * Provides common functionality for checking CLI installation status
 * across all engine providers.
 */

import { CLI_CHECK_TIMEOUT_MS } from '../../../shared/config/timeouts.js';

/**
 * Options for CLI installation check
 */
export interface IsCliInstalledOptions {
  /** Version flag to use (default: '--version') */
  versionFlag?: string;
  /** Timeout in milliseconds (default: CLI_CHECK_TIMEOUT_MS) */
  timeoutMs?: number;
  /** Additional patterns to match in output for valid installation */
  validOutputPatterns?: RegExp[];
}

/**
 * Error patterns that indicate CLI is not installed
 */
const CLI_NOT_FOUND_PATTERNS = [
  /not recognized as an internal or external command/i,
  /command not found/i,
  /No such file or directory/i,
  /is not recognized/i,
];

/**
 * Check if a CLI command is installed and accessible
 *
 * @param command - The CLI command to check (e.g., 'claude', 'codex')
 * @param options - Optional configuration for the check
 * @returns Promise<boolean> - true if CLI is installed, false otherwise
 *
 * @example
 * ```typescript
 * // Basic check with --version
 * const isInstalled = await isCliInstalled('claude');
 *
 * // Check with custom version flag
 * const isCcrInstalled = await isCliInstalled('ccr', { versionFlag: '-v' });
 *
 * // Check with custom output pattern
 * const isCustomInstalled = await isCliInstalled('custom', {
 *   validOutputPatterns: [/version:\s*\d+\.\d+\.\d+/i]
 * });
 * ```
 */
export async function isCliInstalled(
  command: string,
  options: IsCliInstalledOptions = {}
): Promise<boolean> {
  const {
    versionFlag = '--version',
    timeoutMs = CLI_CHECK_TIMEOUT_MS,
    validOutputPatterns = [],
  } = options;

  try {
    // Resolve command using Bun.which() to handle Windows .cmd files
    const resolvedCommand = Bun.which(command) ?? command;

    const proc = Bun.spawn([resolvedCommand, versionFlag], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    });

    // Set a timeout
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );

    const exitCode = await Promise.race([proc.exited, timeout]);
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const combinedOutput = `${stdout}\n${stderr}`;

    // Check for error messages indicating command not found
    for (const pattern of CLI_NOT_FOUND_PATTERNS) {
      if (pattern.test(combinedOutput)) {
        return false;
      }
    }

    // If exit code is 0, CLI is installed
    if (typeof exitCode === 'number' && exitCode === 0) {
      return true;
    }

    // Check custom valid output patterns (for CLIs with non-zero exit codes)
    for (const pattern of validOutputPatterns) {
      if (pattern.test(combinedOutput)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if an error indicates CLI not found
 *
 * @param error - The error to check
 * @returns boolean - true if error indicates CLI not found
 */
export function isCliNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as { code?: string; stderr?: string; message?: string };
  const stderr = err.stderr ?? '';
  const message = err.message ?? '';
  const combinedText = `${stderr} ${message}`;

  if (err.code === 'ENOENT') {
    return true;
  }

  for (const pattern of CLI_NOT_FOUND_PATTERNS) {
    if (pattern.test(combinedText)) {
      return true;
    }
  }

  return false;
}

/**
 * Display CLI not installed error message
 *
 * @param metadata - Engine metadata with name, cliBinary, installCommand
 */
export function displayCliNotInstalledError(metadata: {
  name: string;
  cliBinary: string;
  installCommand: string;
}): void {
  console.error(`\n────────────────────────────────────────────────────────────`);
  console.error(`  ⚠️  ${metadata.name} CLI Not Installed`);
  console.error(`────────────────────────────────────────────────────────────`);
  console.error(`\nThe '${metadata.cliBinary}' command is not available.`);
  console.error(`Please install ${metadata.name} CLI first:\n`);
  console.error(`  ${metadata.installCommand}\n`);
  console.error(`────────────────────────────────────────────────────────────\n`);
}

/**
 * Display CLI not found error message (during command execution)
 *
 * @param metadata - Engine metadata with name, cliBinary, installCommand
 * @param command - The command that failed
 */
export function displayCliNotFoundError(
  metadata: {
    name: string;
    cliBinary: string;
    installCommand: string;
  },
  command: string
): void {
  console.error(`\n────────────────────────────────────────────────────────────`);
  console.error(`  ⚠️  ${metadata.name} CLI Not Found`);
  console.error(`────────────────────────────────────────────────────────────`);
  console.error(`\n'${metadata.cliBinary} ${command}' failed because the CLI is missing.`);
  console.error(`Please install ${metadata.name} CLI before trying again:\n`);
  console.error(`  ${metadata.installCommand}\n`);
  console.error(`────────────────────────────────────────────────────────────\n`);
}
