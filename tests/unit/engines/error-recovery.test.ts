/**
 * Error Recovery Unit Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  EngineError,
  classifyError,
  toEngineError,
  getRetryConfig,
  calculateRetryDelay,
  createRecoveryContext,
  updateRecoveryContext,
  shouldRetry,
  getRetryDelay,
  withRecovery,
  DEFAULT_RETRY_CONFIG,
} from '../../../src/infra/engines/core/error-recovery.js';

describe('EngineError', () => {
  it('should create rate limit error', () => {
    const error = EngineError.rateLimit('claude', 60);

    expect(error.category).toBe('rate_limit');
    expect(error.engineId).toBe('claude');
    expect(error.strategy).toBe('retry_after');
    expect(error.details?.retryAfterSeconds).toBe(60);
    expect(error.recoverable).toBe(true);
  });

  it('should create rate limit error without retry-after', () => {
    const error = EngineError.rateLimit('gemini');

    expect(error.category).toBe('rate_limit');
    expect(error.strategy).toBe('retry_backoff');
    expect(error.details?.retryAfterSeconds).toBeUndefined();
  });

  it('should create auth error', () => {
    const error = EngineError.auth('codex', 'invalid API key');

    expect(error.category).toBe('auth');
    expect(error.engineId).toBe('codex');
    expect(error.strategy).toBe('reauthenticate');
    expect(error.details?.authReason).toBe('invalid API key');
    expect(error.recoverable).toBe(false);
  });

  it('should create network error', () => {
    const error = EngineError.network('claude', 'Connection refused');

    expect(error.category).toBe('network');
    expect(error.strategy).toBe('retry_backoff');
    expect(error.recoverable).toBe(true);
  });

  it('should create timeout error', () => {
    const error = EngineError.timeout('gemini', 30000);

    expect(error.category).toBe('timeout');
    expect(error.strategy).toBe('retry_immediate');
    expect(error.details?.timeoutMs).toBe(30000);
    expect(error.recoverable).toBe(true);
  });

  it('should create context length error', () => {
    const error = EngineError.contextLength('claude', 100000, 150000);

    expect(error.category).toBe('context_length');
    expect(error.strategy).toBe('reduce_context');
    expect(error.details?.maxTokens).toBe(100000);
    expect(error.details?.requestedTokens).toBe(150000);
  });

  it('should create model not found error', () => {
    const error = EngineError.modelNotFound('gemini', 'gemini-pro-v3');

    expect(error.category).toBe('model_not_found');
    expect(error.strategy).toBe('fallback_model');
    expect(error.details?.model).toBe('gemini-pro-v3');
  });

  it('should create content filter error', () => {
    const error = EngineError.contentFilter('claude', 'Harmful content detected');

    expect(error.category).toBe('content_filter');
    expect(error.strategy).toBe('user_intervention');
    expect(error.recoverable).toBe(false);
  });

  it('should create service unavailable error', () => {
    const error = EngineError.serviceUnavailable('codex');

    expect(error.category).toBe('service_unavailable');
    expect(error.strategy).toBe('retry_backoff');
    expect(error.recoverable).toBe(true);
  });

  it('should chain cause errors', () => {
    const cause = new Error('Original error');
    const error = EngineError.network('claude', 'Connection failed', cause);

    expect(error.cause).toBe(cause);
    expect(error.getErrorChain()).toHaveLength(2);
  });
});

describe('classifyError', () => {
  describe('Claude errors', () => {
    it('should classify rate limit errors', () => {
      const result = classifyError('rate_limit exceeded', 'claude');
      expect(result.category).toBe('rate_limit');
      expect(result.strategy).toBe('retry_backoff');
    });

    it('should classify 429 errors as rate limit', () => {
      const result = classifyError('HTTP 429 Too Many Requests', 'claude');
      expect(result.category).toBe('rate_limit');
    });

    it('should classify auth errors', () => {
      const result = classifyError('invalid_api_key', 'claude');
      expect(result.category).toBe('auth');
      expect(result.strategy).toBe('reauthenticate');
    });

    it('should classify service unavailable', () => {
      const result = classifyError('service_unavailable: Claude is overloaded', 'claude');
      expect(result.category).toBe('service_unavailable');
    });

    it('should classify context length errors', () => {
      const result = classifyError('context_length exceeded', 'claude');
      expect(result.category).toBe('context_length');
      expect(result.strategy).toBe('reduce_context');
    });

    it('should classify model not found errors', () => {
      const result = classifyError('model not found: claude-3-opus', 'claude');
      expect(result.category).toBe('model_not_found');
      expect(result.strategy).toBe('fallback_model');
    });

    it('should classify content filter errors', () => {
      const result = classifyError('content_policy violation', 'claude');
      expect(result.category).toBe('content_filter');
      expect(result.strategy).toBe('user_intervention');
    });

    it('should extract retry-after seconds', () => {
      const result = classifyError('Rate limit exceeded. Retry after 60 seconds.', 'claude');
      expect(result.category).toBe('rate_limit');
      expect(result.strategy).toBe('retry_after');
      expect(result.retryAfterSeconds).toBe(60);
    });
  });

  describe('Gemini errors', () => {
    it('should classify RESOURCE_EXHAUSTED as rate limit', () => {
      const result = classifyError('RESOURCE_EXHAUSTED', 'gemini');
      expect(result.category).toBe('rate_limit');
    });

    it('should classify PERMISSION_DENIED as auth', () => {
      const result = classifyError('PERMISSION_DENIED', 'gemini');
      expect(result.category).toBe('auth');
    });

    it('should classify SAFETY blocks', () => {
      const result = classifyError('SAFETY: Content blocked', 'gemini');
      expect(result.category).toBe('content_filter');
    });

    it('should classify NOT_FOUND as model not found', () => {
      const result = classifyError('NOT_FOUND: Model not supported', 'gemini');
      expect(result.category).toBe('model_not_found');
    });
  });

  describe('default patterns', () => {
    it('should use default patterns for unknown providers', () => {
      const result = classifyError('rate limit exceeded', 'unknown-engine');
      expect(result.category).toBe('rate_limit');
    });

    it('should classify timeout errors', () => {
      const result = classifyError('Request timed out', 'unknown-engine');
      expect(result.category).toBe('timeout');
    });

    it('should classify network errors', () => {
      const result = classifyError('ECONNREFUSED', 'unknown-engine');
      expect(result.category).toBe('network');
    });

    it('should return unknown for unrecognized errors', () => {
      const result = classifyError('Something completely unexpected', 'unknown-engine');
      expect(result.category).toBe('unknown');
      expect(result.strategy).toBe('abort');
    });
  });
});

describe('toEngineError', () => {
  it('should return existing EngineError unchanged', () => {
    const original = EngineError.rateLimit('claude', 30);
    const result = toEngineError(original, 'claude');

    expect(result).toBe(original);
  });

  it('should convert regular Error to EngineError', () => {
    const original = new Error('rate limit exceeded');
    const result = toEngineError(original, 'claude');

    expect(result).toBeInstanceOf(EngineError);
    expect(result.category).toBe('rate_limit');
    expect(result.cause).toBe(original);
  });

  it('should convert string to EngineError', () => {
    // Use a gemini-specific pattern that matches
    const result = toEngineError('PERMISSION_DENIED: Invalid API key', 'gemini');

    expect(result).toBeInstanceOf(EngineError);
    expect(result.category).toBe('auth');
  });
});

describe('getRetryConfig', () => {
  it('should return default config for unknown provider', () => {
    const config = getRetryConfig('unknown-engine');
    expect(config).toEqual(DEFAULT_RETRY_CONFIG);
  });

  it('should return provider-specific config for claude', () => {
    const config = getRetryConfig('claude');
    expect(config.maxRetries).toBe(3);
    expect(config.initialDelayMs).toBe(2000);
    expect(config.maxDelayMs).toBe(120000);
  });

  it('should merge provider config with defaults', () => {
    const config = getRetryConfig('gemini');
    expect(config.maxRetries).toBe(4);
    expect(config.jitter).toBe(true); // From default
  });
});

describe('calculateRetryDelay', () => {
  const config = { ...DEFAULT_RETRY_CONFIG, jitter: false };

  it('should calculate exponential backoff', () => {
    expect(calculateRetryDelay(0, config)).toBe(1000);
    expect(calculateRetryDelay(1, config)).toBe(2000);
    expect(calculateRetryDelay(2, config)).toBe(4000);
  });

  it('should respect max delay', () => {
    const smallMaxConfig = { ...config, maxDelayMs: 3000 };
    expect(calculateRetryDelay(5, smallMaxConfig)).toBe(3000);
  });

  it('should use retry-after when provided', () => {
    expect(calculateRetryDelay(0, config, 30)).toBe(30000);
  });

  it('should cap retry-after to max delay', () => {
    expect(calculateRetryDelay(0, config, 120)).toBe(60000);
  });
});

describe('RecoveryContext', () => {
  it('should create initial context', () => {
    const context = createRecoveryContext('claude');

    expect(context.engineId).toBe('claude');
    expect(context.attempt).toBe(0);
    expect(context.maxAttempts).toBe(3);
    expect(context.errors).toEqual([]);
  });

  it('should allow custom max retries', () => {
    const context = createRecoveryContext('claude', 5);
    expect(context.maxAttempts).toBe(5);
  });

  it('should update context after error', () => {
    const context = createRecoveryContext('claude');
    const error = EngineError.rateLimit('claude');

    const updated = updateRecoveryContext(context, error);

    expect(updated.attempt).toBe(1);
    expect(updated.errors).toHaveLength(1);
    expect(updated.lastError).toBe(error);
  });
});

describe('shouldRetry', () => {
  it('should allow retry when under max attempts', () => {
    const context = createRecoveryContext('claude');
    const error = EngineError.rateLimit('claude');
    const updated = updateRecoveryContext(context, error);

    expect(shouldRetry(updated)).toBe(true);
  });

  it('should not retry when at max attempts', () => {
    let context = createRecoveryContext('claude', 2);
    const error = EngineError.rateLimit('claude');

    context = updateRecoveryContext(context, error);
    context = updateRecoveryContext(context, error);

    expect(shouldRetry(context)).toBe(false);
  });

  it('should not retry abort strategy', () => {
    const context = createRecoveryContext('claude');
    const error = new EngineError('Unknown error', 'unknown', 'claude', 'abort');
    const updated = updateRecoveryContext(context, error);

    expect(shouldRetry(updated)).toBe(false);
  });

  it('should not retry user_intervention strategy', () => {
    const context = createRecoveryContext('claude');
    const error = EngineError.contentFilter('claude', 'blocked');
    const updated = updateRecoveryContext(context, error);

    expect(shouldRetry(updated)).toBe(false);
  });

  it('should limit reauthenticate to one retry', () => {
    let context = createRecoveryContext('claude');
    const error = EngineError.auth('claude', 'invalid key');

    context = updateRecoveryContext(context, error);
    expect(shouldRetry(context)).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('should calculate delay based on context', () => {
    const context = createRecoveryContext('claude');
    const error = EngineError.rateLimit('claude');
    const updated = updateRecoveryContext(context, error);

    const delay = getRetryDelay(updated);
    // Claude config: initialDelayMs: 2000, after 1st error attempt=1
    // Delay = 2000 * 2^1 = 4000ms, with 25% jitter range is 3000-5000
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('should use retry-after from error', () => {
    const context = createRecoveryContext('claude');
    const error = EngineError.rateLimit('claude', 45);
    const updated = updateRecoveryContext(context, error);

    const delay = getRetryDelay(updated);
    expect(delay).toBe(45000);
  });
});

describe('withRecovery', () => {
  it('should return value on success', async () => {
    const result = await withRecovery(
      () => Promise.resolve('success'),
      'claude'
    );

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.context.attempt).toBe(0);
  });

  it('should retry on recoverable errors', async () => {
    let callCount = 0;

    // Use a mock engine that uses default (faster) config
    const result = await withRecovery(
      () => {
        callCount++;
        if (callCount < 3) {
          // Use "503" which is recognized by default patterns as service_unavailable
          throw new Error('Server returned 503');
        }
        return Promise.resolve('success after retry');
      },
      'mock', // Use mock engine with default (faster) retry config
      { maxRetries: 3 }
    );

    expect(result.success).toBe(true);
    expect(result.value).toBe('success after retry');
    expect(callCount).toBe(3);
  }, 15000); // Increase timeout for retries

  it('should fail after max retries', async () => {
    let callCount = 0;

    const result = await withRecovery(
      () => {
        callCount++;
        throw new Error('rate limit exceeded');
      },
      'mock', // Use mock engine with default (faster) retry config
      { maxRetries: 2 }
    );

    expect(result.success).toBe(false);
    expect(result.error?.category).toBe('rate_limit');
    // With maxRetries=2: initial attempt (0) + 1 retry = 2 calls before stopping at attempt 2
    expect(callCount).toBe(2);
  }, 10000); // Increase timeout for retries

  it('should call onRetry callback', async () => {
    let callCount = 0;
    const retryCalls: number[] = [];

    await withRecovery(
      () => {
        callCount++;
        if (callCount < 2) {
          // Use "rate limit" which is recognized as recoverable
          throw new Error('rate limit exceeded');
        }
        return Promise.resolve('success');
      },
      'mock', // Use mock engine with default (faster) retry config
      {
        maxRetries: 2,
        onRetry: (context, _delay) => {
          retryCalls.push(context.attempt);
        },
      }
    );

    expect(retryCalls).toEqual([1]);
  }, 10000); // Increase timeout for retries

  it('should abort on non-recoverable errors', async () => {
    let callCount = 0;

    const result = await withRecovery(
      () => {
        callCount++;
        throw EngineError.contentFilter('mock', 'blocked');
      },
      'mock',
      { maxRetries: 3 }
    );

    expect(result.success).toBe(false);
    expect(result.error?.strategy).toBe('user_intervention');
    expect(callCount).toBe(1);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await withRecovery(
      () => Promise.resolve('should not reach'),
      'mock',
      { abortSignal: controller.signal }
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('aborted');
  });
});
