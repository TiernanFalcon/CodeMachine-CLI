/**
 * Centralized String and Data Limits
 *
 * All truncation lengths, buffer sizes, and other limits
 * are defined here for consistency.
 */

// =============================================================================
// String Truncation Limits
// =============================================================================

/**
 * Short truncation for UI display (single line)
 */
export const TRUNCATE_SHORT = 50;

/**
 * Medium truncation for logs and descriptions
 */
export const TRUNCATE_MEDIUM = 100;

/**
 * Standard truncation for database storage
 */
export const TRUNCATE_STANDARD = 500;

/**
 * Long truncation for memory storage
 */
export const TRUNCATE_LONG = 2000;

/**
 * Maximum output length for agent memory
 */
export const MAX_MEMORY_OUTPUT_LENGTH = 2000;

/**
 * Maximum prompt length for database storage
 */
export const MAX_DB_PROMPT_LENGTH = 500;

/**
 * Maximum summary content length
 */
export const MAX_SUMMARY_LENGTH = 500;

// =============================================================================
// Buffer and Batch Limits
// =============================================================================

/**
 * Maximum lines in output buffer before flush
 */
export const MAX_OUTPUT_BUFFER_LINES = 1000;

/**
 * Maximum characters per line in output
 */
export const MAX_LINE_LENGTH = 2000;

/**
 * Maximum file read lines (default)
 */
export const MAX_FILE_READ_LINES = 2000;

/**
 * Maximum event history size for event bus
 */
export const MAX_EVENT_HISTORY_SIZE = 1000;

/**
 * Log rotation configuration
 */
export const LOG_ROTATION = {
  /** Maximum log file size in bytes (10MB) */
  MAX_SIZE_BYTES: 10 * 1024 * 1024,
  /** Number of backup files to keep */
  MAX_BACKUPS: 5,
  /** Write count interval for rotation checks */
  CHECK_INTERVAL: 100,
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncate a string to the specified length with ellipsis
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length (default: TRUNCATE_STANDARD)
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns Truncated string
 */
export function truncate(
  str: string,
  maxLength: number = TRUNCATE_STANDARD,
  suffix: string = '...'
): string {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate from the end of a string (keep last N characters)
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param prefix - Prefix to add when truncated (default: '...')
 * @returns Truncated string
 */
export function truncateStart(
  str: string,
  maxLength: number = TRUNCATE_STANDARD,
  prefix: string = '...'
): string {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return prefix + str.slice(-(maxLength - prefix.length));
}

/**
 * Truncate in the middle of a string
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param separator - Separator in the middle (default: '...')
 * @returns Truncated string
 */
export function truncateMiddle(
  str: string,
  maxLength: number = TRUNCATE_STANDARD,
  separator: string = '...'
): string {
  if (!str || str.length <= maxLength) {
    return str;
  }

  const charsToShow = maxLength - separator.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return str.slice(0, frontChars) + separator + str.slice(-backChars);
}
