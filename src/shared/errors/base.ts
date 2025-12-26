/**
 * Base error class for all CodeMachine errors
 *
 * Provides:
 * - Consistent error naming
 * - Error code for programmatic handling
 * - Cause chaining for wrapped errors
 * - Proper stack trace capture
 */
export abstract class CodeMachineError extends Error {
  /** Unique error code for programmatic handling */
  abstract readonly code: string;

  /** Whether this error is recoverable (can be retried) */
  readonly recoverable: boolean;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      recoverable?: boolean;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.recoverable = options?.recoverable ?? false;

    // Maintains proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get the full error chain as an array
   */
  getErrorChain(): Error[] {
    const chain: Error[] = [this];
    let current: unknown = this.cause;

    while (current instanceof Error) {
      chain.push(current);
      current = current.cause;
    }

    return chain;
  }

  /**
   * Get a formatted message including the error chain
   */
  getFullMessage(): string {
    const chain = this.getErrorChain();
    if (chain.length === 1) {
      return this.message;
    }

    return chain
      .map((err, i) => (i === 0 ? err.message : `  Caused by: ${err.message}`))
      .join('\n');
  }
}
