/**
 * Chunked File Writer
 *
 * Handles writing large files by splitting content into chunks to avoid
 * Windows command line length limits (OS Error 206).
 *
 * Windows has a ~32,000 character limit for command line arguments.
 * When an AI agent tries to write a large file via PowerShell/shell commands,
 * it can hit this limit, causing retry loops that explode token counts.
 *
 * This utility writes files directly using Node.js fs APIs, bypassing
 * the command line entirely.
 */

import { writeFile, mkdir, unlink, appendFile } from 'node:fs/promises';
import { dirname, join, resolve, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { debug } from '../logging/logger.js';

/**
 * Maximum safe command line length for Windows.
 * We use 20KB as a conservative limit (actual limit is ~32KB).
 */
export const MAX_SAFE_COMMAND_LENGTH = 20 * 1024;

/**
 * Chunk size for splitting large files.
 * Set slightly below MAX_SAFE_COMMAND_LENGTH to account for command overhead.
 */
export const CHUNK_SIZE = 16 * 1024;

/**
 * Options for chunked file writing
 */
export interface ChunkedWriteOptions {
  /** Working directory for relative paths */
  cwd?: string;
  /** Encoding for the file (default: utf-8) */
  encoding?: BufferEncoding;
  /** Whether to create parent directories if they don't exist */
  createDirs?: boolean;
}

/**
 * Result of a chunked write operation
 */
export interface ChunkedWriteResult {
  /** Whether the write was successful */
  success: boolean;
  /** Number of bytes written */
  bytesWritten: number;
  /** Number of chunks used (1 if content was small enough) */
  chunksUsed: number;
  /** Error message if write failed */
  error?: string;
}

/**
 * Validates and resolves a file path, preventing path traversal attacks.
 *
 * @param filePath - The file path to validate
 * @param cwd - The working directory (paths must stay within this)
 * @returns Resolved absolute path
 * @throws Error if path traversal is detected
 */
function validateAndResolvePath(filePath: string, cwd: string): string {
  // Resolve the path to an absolute path
  const absolutePath = resolve(cwd, filePath);
  const normalizedPath = normalize(absolutePath);
  const normalizedCwd = normalize(resolve(cwd));

  // Ensure the resolved path is within the working directory
  const cwdWithSep = normalizedCwd.endsWith(sep) ? normalizedCwd : normalizedCwd + sep;

  if (!normalizedPath.startsWith(cwdWithSep) && normalizedPath !== normalizedCwd) {
    throw new Error(`Security: Path traversal detected. Path "${filePath}" resolves outside working directory.`);
  }

  return normalizedPath;
}

/**
 * Checks if content is large enough to require chunked writing.
 *
 * @param content - The content to check
 * @returns true if content should use chunked writing
 */
export function shouldUseChunkedWrite(content: string): boolean {
  return content.length > MAX_SAFE_COMMAND_LENGTH;
}

/**
 * Writes a file directly using Node.js fs APIs.
 * This bypasses the command line entirely, avoiding length limits.
 *
 * For small files, writes directly.
 * For large files, writes in chunks using a streaming approach.
 *
 * @param filePath - Path to the file to write
 * @param content - Content to write
 * @param options - Write options
 * @returns Result of the write operation
 */
export async function writeFileChunked(
  filePath: string,
  content: string,
  options: ChunkedWriteOptions = {}
): Promise<ChunkedWriteResult> {
  const {
    cwd = process.cwd(),
    encoding = 'utf-8',
    createDirs = true,
  } = options;

  try {
    // Validate and resolve the path
    const resolvedPath = validateAndResolvePath(filePath, cwd);
    debug('[ChunkedWriter] Writing file: %s (%d bytes)', resolvedPath, content.length);

    // Create parent directories if needed
    if (createDirs) {
      const dir = dirname(resolvedPath);
      await mkdir(dir, { recursive: true });
    }

    // For small files, write directly
    if (!shouldUseChunkedWrite(content)) {
      await writeFile(resolvedPath, content, { encoding });
      debug('[ChunkedWriter] Small file written directly');
      return {
        success: true,
        bytesWritten: Buffer.byteLength(content, encoding),
        chunksUsed: 1,
      };
    }

    // For large files, write in chunks using append mode
    debug('[ChunkedWriter] Large file detected, using chunked write');

    // First, create/truncate the file
    await writeFile(resolvedPath, '', { encoding });

    let chunksWritten = 0;
    let offset = 0;

    while (offset < content.length) {
      const chunk = content.slice(offset, offset + CHUNK_SIZE);
      await appendFile(resolvedPath, chunk, { encoding });
      chunksWritten++;
      offset += chunk.length;

      debug('[ChunkedWriter] Wrote chunk %d (%d bytes)', chunksWritten, chunk.length);
    }

    debug('[ChunkedWriter] Large file written in %d chunks', chunksWritten);
    return {
      success: true,
      bytesWritten: Buffer.byteLength(content, encoding),
      chunksUsed: chunksWritten,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug('[ChunkedWriter] Write failed: %s', message);
    return {
      success: false,
      bytesWritten: 0,
      chunksUsed: 0,
      error: message,
    };
  }
}

/**
 * Writes large content to a temporary file and returns the path.
 * Useful when content needs to be passed to an external tool that
 * reads from a file instead of command line arguments.
 *
 * @param content - Content to write
 * @param prefix - Prefix for the temp file name
 * @param extension - File extension (default: .txt)
 * @returns Path to the temporary file
 */
export async function writeToTempFile(
  content: string,
  prefix: string = 'codemachine-',
  extension: string = '.txt'
): Promise<string> {
  const tempDir = join(tmpdir(), 'codemachine-temp');
  await mkdir(tempDir, { recursive: true });

  const filename = `${prefix}${randomUUID()}${extension}`;
  const tempPath = join(tempDir, filename);

  const result = await writeFileChunked(tempPath, content, {
    cwd: tempDir,
    createDirs: true,
  });

  if (!result.success) {
    throw new Error(`Failed to write temp file: ${result.error}`);
  }

  debug('[ChunkedWriter] Created temp file: %s', tempPath);
  return tempPath;
}

/**
 * Cleans up a temporary file created by writeToTempFile.
 *
 * @param tempPath - Path to the temporary file
 */
export async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath);
    debug('[ChunkedWriter] Cleaned up temp file: %s', tempPath);
  } catch {
    // Ignore errors - file may already be deleted
  }
}

/**
 * Estimates if a shell command with the given content would exceed
 * the Windows command line limit.
 *
 * @param commandPrefix - The shell command prefix (e.g., "powershell -Command Set-Content -Path 'file.txt' -Value '")
 * @param content - The content to be passed as an argument
 * @returns true if the total command length would exceed the limit
 */
export function wouldExceedCommandLimit(commandPrefix: string, content: string): boolean {
  // Account for the command prefix, content, and closing characters
  // Add some buffer for escaping and other overhead
  const estimatedLength = commandPrefix.length + content.length + 100;
  return estimatedLength > MAX_SAFE_COMMAND_LENGTH;
}
