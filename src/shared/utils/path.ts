import { homedir } from 'node:os';
import * as path from 'node:path';

/**
 * Expands platform-specific home directory variables in a path.
 *
 * Supported variables:
 * - Linux/Mac: $HOME
 * - Windows CMD: %USERPROFILE%
 * - Windows PowerShell: $env:USERPROFILE
 *
 * @param pathStr - The path string that may contain home directory variables
 * @returns The path with home directory variables expanded
 */
export function expandHomeDir(pathStr: string): string {
  if (!pathStr) {
    return pathStr;
  }

  const homeDirectory = homedir();

  // Replace Unix-style $HOME
  let expanded = pathStr.replace(/\$HOME/g, homeDirectory);

  // Replace Windows CMD-style %USERPROFILE%
  expanded = expanded.replace(/%USERPROFILE%/g, homeDirectory);

  // Replace PowerShell-style $env:USERPROFILE
  expanded = expanded.replace(/\$env:USERPROFILE/g, homeDirectory);

  return expanded;
}

/**
 * Error thrown when path traversal is detected
 */
export class PathTraversalError extends Error {
  constructor(
    public readonly requestedPath: string,
    public readonly baseDir: string,
    public readonly resolvedPath: string
  ) {
    super(
      `Path traversal detected: requested path "${requestedPath}" resolves to "${resolvedPath}" ` +
      `which is outside the allowed directory "${baseDir}"`
    );
    this.name = 'PathTraversalError';
  }
}

/**
 * Safely resolve a path within a base directory, preventing path traversal attacks.
 *
 * This function ensures that the resolved path stays within the specified base directory,
 * preventing attackers from using sequences like "../" to access files outside the
 * allowed directory.
 *
 * @param baseDir - The base directory that all paths must stay within
 * @param requestedPath - The user-supplied path (can be relative or absolute)
 * @returns The validated absolute path
 * @throws {PathTraversalError} If the resolved path escapes the base directory
 *
 * @example
 * // Valid paths
 * safeResolvePath('/project', 'src/file.ts')     // '/project/src/file.ts'
 * safeResolvePath('/project', './src/file.ts')   // '/project/src/file.ts'
 * safeResolvePath('/project', 'src/../file.ts')  // '/project/file.ts' (normalized but still inside)
 *
 * // Invalid paths (throw PathTraversalError)
 * safeResolvePath('/project', '../etc/passwd')   // Throws - escapes base dir
 * safeResolvePath('/project', '/etc/passwd')     // Throws - absolute path outside base
 */
export function safeResolvePath(baseDir: string, requestedPath: string): string {
  // Normalize the base directory to absolute path
  const normalizedBase = path.resolve(baseDir);

  // Resolve the requested path relative to the base
  // If requestedPath is absolute, path.resolve returns it as-is
  const resolvedPath = path.isAbsolute(requestedPath)
    ? path.normalize(requestedPath)
    : path.resolve(normalizedBase, requestedPath);

  // Normalize to handle any remaining ".." sequences
  const normalizedResolved = path.normalize(resolvedPath);

  // Check if the resolved path starts with the base directory
  // We add a path separator to prevent false positives like:
  // baseDir: /project, resolvedPath: /project-other/file.ts
  const baseWithSep = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;

  // The resolved path is safe if:
  // 1. It equals the base directory exactly, OR
  // 2. It starts with the base directory + separator
  const isWithinBase =
    normalizedResolved === normalizedBase ||
    normalizedResolved.startsWith(baseWithSep);

  if (!isWithinBase) {
    throw new PathTraversalError(requestedPath, normalizedBase, normalizedResolved);
  }

  return normalizedResolved;
}

/**
 * Check if a path would escape the base directory without throwing.
 *
 * @param baseDir - The base directory to check against
 * @param requestedPath - The path to validate
 * @returns true if the path is safe (within base), false if it would escape
 */
export function isPathWithinBase(baseDir: string, requestedPath: string): boolean {
  try {
    safeResolvePath(baseDir, requestedPath);
    return true;
  } catch {
    return false;
  }
}
