import type { Subprocess } from 'bun';
import * as logger from '../../shared/logging/logger.js';

/**
 * Environment variables that should never be overridden by user input.
 * These can be used for code injection or privilege escalation.
 */
const PROTECTED_ENV_VARS = new Set([
  // Unix library injection
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',

  // Shell execution
  'SHELL',
  'BASH_ENV',
  'ENV',
  'ZDOTDIR',

  // Sudo/privilege escalation
  'SUDO_ASKPASS',
  'SSH_ASKPASS',

  // Python code injection
  'PYTHONSTARTUP',
  'PYTHONPATH',

  // Perl code injection
  'PERL5LIB',
  'PERL5OPT',

  // Ruby code injection
  'RUBYLIB',
  'RUBYOPT',

  // Node.js injection
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',

  // Git injection
  'GIT_SSH_COMMAND',
  'GIT_ASKPASS',
  'GIT_EXEC_PATH',

  // General security-sensitive
  'IFS',
  'CDPATH',
  'GLOBIGNORE',
  'SHELLOPTS',
  'BASHOPTS',
  'PROMPT_COMMAND',
]);

/**
 * Sanitize environment variables to prevent injection attacks.
 * Removes protected variables and validates values.
 */
function sanitizeEnv(userEnv: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  if (!userEnv) {
    return process.env;
  }

  const sanitized: NodeJS.ProcessEnv = { ...process.env };

  for (const [key, value] of Object.entries(userEnv)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Block protected variables
    const upperKey = key.toUpperCase();
    if (PROTECTED_ENV_VARS.has(upperKey)) {
      logger.warn(`Security: Blocked attempt to set protected env var: ${key}`);
      continue;
    }

    // Block variables that look like injection attempts (e.g., contain command separators)
    // Allow PATH override but sanitize it (common legitimate use case)
    if (upperKey !== 'PATH' && upperKey !== 'HOME' && upperKey !== 'USER') {
      // Check for shell metacharacters that could enable command injection
      // when variables are expanded in shell contexts
      if (value.includes('$(') || value.includes('`') || value.includes('\n')) {
        logger.warn(`Security: Blocked suspicious env var value for ${key}`);
        continue;
      }
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export interface SpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
  stdioMode?: 'pipe' | 'inherit';
  timeout?: number; // Timeout in milliseconds
  stdinInput?: string; // Data to write to stdin
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Global registry of active child processes
 * Used to ensure proper cleanup on process termination
 */
const activeProcesses = new Set<Subprocess>();

function resolveCommandExecutable(command: string): string {
  // If command already specifies a path (relative or absolute), use it as-is
  const hasPathSeparator = command.includes('/') || command.includes('\\');
  if (hasPathSeparator) {
    return command;
  }

  const resolved = (() => {
    try {
      return Bun.which(command) ?? undefined;
    } catch {
      return undefined;
    }
  })();

  if (resolved) {
    return resolved;
  }

  if (command === 'bun' && typeof process.execPath === 'string' && process.execPath.length > 0) {
    return process.execPath;
  }

  return command;
}

/**
 * Kill all active child processes
 * Called during cleanup to ensure no orphaned processes
 */
export function killAllActiveProcesses(): void {
  for (const child of activeProcesses) {
    try {
      child.kill('SIGTERM');
      // Force kill after 1 second if still running
      setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        } catch {
          // Process already dead
        }
      }, 1000);
    } catch {
      // Ignore errors during cleanup
    }
  }
  activeProcesses.clear();
}

export function spawnProcess(options: SpawnOptions): Promise<SpawnResult> {
  const { command, args = [], cwd, env, onStdout, onStderr, signal, stdioMode = 'pipe', timeout, stdinInput } = options;

  // Pre-encode stdin upfront if provided. We avoid manual piping because Bun's FileSink
  // requires flush semantics that were dropping data in practice.
  const stdinEncoded = stdinInput !== undefined
    ? new TextEncoder().encode(stdinInput)
    : undefined;

  return new Promise((resolve, reject) => {
    // Track if process was aborted to handle close event correctly
    let wasAborted = false;
    let timeoutId: Timer | undefined;
    let abortReason: Error | undefined;

    // Use external signal directly or create internal one for timeout only
    // This eliminates the double AbortController layer for faster abort propagation
    const timeoutController = !signal && timeout ? new AbortController() : undefined;
    const effectiveSignal = signal || timeoutController?.signal;

    // Handle timeout
    if (timeout && timeoutController) {
      timeoutId = setTimeout(() => {
        logger.debug(`Process ${command} timed out after ${timeout}ms`);
        abortReason = new Error(`Process timed out after ${timeout}ms`);
        timeoutController.abort(abortReason);
      }, timeout);
    }

    // Spawn the process using Bun.spawn()
    // Bun automatically handles .cmd files on Windows (like cross-spawn)
    const executable = resolveCommandExecutable(command);
    const child = Bun.spawn([executable, ...args], {
      cwd,
      // Sanitize env vars to prevent injection attacks (blocks LD_PRELOAD, NODE_OPTIONS, etc.)
      env: sanitizeEnv(env),
      // When inheriting stdio, inherit stdin too (needed for interactive TUI apps like Ink)
      stdin: stdinEncoded ?? (stdioMode === 'inherit' ? 'inherit' : 'ignore'),
      stdout: stdioMode === 'inherit' ? 'inherit' : 'pipe',
      stderr: stdioMode === 'inherit' ? 'inherit' : 'pipe',
      // Note: Bun doesn't have detached option, but we can still kill process groups manually
    });

    // Track this child process for cleanup
    activeProcesses.add(child);

    // Remove from tracking when process exits
    const removeFromTracking = () => {
      activeProcesses.delete(child);
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Handle abort signal directly (no double controller layer for faster propagation)
    if (effectiveSignal) {
      const abortHandler = () => {
        logger.debug(`Abort handler called for ${command} (PID: ${child.pid}, killed: ${child.killed})`);
        wasAborted = true;
        abortReason = effectiveSignal.reason || new Error('Process aborted');

        // Kill process group on Unix (for wrapper scripts like CCR)
        if (process.platform !== 'win32' && child.pid) {
          try {
            // Kill process group (negative PID kills the entire group)
            logger.debug(`Killing process group -${child.pid} with SIGTERM`);
            process.kill(-child.pid, 'SIGTERM');

            // Force kill after 100ms if still running
            setTimeout(() => {
              try {
                logger.debug(`Force killing process group -${child.pid} with SIGKILL`);
                process.kill(-child.pid!, 'SIGKILL');
              } catch (err) {
                // Process group already dead, ignore
                logger.debug(`Force kill failed (process already dead): ${err instanceof Error ? err.message : String(err)}`);
              }
            }, 100);
          } catch (err) {
            // Fallback to killing just the process
            logger.debug(`Process group kill failed, falling back to child.kill(): ${err instanceof Error ? err.message : String(err)}`);
            if (!child.killed) {
              child.kill('SIGTERM');
            }
          }
        } else if (!child.killed) {
          // Windows or no PID: use child.kill()
          logger.debug(`Killing process ${command} (PID: ${child.pid}) with child.kill()`);
          try {
            child.kill('SIGTERM');
            // Force kill after 100ms if still running
            setTimeout(() => {
              try {
                if (!child.killed) {
                  logger.debug(`Force killing process ${command} with SIGKILL`);
                  child.kill('SIGKILL');
                }
              } catch {
                // Process already dead
              }
            }, 100);
          } catch {
            // Ignore kill errors
          }
        } else {
          logger.debug(`Process ${command} already killed, skipping manual kill`);
        }
      };

      if (effectiveSignal.aborted) {
        abortHandler();
      } else {
        effectiveSignal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    // Handle stdout/stderr streaming for pipe mode
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    (async () => {
      try {
        // Stream stdout and stderr in parallel
        const streamPromises: Promise<void>[] = [];

        if (stdioMode === 'pipe' && child.stdout) {
          streamPromises.push(
            (async () => {
              const reader = child.stdout!.getReader();
              const decoder = new TextDecoder();

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                stdoutChunks.push(text);
                onStdout?.(text);
              }
            })()
          );
        }

        if (stdioMode === 'pipe' && child.stderr) {
          streamPromises.push(
            (async () => {
              const reader = child.stderr!.getReader();
              const decoder = new TextDecoder();

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                stderrChunks.push(text);
                onStderr?.(text);
              }
            })()
          );
        }

        // Wait for all streams and process exit in parallel
        const [exitCode] = await Promise.all([
          child.exited,
          ...streamPromises
        ]);

        logger.debug(`Process exit for ${command} (PID: ${child.pid}), code: ${exitCode}, wasAborted: ${wasAborted}`);
        removeFromTracking();

        // If process was aborted, reject the promise
        if (wasAborted) {
          logger.debug(`Process ${command} was aborted, rejecting with AbortError`);
          reject(abortReason || new Error('Process aborted'));
          return;
        }

        resolve({
          exitCode,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
        });
      } catch (error) {
        logger.debug(`Process error for ${command}: ${error instanceof Error ? error.message : String(error)}`);
        removeFromTracking();
        reject(error);
      }
    })();
  });
}
