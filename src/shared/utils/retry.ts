/**
 * Retry utilities for recoverable operations
 *
 * Provides exponential backoff retry logic for transient failures.
 */

import { DatabaseBusyError } from '../errors/index.js';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 50) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 2000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Custom check for retryable errors */
  isRetryable?: (error: unknown) => boolean;
  /** Called on each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 50,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * const result = await withRetry(
 *   () => db.prepare('SELECT * FROM agents').all(),
 *   { maxAttempts: 5, isRetryable: DatabaseBusyError.isBusyError }
 * );
 */
export async function withRetry<T>(
  operation: () => T | Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
  } = { ...DEFAULT_OPTIONS, ...options };

  const isRetryable = options?.isRetryable ?? (() => false);
  const onRetry = options?.onRetry;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = attempt < maxAttempts && isRetryable(error);

      if (!shouldRetry) {
        throw error;
      }

      // Calculate delay and wait
      const delayMs = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      );

      onRetry?.(attempt, error, delayMs);

      await sleep(delayMs);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Pre-configured retry for SQLite database operations
 *
 * Uses DatabaseBusyError.isBusyError for checking retryable conditions.
 *
 * @example
 * const result = await withDatabaseRetry(() =>
 *   db.prepare('INSERT INTO agents...').run(...)
 * );
 */
export async function withDatabaseRetry<T>(
  operation: () => T | Promise<T>,
  options?: Omit<RetryOptions, 'isRetryable'>
): Promise<T> {
  return withRetry(operation, {
    maxAttempts: 5,
    initialDelayMs: 50,
    maxDelayMs: 2000,
    ...options,
    isRetryable: DatabaseBusyError.isBusyError,
  });
}

/**
 * Synchronous retry for database operations
 *
 * Note: Uses busy-wait, prefer async version when possible.
 */
export function withDatabaseRetrySync<T>(
  operation: () => T,
  options?: Omit<RetryOptions, 'isRetryable' | 'onRetry'>
): T {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
  } = { ...DEFAULT_OPTIONS, maxAttempts: 5, ...options };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts && DatabaseBusyError.isBusyError(error)) {
        const delayMs = calculateDelay(
          attempt,
          initialDelayMs,
          maxDelayMs,
          backoffMultiplier
        );

        // Synchronous sleep using Atomics (Bun supports this)
        const buffer = new SharedArrayBuffer(4);
        const view = new Int32Array(buffer);
        Atomics.wait(view, 0, 0, delayMs);

        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
