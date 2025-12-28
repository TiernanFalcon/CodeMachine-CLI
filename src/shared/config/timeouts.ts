/**
 * Centralized Timeout Constants
 *
 * All timeout values used throughout the codebase are defined here
 * to ensure consistency and easy configuration.
 */

// =============================================================================
// CLI and Process Timeouts
// =============================================================================

/**
 * Timeout for checking if CLI is installed (ms)
 * Used when running --version to verify CLI availability
 */
export const CLI_CHECK_TIMEOUT_MS = 3000;

/**
 * Default process execution timeout (ms)
 * Used for general subprocess execution
 */
export const DEFAULT_PROCESS_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Force kill timeout after SIGTERM (ms)
 * Time to wait before sending SIGKILL after SIGTERM
 */
export const FORCE_KILL_TIMEOUT_MS = 1000;

/**
 * Force kill delay for cleanup (ms)
 */
export const FORCE_KILL_DELAY_MS = 100;

// =============================================================================
// Workflow and Step Timeouts
// =============================================================================

/**
 * Default workflow step execution timeout (ms)
 * Maximum time a single step can run
 */
export const DEFAULT_STEP_TIMEOUT_MS = 1800000; // 30 minutes

// =============================================================================
// Lock and Database Timeouts
// =============================================================================

/**
 * Stale lock timeout (ms)
 * Time after which a lock is considered stale and can be stolen
 */
export const STALE_LOCK_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Minimum retry delay for lock acquisition (ms)
 */
export const LOCK_RETRY_MIN_DELAY_MS = 100;

/**
 * Maximum retry delay for lock acquisition (ms)
 */
export const LOCK_RETRY_MAX_DELAY_MS = 500;

/**
 * SQLite busy timeout (ms)
 * How long SQLite waits for a locked database
 */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

// =============================================================================
// UI and Spinner Timeouts
// =============================================================================

/**
 * Spinner show threshold (ms)
 * Minimum elapsed time before showing spinner
 */
export const SPINNER_SHOW_THRESHOLD_MS = 2000;

/**
 * Minimum time between spinner renders (ms)
 */
export const SPINNER_MIN_CLEAR_TIME_MS = 1000;

/**
 * Spinner update interval (ms)
 */
export const SPINNER_INTERVAL_MS = 100;

/**
 * Log stream polling interval (ms)
 */
export const LOG_STREAM_POLL_INTERVAL_MS = 500;

/**
 * Toast notification durations (ms)
 */
export const TOAST_DURATION = {
  SHORT: 1500,
  MEDIUM: 2000,
  LONG: 3000,
} as const;

/**
 * Dialog transition delays (ms)
 */
export const DIALOG_DELAY = {
  QUICK: 500,
  NORMAL: 800,
  SLOW: 1500,
  LONG: 2000,
} as const;

/**
 * UI debounce/throttle delays (ms)
 */
export const UI_DELAY = {
  TICK: 100,
  DEBOUNCE: 200,
  HISTORY_PAUSE: 2000,
} as const;

/**
 * Resource monitor interval (ms)
 */
export const RESOURCE_MONITOR_INTERVAL_MS = 10000; // 10 seconds

/**
 * Health check timeout (ms)
 */
export const HEALTH_CHECK_TIMEOUT_MS = 10000;

// =============================================================================
// Cache TTLs
// =============================================================================

/**
 * Engine authentication cache TTL (ms)
 * How long to cache auth status before re-checking
 * Configurable via CODEMACHINE_AUTH_CACHE_TTL_MS environment variable
 */
export function getAuthCacheTtlMs(): number {
  const envValue = process.env.CODEMACHINE_AUTH_CACHE_TTL_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 5 * 60 * 1000; // 5 minutes default
}

/**
 * Default auth cache TTL (ms) - used when env var is not set
 */
export const DEFAULT_AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Retry Configuration
// =============================================================================

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  maxAttempts: 5,
  /** Initial delay between retries (ms) */
  initialDelayMs: 50,
  /** Maximum delay between retries (ms) */
  maxDelayMs: 2000,
  /** Backoff multiplier */
  backoffMultiplier: 2,
} as const;

/**
 * Database retry configuration
 */
export const DATABASE_RETRY_CONFIG = {
  maxAttempts: 5,
  initialDelayMs: 50,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
} as const;
