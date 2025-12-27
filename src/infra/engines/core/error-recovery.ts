/**
 * Provider-Specific Error Recovery
 *
 * Centralized error classification, recovery strategies, and
 * provider-specific error handling for all engine implementations.
 *
 * ## Features
 * - Automatic error classification based on provider-specific patterns
 * - Configurable retry strategies with exponential backoff
 * - Provider-specific retry configurations
 * - Error chain tracking for debugging
 *
 * ## Usage
 *
 * ### Basic Error Classification
 * ```typescript
 * import { classifyError, toEngineError } from './error-recovery';
 *
 * try {
 *   await runEngine();
 * } catch (error) {
 *   const engineError = toEngineError(error, 'claude');
 *   console.log(`Category: ${engineError.category}`);
 *   console.log(`Strategy: ${engineError.strategy}`);
 * }
 * ```
 *
 * ### Automatic Recovery
 * ```typescript
 * import { withRecovery } from './error-recovery';
 *
 * const result = await withRecovery(
 *   () => riskyOperation(),
 *   'claude',
 *   {
 *     maxRetries: 3,
 *     onRetry: (context, delay) => {
 *       console.log(`Retrying in ${delay}ms (attempt ${context.attempt})`);
 *     },
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Operation succeeded:', result.value);
 * } else {
 *   console.log('Operation failed:', result.error?.message);
 * }
 * ```
 *
 * ### Creating Specific Errors
 * ```typescript
 * import { EngineError } from './error-recovery';
 *
 * throw EngineError.rateLimit('claude', 60);  // Retry after 60s
 * throw EngineError.auth('gemini', 'Invalid API key');
 * throw EngineError.contextLength('codex', 100000, 150000);
 * ```
 *
 * @module error-recovery
 */

import { CodeMachineError } from '../../../shared/errors/base.js';

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'rate_limit'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'validation'
  | 'quota_exceeded'
  | 'service_unavailable'
  | 'model_not_found'
  | 'context_length'
  | 'content_filter'
  | 'unknown';

/**
 * Recovery strategy types
 */
export type RecoveryStrategy =
  | 'retry_immediate'
  | 'retry_backoff'
  | 'retry_after'
  | 'reauthenticate'
  | 'fallback_model'
  | 'reduce_context'
  | 'abort'
  | 'user_intervention';

/**
 * Engine error with classification and recovery information
 */
export class EngineError extends CodeMachineError {
  readonly code = 'ENGINE_ERROR';
  readonly recoverable: boolean;

  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly engineId: string,
    public readonly strategy: RecoveryStrategy,
    public readonly details?: EngineErrorDetails,
    cause?: Error
  ) {
    super(message, { cause, recoverable: isRecoverableCategory(category) });
    this.recoverable = isRecoverableCategory(category);
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(
    engineId: string,
    retryAfterSeconds?: number,
    cause?: Error
  ): EngineError {
    const message = retryAfterSeconds
      ? `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`
      : 'Rate limit exceeded. Please try again later.';

    return new EngineError(
      message,
      'rate_limit',
      engineId,
      retryAfterSeconds ? 'retry_after' : 'retry_backoff',
      { retryAfterSeconds },
      cause
    );
  }

  /**
   * Create an authentication error
   */
  static auth(engineId: string, reason: string, cause?: Error): EngineError {
    return new EngineError(
      `Authentication failed: ${reason}`,
      'auth',
      engineId,
      'reauthenticate',
      { authReason: reason },
      cause
    );
  }

  /**
   * Create a network error
   */
  static network(engineId: string, details: string, cause?: Error): EngineError {
    return new EngineError(
      `Network error: ${details}`,
      'network',
      engineId,
      'retry_backoff',
      { networkDetails: details },
      cause
    );
  }

  /**
   * Create a timeout error
   */
  static timeout(engineId: string, timeoutMs: number, cause?: Error): EngineError {
    return new EngineError(
      `Request timed out after ${timeoutMs}ms`,
      'timeout',
      engineId,
      'retry_immediate',
      { timeoutMs },
      cause
    );
  }

  /**
   * Create a context length error
   */
  static contextLength(
    engineId: string,
    maxTokens: number,
    requestedTokens?: number,
    cause?: Error
  ): EngineError {
    const message = requestedTokens
      ? `Context length exceeded: ${requestedTokens} tokens requested, max ${maxTokens}`
      : `Context length exceeded: max ${maxTokens} tokens`;

    return new EngineError(
      message,
      'context_length',
      engineId,
      'reduce_context',
      { maxTokens, requestedTokens },
      cause
    );
  }

  /**
   * Create a model not found error
   */
  static modelNotFound(engineId: string, model: string, cause?: Error): EngineError {
    return new EngineError(
      `Model not found: ${model}`,
      'model_not_found',
      engineId,
      'fallback_model',
      { model },
      cause
    );
  }

  /**
   * Create a content filter error
   */
  static contentFilter(engineId: string, reason: string, cause?: Error): EngineError {
    return new EngineError(
      `Content filtered: ${reason}`,
      'content_filter',
      engineId,
      'user_intervention',
      { filterReason: reason },
      cause
    );
  }

  /**
   * Create a service unavailable error
   */
  static serviceUnavailable(engineId: string, cause?: Error): EngineError {
    return new EngineError(
      'Service temporarily unavailable',
      'service_unavailable',
      engineId,
      'retry_backoff',
      undefined,
      cause
    );
  }
}

/**
 * Additional details for engine errors
 */
export interface EngineErrorDetails {
  retryAfterSeconds?: number;
  authReason?: string;
  networkDetails?: string;
  timeoutMs?: number;
  maxTokens?: number;
  requestedTokens?: number;
  model?: string;
  filterReason?: string;
  httpStatus?: number;
  errorCode?: string;
}

/**
 * Provider-specific error patterns for classification
 */
interface ErrorPattern {
  patterns: (string | RegExp)[];
  category: ErrorCategory;
  strategy: RecoveryStrategy;
  extractRetryAfter?: (message: string) => number | undefined;
}

/**
 * Provider-specific error pattern definitions
 */
const PROVIDER_ERROR_PATTERNS: Record<string, ErrorPattern[]> = {
  claude: [
    {
      patterns: ['rate_limit', 'rate limit', '429', 'too many requests'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
      extractRetryAfter: extractRetryAfterSeconds,
    },
    {
      patterns: ['invalid_api_key', 'authentication', 'unauthorized', '401'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
    {
      patterns: ['overloaded', 'service_unavailable', '503', '529'],
      category: 'service_unavailable',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['context_length', 'max_tokens', 'too long'],
      category: 'context_length',
      strategy: 'reduce_context',
    },
    {
      patterns: ['model not found', 'invalid model', 'model_not_found'],
      category: 'model_not_found',
      strategy: 'fallback_model',
    },
    {
      patterns: ['content_policy', 'safety', 'harmful'],
      category: 'content_filter',
      strategy: 'user_intervention',
    },
  ],

  gemini: [
    {
      patterns: ['RESOURCE_EXHAUSTED', '429', 'quota', 'rate limit'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
      extractRetryAfter: extractRetryAfterSeconds,
    },
    {
      patterns: ['PERMISSION_DENIED', 'invalid api key', 'api_key_invalid', '401', '403'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
    {
      patterns: ['UNAVAILABLE', '503', 'service unavailable'],
      category: 'service_unavailable',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['INVALID_ARGUMENT', 'context window', 'token limit'],
      category: 'context_length',
      strategy: 'reduce_context',
    },
    {
      patterns: ['NOT_FOUND', 'model not supported'],
      category: 'model_not_found',
      strategy: 'fallback_model',
    },
    {
      patterns: ['SAFETY', 'blocked', 'harm_category'],
      category: 'content_filter',
      strategy: 'user_intervention',
    },
  ],

  codex: [
    {
      patterns: ['rate_limit', 'rate limit exceeded', '429'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
      extractRetryAfter: extractRetryAfterSeconds,
    },
    {
      patterns: ['invalid_api_key', 'authentication', '401'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
    {
      patterns: ['server_error', '500', '502', '503', '504'],
      category: 'service_unavailable',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['context_length_exceeded', 'maximum context'],
      category: 'context_length',
      strategy: 'reduce_context',
    },
    {
      patterns: ['model_not_found', 'invalid model'],
      category: 'model_not_found',
      strategy: 'fallback_model',
    },
  ],

  opencode: [
    {
      patterns: ['rate limit', '429', 'too many requests'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['unauthorized', 'invalid token', '401'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
    {
      patterns: ['service unavailable', '503'],
      category: 'service_unavailable',
      strategy: 'retry_backoff',
    },
  ],

  cursor: [
    {
      patterns: ['rate limit', '429'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['authentication', 'unauthorized', '401'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
  ],

  ccr: [
    {
      patterns: ['rate limit', '429'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['authentication', 'unauthorized'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
  ],

  auggie: [
    {
      patterns: ['rate limit', '429'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['authentication', 'unauthorized'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
  ],

  // Default patterns for unknown providers
  default: [
    {
      patterns: ['rate limit', '429', 'too many requests'],
      category: 'rate_limit',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['unauthorized', 'authentication', '401', '403'],
      category: 'auth',
      strategy: 'reauthenticate',
    },
    {
      patterns: ['timeout', 'timed out', 'ETIMEDOUT'],
      category: 'timeout',
      strategy: 'retry_immediate',
    },
    {
      patterns: ['ECONNREFUSED', 'ENOTFOUND', 'network', 'connection'],
      category: 'network',
      strategy: 'retry_backoff',
    },
    {
      patterns: ['500', '502', '503', '504', 'service unavailable'],
      category: 'service_unavailable',
      strategy: 'retry_backoff',
    },
  ],
};

/**
 * Extract retry-after seconds from error message
 */
function extractRetryAfterSeconds(message: string): number | undefined {
  // Match patterns like "retry after 60 seconds", "retry_after: 60", "Retry-After: 60"
  const patterns = [
    /retry.?after[:\s]+(\d+)/i,
    /wait[:\s]+(\d+)\s*seconds/i,
    /(\d+)\s*seconds?\s*(?:until|before)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const seconds = parseInt(match[1], 10);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds;
      }
    }
  }

  return undefined;
}

/**
 * Check if a category is recoverable
 */
function isRecoverableCategory(category: ErrorCategory): boolean {
  switch (category) {
    case 'rate_limit':
    case 'network':
    case 'timeout':
    case 'service_unavailable':
      return true;
    case 'auth':
    case 'validation':
    case 'quota_exceeded':
    case 'model_not_found':
    case 'context_length':
    case 'content_filter':
    case 'unknown':
      return false;
  }
}

/**
 * Classify an error for a specific provider
 */
export function classifyError(
  error: Error | string,
  engineId: string
): { category: ErrorCategory; strategy: RecoveryStrategy; retryAfterSeconds?: number } {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();

  // Get patterns for this engine, fallback to default
  const patterns = PROVIDER_ERROR_PATTERNS[engineId] ?? PROVIDER_ERROR_PATTERNS.default;

  for (const pattern of patterns) {
    for (const p of pattern.patterns) {
      const matches =
        typeof p === 'string' ? lowerMessage.includes(p.toLowerCase()) : p.test(message);

      if (matches) {
        const retryAfterSeconds = pattern.extractRetryAfter?.(message);
        return {
          category: pattern.category,
          strategy: retryAfterSeconds ? 'retry_after' : pattern.strategy,
          retryAfterSeconds,
        };
      }
    }
  }

  return { category: 'unknown', strategy: 'abort' };
}

/**
 * Create an EngineError from any error
 */
export function toEngineError(error: unknown, engineId: string): EngineError {
  // Already an EngineError
  if (error instanceof EngineError) {
    return error;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  const { category, strategy, retryAfterSeconds } = classifyError(err, engineId);

  return new EngineError(err.message, category, engineId, strategy, { retryAfterSeconds }, err);
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Add jitter to delays */
  jitter: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Provider-specific retry configurations
 */
export const PROVIDER_RETRY_CONFIGS: Record<string, Partial<RetryConfig>> = {
  claude: {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 120000,
  },
  gemini: {
    maxRetries: 4,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
  },
  codex: {
    maxRetries: 3,
    initialDelayMs: 1500,
    maxDelayMs: 90000,
  },
};

/**
 * Get retry config for a provider
 */
export function getRetryConfig(engineId: string): RetryConfig {
  const providerConfig = PROVIDER_RETRY_CONFIGS[engineId] ?? {};
  return { ...DEFAULT_RETRY_CONFIG, ...providerConfig };
}

/**
 * Calculate delay for a retry attempt
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig,
  retryAfterSeconds?: number
): number {
  // If retry-after is specified, use it
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, config.maxDelayMs);
  }

  // Calculate exponential backoff
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter (±25%)
  if (config.jitter) {
    const jitterRange = delay * 0.25;
    delay += (Math.random() - 0.5) * 2 * jitterRange;
  }

  return Math.round(delay);
}

/**
 * Recovery context for tracking retry state
 */
export interface RecoveryContext {
  engineId: string;
  attempt: number;
  maxAttempts: number;
  errors: EngineError[];
  startTime: number;
  lastError?: EngineError;
}

/**
 * Create a new recovery context
 */
export function createRecoveryContext(engineId: string, maxRetries?: number): RecoveryContext {
  const config = getRetryConfig(engineId);
  return {
    engineId,
    attempt: 0,
    maxAttempts: maxRetries ?? config.maxRetries,
    errors: [],
    startTime: Date.now(),
  };
}

/**
 * Update recovery context after an error
 */
export function updateRecoveryContext(
  context: RecoveryContext,
  error: EngineError
): RecoveryContext {
  return {
    ...context,
    attempt: context.attempt + 1,
    errors: [...context.errors, error],
    lastError: error,
  };
}

/**
 * Check if recovery should continue
 */
export function shouldRetry(context: RecoveryContext): boolean {
  if (context.attempt >= context.maxAttempts) {
    return false;
  }

  const lastError = context.lastError;
  if (!lastError) {
    return true;
  }

  // Check recovery strategy
  switch (lastError.strategy) {
    case 'retry_immediate':
    case 'retry_backoff':
    case 'retry_after':
      return true;
    case 'reauthenticate':
    case 'fallback_model':
    case 'reduce_context':
      // These require intervention, only retry once
      return context.attempt < 1;
    case 'abort':
    case 'user_intervention':
      return false;
  }
}

/**
 * Get delay before next retry
 */
export function getRetryDelay(context: RecoveryContext): number {
  const config = getRetryConfig(context.engineId);
  const retryAfterSeconds = context.lastError?.details?.retryAfterSeconds;
  return calculateRetryDelay(context.attempt, config, retryAfterSeconds);
}

/**
 * Create error recovery result
 */
export interface RecoveryResult<T> {
  success: boolean;
  value?: T;
  error?: EngineError;
  context: RecoveryContext;
}

/**
 * Execute with automatic error recovery
 */
export async function withRecovery<T>(
  fn: () => Promise<T>,
  engineId: string,
  options?: {
    maxRetries?: number;
    onRetry?: (context: RecoveryContext, delay: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<RecoveryResult<T>> {
  let context = createRecoveryContext(engineId, options?.maxRetries);

  while (true) {
    try {
      // Check for abort
      if (options?.abortSignal?.aborted) {
        return {
          success: false,
          error: new EngineError('Operation aborted', 'unknown', engineId, 'abort'),
          context,
        };
      }

      const value = await fn();
      return { success: true, value, context };
    } catch (error) {
      const engineError = toEngineError(error, engineId);
      context = updateRecoveryContext(context, engineError);

      if (!shouldRetry(context)) {
        return { success: false, error: engineError, context };
      }

      const delay = getRetryDelay(context);
      options?.onRetry?.(context, delay);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
