/**
 * Structured Logging Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  configureLogger,
  getLoggerConfig,
  logDebug,
  logInfo,
  logWarn,
  logError,
  createChildLogger,
  createTimedLog,
  withTimedLog,
  LogBuffer,
  addLogListener,
} from '../../../src/shared/logging/structured.js';
import {
  createTraceContext,
  withTraceContext,
} from '../../../src/shared/tracing/context.js';

describe('Structured Logging', () => {
  let buffer: LogBuffer;
  const originalConfig = getLoggerConfig();

  beforeEach(() => {
    buffer = new LogBuffer();
    buffer.start();
    // Reset to debug level to capture all logs
    configureLogger({ level: 'debug', format: 'json', colorize: false });
  });

  afterEach(() => {
    buffer.stop();
    // Restore original config
    configureLogger(originalConfig);
  });

  describe('configureLogger', () => {
    it('should update logger configuration', () => {
      configureLogger({ level: 'error' });

      const config = getLoggerConfig();
      expect(config.level).toBe('error');
    });

    it('should merge with existing config', () => {
      configureLogger({ format: 'pretty' });
      configureLogger({ level: 'warn' });

      const config = getLoggerConfig();
      expect(config.format).toBe('pretty');
      expect(config.level).toBe('warn');
    });
  });

  describe('Log levels', () => {
    it('should log debug messages', () => {
      configureLogger({ level: 'debug' });
      logDebug('Debug message');

      const entries = buffer.getEntriesByLevel('debug');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Debug message');
    });

    it('should log info messages', () => {
      logInfo('Info message');

      const entries = buffer.getEntriesByLevel('info');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Info message');
    });

    it('should log warn messages', () => {
      logWarn('Warn message');

      const entries = buffer.getEntriesByLevel('warn');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Warn message');
    });

    it('should log error messages', () => {
      logError('Error message');

      const entries = buffer.getEntriesByLevel('error');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Error message');
    });

    it('should filter by log level', () => {
      configureLogger({ level: 'warn' });

      logDebug('Debug');
      logInfo('Info');
      logWarn('Warn');
      logError('Error');

      const entries = buffer.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe('warn');
      expect(entries[1].level).toBe('error');
    });
  });

  describe('Context', () => {
    it('should include context in log entry', () => {
      logInfo('Message', { key: 'value', num: 42 });

      const entries = buffer.getEntries();
      expect(entries[0].context).toEqual({ key: 'value', num: 42 });
    });

    it('should include correlation ID from trace context', () => {
      const context = createTraceContext('test-corr-01');

      withTraceContext(context, () => {
        logInfo('Traced message');
      });

      const entries = buffer.getEntries();
      expect(entries[0].correlationId).toBe('test-corr-01');
    });
  });

  describe('Error handling', () => {
    it('should include error details', () => {
      const error = new Error('Test error');
      logError('Failed', undefined, error);

      const entries = buffer.getEntries();
      expect(entries[0].error).toBeDefined();
      expect(entries[0].error?.name).toBe('Error');
      expect(entries[0].error?.message).toBe('Test error');
    });

    it('should include stack trace when configured', () => {
      configureLogger({ includeStackTrace: true });
      const error = new Error('Test error');
      logError('Failed', undefined, error);

      const entries = buffer.getEntries();
      expect(entries[0].error?.stack).toBeDefined();
    });
  });

  describe('Log listeners', () => {
    it('should notify listeners on log', () => {
      const logs: string[] = [];
      const unsubscribe = addLogListener((entry) => {
        logs.push(entry.message);
      });

      logInfo('Test 1');
      logInfo('Test 2');

      expect(logs).toEqual(['Test 1', 'Test 2']);

      unsubscribe();

      logInfo('Test 3');
      expect(logs).toHaveLength(2); // No change
    });
  });

  describe('createChildLogger', () => {
    it('should create logger with preset context', () => {
      const child = createChildLogger({ component: 'test' });

      child.info('Child message');

      const entries = buffer.getEntries();
      expect(entries[0].context?.component).toBe('test');
    });

    it('should merge additional context', () => {
      const child = createChildLogger({ component: 'test' });

      child.info('Child message', { extra: 'data' });

      const entries = buffer.getEntries();
      expect(entries[0].context?.component).toBe('test');
      expect(entries[0].context?.extra).toBe('data');
    });

    it('should support all log levels', () => {
      const child = createChildLogger({ component: 'test' });

      child.debug('Debug');
      child.info('Info');
      child.warn('Warn');
      child.error('Error');

      expect(buffer.getEntriesByLevel('debug')).toHaveLength(1);
      expect(buffer.getEntriesByLevel('info')).toHaveLength(1);
      expect(buffer.getEntriesByLevel('warn')).toHaveLength(1);
      expect(buffer.getEntriesByLevel('error')).toHaveLength(1);
    });
  });

  describe('createTimedLog', () => {
    it('should log start and end', async () => {
      const timer = createTimedLog('Operation');

      await new Promise((resolve) => setTimeout(resolve, 10));

      timer.end();

      const entries = buffer.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].message).toContain('started');
      expect(entries[1].message).toContain('completed');
      expect(entries[1].context?.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('should include additional context on end', () => {
      const timer = createTimedLog('Operation');
      timer.end({ result: 'success' });

      const entries = buffer.getEntries();
      expect(entries[1].context?.result).toBe('success');
    });
  });

  describe('withTimedLog', () => {
    it('should time async function', async () => {
      await withTimedLog('Async op', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      });

      const entries = buffer.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[1].context?.status).toBe('success');
    });

    it('should handle errors', async () => {
      try {
        await withTimedLog('Failing op', async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const entries = buffer.getEntries();
      expect(entries[1].context?.status).toBe('error');
    });
  });

  describe('LogBuffer', () => {
    it('should collect entries', () => {
      logInfo('Test 1');
      logWarn('Test 2');

      expect(buffer.getEntries()).toHaveLength(2);
    });

    it('should filter by level', () => {
      logInfo('Info');
      logWarn('Warn');
      logError('Error');

      expect(buffer.getEntriesByLevel('warn')).toHaveLength(1);
      expect(buffer.getEntriesByLevel('warn')[0].message).toBe('Warn');
    });

    it('should clear entries', () => {
      logInfo('Test');
      expect(buffer.getEntries()).toHaveLength(1);

      buffer.clear();
      expect(buffer.getEntries()).toHaveLength(0);
    });

    it('should stop collecting when stopped', () => {
      logInfo('Before');
      buffer.stop();
      logInfo('After');

      expect(buffer.getEntries()).toHaveLength(1);
      expect(buffer.getEntries()[0].message).toBe('Before');
    });
  });

  describe('Log formatting', () => {
    it('should create valid JSON entries', () => {
      configureLogger({ format: 'json' });
      logInfo('Test', { key: 'value' });

      const entries = buffer.getEntries();
      expect(entries[0].timestamp).toBeDefined();
      expect(entries[0].level).toBe('info');
      expect(entries[0].message).toBe('Test');
    });

    it('should include all fields in entry', () => {
      const context = createTraceContext('format-test1');

      withTraceContext(context, () => {
        logInfo('Complete entry', { extra: 'data' });
      });

      const entries = buffer.getEntries();
      expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entries[0].correlationId).toBe('format-test1');
      expect(entries[0].context?.extra).toBe('data');
    });
  });
});
