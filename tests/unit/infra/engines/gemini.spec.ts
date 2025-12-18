import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  isRateLimitError,
  parseRetryAfter,
  type GeminiErrorResponse,
} from '../../../../src/infra/engines/providers/gemini/execution/api-client.js';
import { toTelemetry, formatTelemetry } from '../../../../src/infra/engines/providers/gemini/execution/telemetry.js';
import { calculateCost, getModelPricing } from '../../../../src/infra/engines/providers/gemini/config.js';

describe('Gemini Engine', () => {
  describe('isRateLimitError', () => {
    it('detects 429 status code', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 429,
          message: 'Too many requests',
          status: 'RATE_LIMITED',
        },
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('detects RESOURCE_EXHAUSTED status', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 400,
          message: 'Quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
        },
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('detects quota in message', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 400,
          message: 'You have exceeded your quota limit',
          status: 'BAD_REQUEST',
        },
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('detects rate limit in message', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 400,
          message: 'Rate limit exceeded for this API',
          status: 'BAD_REQUEST',
        },
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('returns false for other errors', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 500,
          message: 'Internal server error',
          status: 'INTERNAL',
        },
      };
      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe('parseRetryAfter', () => {
    it('extracts delay from metadata', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 429,
          message: 'Rate limited',
          status: 'RESOURCE_EXHAUSTED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.RetryInfo',
              metadata: {
                retryDelay: '60s',
              },
            },
          ],
        },
      };
      expect(parseRetryAfter(error)).toBe(60);
    });

    it('parses different delay formats', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 429,
          message: 'Rate limited',
          status: 'RESOURCE_EXHAUSTED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.RetryInfo',
              metadata: {
                retryDelay: '120s',
              },
            },
          ],
        },
      };
      expect(parseRetryAfter(error)).toBe(120);
    });

    it('returns default 60 seconds for missing metadata', () => {
      const error: GeminiErrorResponse = {
        error: {
          code: 429,
          message: 'Rate limited',
          status: 'RESOURCE_EXHAUSTED',
        },
      };
      expect(parseRetryAfter(error)).toBe(60);
    });
  });

  describe('toTelemetry', () => {
    it('converts GeminiUsageMetadata to ParsedTelemetry', () => {
      const usage = {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      };
      const telemetry = toTelemetry(usage, 'gemini-1.5-pro', 5000);

      expect(telemetry.tokensIn).toBe(100);
      expect(telemetry.tokensOut).toBe(50);
      expect(telemetry.duration).toBe(5000);
      expect(typeof telemetry.cost).toBe('number');
    });

    it('calculates cost based on model pricing', () => {
      const usage = {
        promptTokenCount: 1000000, // 1M tokens
        candidatesTokenCount: 500000, // 500K tokens
        totalTokenCount: 1500000,
      };
      const telemetry = toTelemetry(usage, 'gemini-1.5-pro');

      // gemini-1.5-pro: $1.25/1M input, $5.00/1M output
      // Cost = 1.25 + 2.50 = 3.75
      expect(telemetry.cost).toBeCloseTo(3.75, 2);
    });
  });

  describe('formatTelemetry', () => {
    it('formats telemetry as readable string', () => {
      const telemetry = {
        tokensIn: 100,
        tokensOut: 50,
        cost: 0.0125,
        duration: 5000,
      };
      const formatted = formatTelemetry(telemetry);

      expect(formatted).toContain('tokens_in=100');
      expect(formatted).toContain('tokens_out=50');
      expect(formatted).toContain('cost=$0.0125');
      expect(formatted).toContain('duration=5.0s');
    });

    it('handles missing fields gracefully', () => {
      const telemetry = {
        tokensIn: 100,
        tokensOut: 50,
      };
      const formatted = formatTelemetry(telemetry);

      expect(formatted).toContain('tokens_in=100');
      expect(formatted).toContain('tokens_out=50');
      expect(formatted).not.toContain('cost=');
      expect(formatted).not.toContain('duration=');
    });
  });

  describe('getModelPricing', () => {
    it('returns pricing for known models', () => {
      const pricing = getModelPricing('gemini-1.5-pro');
      expect(pricing.inputPer1M).toBe(1.25);
      expect(pricing.outputPer1M).toBe(5.00);
    });

    it('returns default pricing for unknown models', () => {
      const pricing = getModelPricing('unknown-model');
      expect(pricing.inputPer1M).toBe(0.50);
      expect(pricing.outputPer1M).toBe(1.50);
    });
  });

  describe('calculateCost', () => {
    it('calculates cost correctly', () => {
      // 1M input tokens + 500K output tokens at gemini-1.5-pro prices
      const cost = calculateCost('gemini-1.5-pro', 1000000, 500000);
      // 1.25 + 2.50 = 3.75
      expect(cost).toBeCloseTo(3.75, 2);
    });

    it('returns 0 for experimental models', () => {
      const cost = calculateCost('gemini-2.0-flash-thinking-exp', 1000000, 500000);
      expect(cost).toBe(0);
    });
  });
});
