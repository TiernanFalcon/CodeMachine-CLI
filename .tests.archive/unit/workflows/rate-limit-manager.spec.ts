import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RateLimitManager } from '../../../src/workflows/execution/rate-limit-manager.js';

describe('RateLimitManager', () => {
  let tempDir: string;
  let manager: RateLimitManager;

  beforeEach(async () => {
    // Reset singleton before each test
    RateLimitManager.resetInstance();
    tempDir = await mkdtemp(join(tmpdir(), 'rate-limit-test-'));
    manager = RateLimitManager.getInstance(tempDir);
    await manager.initialize();
  });

  afterEach(async () => {
    RateLimitManager.resetInstance();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('markRateLimited', () => {
    it('marks engine as rate limited', async () => {
      await manager.markRateLimited('claude', undefined, 60);
      expect(manager.isEngineAvailable('claude')).toBe(false);
    });

    it('stores reset time', async () => {
      const resetsAt = new Date(Date.now() + 60000);
      await manager.markRateLimited('claude', resetsAt);
      expect(manager.isEngineAvailable('claude')).toBe(false);
    });

    it('calculates reset time from retryAfterSeconds', async () => {
      await manager.markRateLimited('gemini', undefined, 120);
      const waitTime = manager.getTimeUntilAvailable('gemini');
      // Should be around 120 seconds (within tolerance)
      expect(waitTime).toBeGreaterThan(110);
      expect(waitTime).toBeLessThanOrEqual(120);
    });
  });

  describe('isEngineAvailable', () => {
    it('returns true for non-limited engines', () => {
      expect(manager.isEngineAvailable('codex')).toBe(true);
    });

    it('returns false for rate limited engines', async () => {
      await manager.markRateLimited('claude', undefined, 60);
      expect(manager.isEngineAvailable('claude')).toBe(false);
    });

    it('returns true after rate limit expires', async () => {
      // Set a rate limit that expires immediately
      const resetsAt = new Date(Date.now() - 1000); // 1 second ago
      await manager.markRateLimited('claude', resetsAt);
      expect(manager.isEngineAvailable('claude')).toBe(true);
    });
  });

  describe('getTimeUntilAvailable', () => {
    it('returns 0 for available engines', () => {
      expect(manager.getTimeUntilAvailable('codex')).toBe(0);
    });

    it('returns remaining seconds for rate limited engines', async () => {
      await manager.markRateLimited('claude', undefined, 60);
      const waitTime = manager.getTimeUntilAvailable('claude');
      expect(waitTime).toBeGreaterThan(50);
      expect(waitTime).toBeLessThanOrEqual(60);
    });

    it('returns 0 for expired rate limits', async () => {
      const resetsAt = new Date(Date.now() - 1000);
      await manager.markRateLimited('claude', resetsAt);
      expect(manager.getTimeUntilAvailable('claude')).toBe(0);
    });
  });

  describe('clearRateLimit', () => {
    it('clears rate limit for specific engine', async () => {
      await manager.markRateLimited('claude', undefined, 60);
      expect(manager.isEngineAvailable('claude')).toBe(false);

      await manager.clearRateLimit('claude');
      expect(manager.isEngineAvailable('claude')).toBe(true);
    });

    it('does not affect other engines', async () => {
      await manager.markRateLimited('claude', undefined, 60);
      await manager.markRateLimited('gemini', undefined, 60);

      await manager.clearRateLimit('claude');

      expect(manager.isEngineAvailable('claude')).toBe(true);
      expect(manager.isEngineAvailable('gemini')).toBe(false);
    });
  });

  describe('getRateLimitedEngines', () => {
    it('returns empty array when no engines are rate limited', () => {
      expect(manager.getRateLimitedEngines()).toEqual([]);
    });

    it('returns rate limited engine IDs', async () => {
      await manager.markRateLimited('claude', undefined, 60);
      await manager.markRateLimited('gemini', undefined, 60);

      const limited = manager.getRateLimitedEngines();
      expect(limited).toContain('claude');
      expect(limited).toContain('gemini');
      expect(limited).toHaveLength(2);
    });

    it('excludes expired rate limits', async () => {
      const expiredTime = new Date(Date.now() - 1000);
      await manager.markRateLimited('claude', expiredTime);
      await manager.markRateLimited('gemini', undefined, 60);

      const limited = manager.getRateLimitedEngines();
      expect(limited).not.toContain('claude');
      expect(limited).toContain('gemini');
    });
  });

  describe('persistence', () => {
    it('persists to disk', async () => {
      await manager.markRateLimited('claude', undefined, 60);

      const filePath = join(tempDir, 'rate-limits.json');
      const content = await readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      expect(data.entries).toBeDefined();
      expect(data.entries.length).toBe(1);
      expect(data.entries[0].engineId).toBe('claude');
    });

    it('loads from disk on initialization', async () => {
      // Mark as rate limited and persist
      await manager.markRateLimited('claude', undefined, 60);

      // Reset singleton and create new instance
      RateLimitManager.resetInstance();
      const manager2 = RateLimitManager.getInstance(tempDir);
      await manager2.initialize();

      expect(manager2.isEngineAvailable('claude')).toBe(false);
    });

    it('cleans up expired entries on load', async () => {
      // Mark as rate limited with expired time
      const resetsAt = new Date(Date.now() - 1000);
      await manager.markRateLimited('claude', resetsAt);

      // Reset singleton and create new instance
      RateLimitManager.resetInstance();
      const manager2 = RateLimitManager.getInstance(tempDir);
      await manager2.initialize();

      // Should be available since it expired
      expect(manager2.isEngineAvailable('claude')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', async () => {
      // Mark with expired time (but still in entries)
      const resetsAt = new Date(Date.now() - 1000);
      await manager.markRateLimited('claude', resetsAt);
      await manager.markRateLimited('gemini', undefined, 60);

      await manager.cleanup();

      // Claude should be cleaned up, Gemini should remain
      const limited = manager.getRateLimitedEngines();
      expect(limited).not.toContain('claude');
      expect(limited).toContain('gemini');
    });
  });

  describe('singleton pattern', () => {
    it('returns same instance for same cmRoot', () => {
      const manager1 = RateLimitManager.getInstance(tempDir);
      const manager2 = RateLimitManager.getInstance(tempDir);
      expect(manager1).toBe(manager2);
    });

    it('throws if cmRoot not provided on first call', () => {
      RateLimitManager.resetInstance();
      expect(() => RateLimitManager.getInstance()).toThrow();
    });
  });
});
