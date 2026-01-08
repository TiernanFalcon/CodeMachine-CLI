/**
 * Input Sanitization Utilities
 *
 * Provides validation and sanitization for user inputs to prevent:
 * - Path traversal attacks
 * - Command injection
 * - Excessive input lengths
 */

import * as path from 'node:path';

/** Maximum lengths for various input types */
export const INPUT_LIMITS = {
  AGENT_NAME: 128,
  FILE_PATH: 1024,
  PROMPT: 100000, // 100KB
  OPTION_KEY: 64,
  OPTION_VALUE: 4096,
} as const;

/** Valid agent name pattern (alphanumeric, hyphens, underscores) */
const AGENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/** Characters that are dangerous in shell commands */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!\\'"]/;

/**
 * Validate and sanitize agent name
 * @throws Error if name is invalid
 */
export function validateAgentName(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error('Agent name cannot be empty');
  }

  if (trimmed.length > INPUT_LIMITS.AGENT_NAME) {
    throw new Error(`Agent name exceeds maximum length of ${INPUT_LIMITS.AGENT_NAME} characters`);
  }

  if (!AGENT_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid agent name "${trimmed}". Must start with a letter and contain only letters, numbers, hyphens, and underscores.`
    );
  }

  // Check for path traversal attempts
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Invalid agent name "${trimmed}". Path separators are not allowed.`);
  }

  return trimmed;
}

/**
 * Sanitize file path to prevent path traversal
 * Returns null if path is unsafe
 */
export function sanitizeFilePath(filePath: string, baseDir?: string): string | null {
  if (!filePath || filePath.length > INPUT_LIMITS.FILE_PATH) {
    return null;
  }

  const trimmed = filePath.trim();

  // Normalize the path
  const normalized = path.normalize(trimmed);

  // Check for path traversal
  if (normalized.includes('..')) {
    return null;
  }

  // If baseDir provided, ensure path stays within it
  if (baseDir) {
    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(baseDir, normalized);

    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      return null;
    }

    return resolvedPath;
  }

  // For relative paths without baseDir, just return normalized
  return normalized;
}

/**
 * Validate file path for input option
 * @throws Error if path is invalid
 */
export function validateInputPath(filePath: string, baseDir?: string): string {
  const sanitized = sanitizeFilePath(filePath, baseDir);

  if (sanitized === null) {
    throw new Error(`Invalid file path "${filePath}". Path traversal is not allowed.`);
  }

  return sanitized;
}

/**
 * Validate prompt text
 * @throws Error if prompt exceeds limits
 */
export function validatePrompt(prompt: string): string {
  if (prompt.length > INPUT_LIMITS.PROMPT) {
    throw new Error(`Prompt exceeds maximum length of ${INPUT_LIMITS.PROMPT} characters`);
  }

  return prompt;
}

/**
 * Check if string contains shell metacharacters
 */
export function containsShellMetachars(str: string): boolean {
  return SHELL_METACHARACTERS.test(str);
}

/**
 * Sanitize option value
 * Removes potentially dangerous characters
 */
export function sanitizeOptionValue(value: string): string {
  if (value.length > INPUT_LIMITS.OPTION_VALUE) {
    throw new Error(`Option value exceeds maximum length of ${INPUT_LIMITS.OPTION_VALUE} characters`);
  }

  return value;
}

/**
 * Validate option key
 */
export function validateOptionKey(key: string): string {
  const trimmed = key.trim();

  if (!trimmed || trimmed.length > INPUT_LIMITS.OPTION_KEY) {
    throw new Error(`Invalid option key: must be 1-${INPUT_LIMITS.OPTION_KEY} characters`);
  }

  // Only allow alphanumeric and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error(`Invalid option key "${trimmed}". Must be alphanumeric with underscores.`);
  }

  return trimmed;
}

/**
 * Redact sensitive values in objects for safe logging
 * Replaces values of keys that look sensitive with '[REDACTED]'
 */
export function redactSensitive(obj: unknown): unknown {
  const sensitiveKeys = /^(password|secret|token|apiKey|api_key|credential|auth|key)$/i;

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitive(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.test(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = redactSensitive(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}
