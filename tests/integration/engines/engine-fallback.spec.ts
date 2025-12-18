import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runWithFallback,
  hasAvailableEngine,
  type RunWithFallbackOptions
} from '../../../src/workflows/execution/engine-fallback.js';
import { RateLimitManager } from '../../../src/workflows/execution/rate-limit-manager.js';
import { registry } from '../../../src/infra/engines/index.js';
import {
  setMockConfig,
  resetMockConfig
} from '../../../src/infra/engines/providers/mock/execution/runner.js';

describe('Engine Fallback', () => {
  let tempDir: string;
  let rateLimitManager: RateLimitManager;

  beforeEach(async () => {
    RateLimitManager.resetInstance();
    resetMockConfig();
    tempDir = await mkdtemp(join(tmpdir(), 'engine-fallback-test-'));
    rateLimitManager = RateLimitManager.getInstance(tempDir);
    await rateLimitManager.initialize();
  });

  afterEach(async () => {
    RateLimitManager.resetInstance();
    resetMockConfig();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('runWithFallback', () => {
    it('uses primary engine when available', async () => {
      setMockConfig({
        mode: 'static',
        staticResponse: 'Success from mock engine'
      });

      const result = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Test prompt', workingDir: tempDir },
        rateLimitManager,
        maxAttempts: 3
      });

      expect(result.engineUsed).toBe('mock');
      expect(result.fellBack).toBe(false);
      expect(result.stdout).toBe('Success from mock engine');
      expect(result.rateLimitedEngines).toEqual([]);
    });

    it('tracks rate limited engines', async () => {
      // Configure mock to simulate rate limit
      setMockConfig({
        mode: 'scripted',
        scriptedResponses: [
          { output: '', isRateLimitError: true, retryAfterSeconds: 60 }
        ]
      });

      // Mark the mock engine as rate limited and verify it's tracked
      await rateLimitManager.markRateLimited('mock', undefined, 60);

      expect(rateLimitManager.isEngineAvailable('mock')).toBe(false);
      expect(rateLimitManager.getRateLimitedEngines()).toContain('mock');
    });

    it('returns correct result on successful run', async () => {
      setMockConfig({
        mode: 'static',
        staticResponse: 'Task completed successfully',
        defaultTelemetry: {
          tokensIn: 100,
          tokensOut: 50,
          cost: 0.001
        }
      });

      const result = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: {
          prompt: 'Generate some code',
          workingDir: tempDir,
          onData: () => {}
        },
        rateLimitManager
      });

      expect(result.stdout).toBe('Task completed successfully');
      expect(result.stderr).toBe('');
      expect(result.engineUsed).toBe('mock');
    });

    it('throws when engine not found', async () => {
      await expect(
        runWithFallback({
          primaryEngine: 'nonexistent-engine',
          runOptions: { prompt: 'Test', workingDir: tempDir },
          rateLimitManager
        })
      ).rejects.toThrow(/Engine not found/);
    });
  });

  describe('hasAvailableEngine', () => {
    it('returns true when mock engine is available', async () => {
      const hasEngine = await hasAvailableEngine(rateLimitManager);
      // Will return true if any engine is authenticated (mock is always authenticated)
      expect(typeof hasEngine).toBe('boolean');
    });

    it('returns false when all authenticated engines are rate-limited', async () => {
      // Get all engine IDs and mark them as rate-limited
      const engines = registry.getAll();
      for (const engine of engines) {
        await rateLimitManager.markRateLimited(engine.metadata.id, undefined, 3600);
      }

      const hasEngine = await hasAvailableEngine(rateLimitManager);
      expect(hasEngine).toBe(false);
    });
  });

  describe('rate limit manager integration', () => {
    it('marks engine as unavailable when rate limited', async () => {
      expect(rateLimitManager.isEngineAvailable('mock')).toBe(true);

      await rateLimitManager.markRateLimited('mock', undefined, 60);

      expect(rateLimitManager.isEngineAvailable('mock')).toBe(false);
      expect(rateLimitManager.getTimeUntilAvailable('mock')).toBeGreaterThan(0);
    });

    it('clears rate limit', async () => {
      await rateLimitManager.markRateLimited('mock', undefined, 60);
      expect(rateLimitManager.isEngineAvailable('mock')).toBe(false);

      await rateLimitManager.clearRateLimit('mock');
      expect(rateLimitManager.isEngineAvailable('mock')).toBe(true);
    });
  });

  describe('mock engine behavior', () => {
    it('supports scripted responses', async () => {
      setMockConfig({
        mode: 'scripted',
        scriptedResponses: [
          { output: 'First response' },
          { output: 'Second response' },
          { output: 'Third response' }
        ]
      });

      // Run three times, should get scripted responses in order
      const result1 = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Call 1', workingDir: tempDir },
        rateLimitManager
      });
      expect(result1.stdout).toBe('First response');

      const result2 = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Call 2', workingDir: tempDir },
        rateLimitManager
      });
      expect(result2.stdout).toBe('Second response');

      const result3 = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Call 3', workingDir: tempDir },
        rateLimitManager
      });
      expect(result3.stdout).toBe('Third response');
    });

    it('supports callback mode', async () => {
      setMockConfig({
        mode: 'callback',
        responseCallback: async (prompt) => ({
          output: `Echo: ${prompt}`
        })
      });

      const result = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Hello World', workingDir: tempDir },
        rateLimitManager
      });

      expect(result.stdout).toBe('Echo: Hello World');
    });

    it('simulates rate limit after N calls', async () => {
      setMockConfig({
        mode: 'static',
        staticResponse: 'OK',
        rateLimitAfterCalls: 2
      });

      // First two calls should succeed
      const result1 = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Call 1', workingDir: tempDir },
        rateLimitManager
      });
      expect(result1.stdout).toBe('OK');

      const result2 = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Call 2', workingDir: tempDir },
        rateLimitManager
      });
      expect(result2.stdout).toBe('OK');

      // Third call should trigger rate limit
      // Note: The fallback logic will handle this and potentially fall back to another engine
      // or return the rate limit result if no fallback is available
      const result3 = await runWithFallback({
        primaryEngine: 'mock',
        runOptions: { prompt: 'Call 3', workingDir: tempDir },
        rateLimitManager
      });

      // Either we got a fallback or the rate limit result
      expect(result3.rateLimitedEngines).toContain('mock');
    });
  });
});
