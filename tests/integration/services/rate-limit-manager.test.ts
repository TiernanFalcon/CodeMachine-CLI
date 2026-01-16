/**
 * Rate Limit Manager Integration Tests
 *
 * Tests rate limit tracking, persistence, and recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { RateLimitManager } from '../../../src/workflows/step/rate-limit-manager.js';

let testDir: string;

describe('Rate Limit Manager Integration', () => {
  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `codemachine-ratelimit-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Reset singleton
    RateLimitManager.resetInstance();
  });

  afterEach(async () => {
    RateLimitManager.resetInstance();

    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should create instance with cmRoot', () => {
      const manager = RateLimitManager.getInstance(testDir);
      expect(manager).toBeDefined();
    });

    it('should throw without cmRoot on first call', () => {
      expect(() => RateLimitManager.getInstance()).toThrow('requires cmRoot');
    });

    it('should return same instance on subsequent calls', () => {
      const manager1 = RateLimitManager.getInstance(testDir);
      const manager2 = RateLimitManager.getInstance();

      expect(manager1).toBe(manager2);
    });
  });

  describe('Rate Limit Tracking', () => {
    it('should mark engine as rate limited', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      // Use Date object as expected by the API
      const resetAt = new Date(Date.now() + 60000); // 1 minute from now
      await manager.markRateLimited('claude', resetAt);

      // isEngineAvailable returns false when rate limited
      expect(manager.isEngineAvailable('claude')).toBe(false);
      expect(manager.isEngineAvailable('gemini')).toBe(true);
    });

    it('should return time until available for rate limited engine', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const resetAt = new Date(Date.now() + 60000); // 1 minute from now
      await manager.markRateLimited('codex', resetAt);

      const timeUntil = manager.getTimeUntilAvailable('codex');
      expect(timeUntil).toBeGreaterThan(0);
      expect(timeUntil).toBeLessThanOrEqual(60);
    });

    it('should clear expired rate limits', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      // Mark as rate limited with past reset time
      const resetAt = new Date(Date.now() - 1000); // Already expired
      await manager.markRateLimited('claude', resetAt);

      // Should auto-clear expired entries
      expect(manager.isEngineAvailable('claude')).toBe(true);
    });

    it('should clear rate limit manually', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const resetAt = new Date(Date.now() + 60000);
      await manager.markRateLimited('gemini', resetAt);

      expect(manager.isEngineAvailable('gemini')).toBe(false);

      await manager.clearRateLimit('gemini');

      expect(manager.isEngineAvailable('gemini')).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should persist rate limits to file', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const resetAt = new Date(Date.now() + 60000);
      await manager.markRateLimited('claude', resetAt);

      // Persist is called automatically by markRateLimited
      // Just verify the file exists
      const content = await readFile(path.join(testDir, 'rate-limits.json'), 'utf-8');
      const data = JSON.parse(content);

      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
    });

    it('should load persisted rate limits on initialization', async () => {
      // First instance - set rate limit
      const manager1 = RateLimitManager.getInstance(testDir);
      await manager1.initialize();

      const resetAt = new Date(Date.now() + 60000);
      await manager1.markRateLimited('claude', resetAt);

      // Reset and create new instance
      RateLimitManager.resetInstance();

      const manager2 = RateLimitManager.getInstance(testDir);
      await manager2.initialize();

      expect(manager2.isEngineAvailable('claude')).toBe(false);
    });
  });

  describe('Rate Limited Engines', () => {
    it('should list rate limited engines', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      await manager.markRateLimited('claude', new Date(Date.now() + 60000));

      const rateLimited = manager.getRateLimitedEngines();

      expect(rateLimited).toContain('claude');
      expect(rateLimited).not.toContain('gemini');
    });

    it('should return empty array when none rate limited', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const rateLimited = manager.getRateLimitedEngines();

      expect(rateLimited).toEqual([]);
    });
  });
});
