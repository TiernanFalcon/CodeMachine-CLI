/**
 * Rate Limit Manager Integration Tests
 *
 * Tests rate limit tracking, persistence, and recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { RateLimitManager } from '../../../src/workflows/execution/rate-limit-manager.js';

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

      const resetAt = Date.now() + 60000; // 1 minute from now
      manager.markRateLimited('claude', resetAt);

      expect(manager.isRateLimited('claude')).toBe(true);
      expect(manager.isRateLimited('gemini')).toBe(false);
    });

    it('should return reset time for rate limited engine', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const resetAt = Date.now() + 60000;
      manager.markRateLimited('codex', resetAt);

      const entry = manager.getRateLimitEntry('codex');
      expect(entry).toBeDefined();
      expect(entry?.resetsAt).toBe(resetAt);
    });

    it('should clear expired rate limits', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      // Mark as rate limited with past reset time
      const resetAt = Date.now() - 1000; // Already expired
      manager.markRateLimited('claude', resetAt);

      // Should auto-clear expired entries
      expect(manager.isRateLimited('claude')).toBe(false);
    });

    it('should clear rate limit manually', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const resetAt = Date.now() + 60000;
      manager.markRateLimited('gemini', resetAt);

      expect(manager.isRateLimited('gemini')).toBe(true);

      manager.clearRateLimit('gemini');

      expect(manager.isRateLimited('gemini')).toBe(false);
    });
  });

  describe('Persistence', () => {
    it('should persist rate limits to file', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const resetAt = Date.now() + 60000;
      manager.markRateLimited('claude', resetAt);

      await manager.persist();

      // Read persisted file
      const content = await readFile(path.join(testDir, 'rate-limits.json'), 'utf-8');
      const data = JSON.parse(content);

      expect(data.claude).toBeDefined();
      expect(data.claude.resetsAt).toBe(resetAt);
    });

    it('should load persisted rate limits on initialization', async () => {
      // First instance - set rate limit
      const manager1 = RateLimitManager.getInstance(testDir);
      await manager1.initialize();

      const resetAt = Date.now() + 60000;
      manager1.markRateLimited('claude', resetAt);
      await manager1.persist();

      // Reset and create new instance
      RateLimitManager.resetInstance();

      const manager2 = RateLimitManager.getInstance(testDir);
      await manager2.initialize();

      expect(manager2.isRateLimited('claude')).toBe(true);
    });
  });

  describe('Available Engines', () => {
    it('should list available engines', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      manager.markRateLimited('claude', Date.now() + 60000);

      const available = manager.getAvailableEngines(['claude', 'gemini', 'codex']);

      expect(available).not.toContain('claude');
      expect(available).toContain('gemini');
      expect(available).toContain('codex');
    });

    it('should return all engines when none rate limited', async () => {
      const manager = RateLimitManager.getInstance(testDir);
      await manager.initialize();

      const engines = ['claude', 'gemini', 'codex'];
      const available = manager.getAvailableEngines(engines);

      expect(available).toEqual(engines);
    });
  });
});
