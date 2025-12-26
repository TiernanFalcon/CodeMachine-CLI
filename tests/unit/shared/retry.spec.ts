import { describe, expect, it, mock } from 'bun:test';

import {
  withRetry,
  withDatabaseRetry,
  withDatabaseRetrySync,
} from '../../../src/shared/utils/retry.js';

describe('Retry Utilities', () => {
  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const operation = mock(() => 'success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error', async () => {
      let attempts = 0;
      const operation = mock(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('transient error');
        }
        return 'success';
      });

      const result = await withRetry(operation, {
        maxAttempts: 5,
        isRetryable: () => true,
        initialDelayMs: 1,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('throws on non-retryable error', async () => {
      const operation = mock(() => {
        throw new Error('permanent error');
      });

      await expect(
        withRetry(operation, {
          maxAttempts: 5,
          isRetryable: () => false,
        })
      ).rejects.toThrow('permanent error');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('throws after max attempts', async () => {
      const operation = mock(() => {
        throw new Error('always fails');
      });

      await expect(
        withRetry(operation, {
          maxAttempts: 3,
          isRetryable: () => true,
          initialDelayMs: 1,
        })
      ).rejects.toThrow('always fails');

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('calls onRetry callback', async () => {
      let attempts = 0;
      const onRetry = mock(() => {});
      const operation = mock(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('retry me');
        }
        return 'done';
      });

      await withRetry(operation, {
        maxAttempts: 5,
        isRetryable: () => true,
        initialDelayMs: 1,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('works with async operations', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        await new Promise((r) => setTimeout(r, 1));
        if (attempts < 2) {
          throw new Error('async error');
        }
        return 'async success';
      };

      const result = await withRetry(operation, {
        maxAttempts: 3,
        isRetryable: () => true,
        initialDelayMs: 1,
      });

      expect(result).toBe('async success');
    });
  });

  describe('withDatabaseRetry', () => {
    it('retries on SQLITE_BUSY errors', async () => {
      let attempts = 0;
      const operation = () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('SQLITE_BUSY');
        }
        return 'success';
      };

      const result = await withDatabaseRetry(operation);

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('retries on database is locked errors', async () => {
      let attempts = 0;
      const operation = () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('database is locked');
        }
        return 'success';
      };

      const result = await withDatabaseRetry(operation);

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('does not retry on other errors', async () => {
      const operation = mock(() => {
        throw new Error('syntax error');
      });

      await expect(withDatabaseRetry(operation)).rejects.toThrow('syntax error');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('withDatabaseRetrySync', () => {
    it('returns result on first success', () => {
      const result = withDatabaseRetrySync(() => 'sync success');
      expect(result).toBe('sync success');
    });

    it('retries on SQLITE_BUSY errors', () => {
      let attempts = 0;
      const operation = () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('SQLITE_BUSY');
        }
        return 'success';
      };

      const result = withDatabaseRetrySync(operation);

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('throws on non-database errors', () => {
      expect(() =>
        withDatabaseRetrySync(() => {
          throw new Error('other error');
        })
      ).toThrow('other error');
    });

    it('throws after max attempts', () => {
      let attempts = 0;

      expect(() =>
        withDatabaseRetrySync(
          () => {
            attempts++;
            throw new Error('database is busy');
          },
          { maxAttempts: 3, initialDelayMs: 1 }
        )
      ).toThrow('database is busy');

      expect(attempts).toBe(3);
    });
  });
});
