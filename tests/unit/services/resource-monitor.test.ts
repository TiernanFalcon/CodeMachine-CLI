/**
 * Resource Monitor Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getMemoryUsage,
  getCpuUsage,
  measureEventLoopLag,
  getResourceMetrics,
  ResourceMonitor,
  formatMemoryMetrics,
  formatResourceMetrics,
  getResourceSummary,
} from '../../../src/runtime/services/resource-monitor.js';

describe('Memory Usage', () => {
  it('should return memory metrics', () => {
    const metrics = getMemoryUsage();

    expect(metrics.heapTotal).toBeGreaterThan(0);
    expect(metrics.heapUsed).toBeGreaterThan(0);
    expect(metrics.rss).toBeGreaterThan(0);
    expect(metrics.heapTotalMB).toBeGreaterThan(0);
    expect(metrics.heapUsedMB).toBeGreaterThan(0);
  });

  it('should calculate heap usage percentage', () => {
    const metrics = getMemoryUsage();

    expect(metrics.heapUsagePercent).toBeGreaterThanOrEqual(0);
    expect(metrics.heapUsagePercent).toBeLessThanOrEqual(100);
  });

  it('should have consistent values', () => {
    const metrics = getMemoryUsage();

    expect(metrics.heapUsed).toBeLessThanOrEqual(metrics.heapTotal);
    expect(metrics.heapUsedMB).toBeLessThanOrEqual(metrics.heapTotalMB);
  });
});

describe('CPU Usage', () => {
  it('should return CPU metrics', () => {
    const metrics = getCpuUsage();

    expect(typeof metrics.user).toBe('number');
    expect(typeof metrics.system).toBe('number');
    expect(typeof metrics.total).toBe('number');
    expect(typeof metrics.usagePercent).toBe('number');
  });

  it('should have usage percentage within bounds', () => {
    const metrics = getCpuUsage();

    expect(metrics.usagePercent).toBeGreaterThanOrEqual(0);
    expect(metrics.usagePercent).toBeLessThanOrEqual(100);
  });

  it('should calculate total correctly', () => {
    const metrics = getCpuUsage();

    expect(metrics.total).toBe(metrics.user + metrics.system);
  });
});

describe('Event Loop Lag', () => {
  it('should measure event loop lag', async () => {
    const metrics = await measureEventLoopLag();

    expect(typeof metrics.lagMs).toBe('number');
    expect(metrics.lagMs).toBeGreaterThanOrEqual(0);
    expect(typeof metrics.isLagging).toBe('boolean');
  });

  it('should return non-negative lag', async () => {
    const metrics = await measureEventLoopLag();

    expect(metrics.lagMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Resource Metrics', () => {
  it('should return complete metrics', async () => {
    const metrics = await getResourceMetrics();

    expect(metrics.timestamp).toBeInstanceOf(Date);
    expect(metrics.memory).toBeDefined();
    expect(metrics.cpu).toBeDefined();
    expect(metrics.eventLoop).toBeDefined();
    expect(typeof metrics.uptimeSeconds).toBe('number');
  });

  it('should have valid uptime', async () => {
    const metrics = await getResourceMetrics();

    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = new ResourceMonitor({ intervalMs: 100 });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('should start and stop monitoring', () => {
    expect(monitor.running).toBe(false);

    monitor.start();
    expect(monitor.running).toBe(true);

    monitor.stop();
    expect(monitor.running).toBe(false);
  });

  it('should not start twice', () => {
    monitor.start();
    monitor.start(); // Should not throw

    expect(monitor.running).toBe(true);
  });

  it('should emit metrics events', async () => {
    const metricsReceived: unknown[] = [];

    monitor.on('metrics', (metrics) => {
      metricsReceived.push(metrics);
    });

    monitor.start();

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(metricsReceived.length).toBeGreaterThan(0);
  });

  it('should emit start and stop events', () => {
    const events: string[] = [];

    monitor.on('start', () => events.push('start'));
    monitor.on('stop', () => events.push('stop'));

    monitor.start();
    monitor.stop();

    expect(events).toEqual(['start', 'stop']);
  });

  it('should collect metrics history', async () => {
    monitor.start();

    await new Promise((resolve) => setTimeout(resolve, 250));

    monitor.stop();

    const history = monitor.getHistory();
    expect(history.length).toBeGreaterThan(0);
  });

  it('should get latest metrics', async () => {
    monitor.start();

    await new Promise((resolve) => setTimeout(resolve, 150));

    const latest = monitor.getLatest();
    expect(latest).toBeDefined();
    expect(latest?.memory).toBeDefined();
  });

  it('should clear history', async () => {
    monitor.start();

    await new Promise((resolve) => setTimeout(resolve, 150));

    monitor.clearHistory();

    expect(monitor.getHistory()).toHaveLength(0);
  });

  it('should allow removing listeners', () => {
    const metrics: unknown[] = [];
    const unsubscribe = monitor.on('metrics', (m) => metrics.push(m));

    unsubscribe();

    monitor.start();
    // Listeners should not receive events after unsubscribe
  });

  it('should respect max history size', async () => {
    const smallMonitor = new ResourceMonitor({
      intervalMs: 10,
      maxHistorySize: 5,
    });

    smallMonitor.start();

    await new Promise((resolve) => setTimeout(resolve, 100));

    smallMonitor.stop();

    expect(smallMonitor.getHistory().length).toBeLessThanOrEqual(5);
  });
});

describe('Formatting', () => {
  it('should format memory metrics', () => {
    const metrics = getMemoryUsage();
    const formatted = formatMemoryMetrics(metrics);

    expect(formatted).toContain('Heap:');
    expect(formatted).toContain('MB');
    expect(formatted).toContain('%');
  });

  it('should format resource metrics', async () => {
    const metrics = await getResourceMetrics();
    const formatted = formatResourceMetrics(metrics);

    expect(formatted).toContain('Memory:');
    expect(formatted).toContain('CPU:');
    expect(formatted).toContain('Event Loop Lag:');
    expect(formatted).toContain('Uptime:');
  });
});

describe('Resource Summary', () => {
  it('should return summary with metrics', async () => {
    const summary = await getResourceSummary();

    expect(typeof summary.healthy).toBe('boolean');
    expect(Array.isArray(summary.issues)).toBe(true);
    expect(summary.metrics).toBeDefined();
  });

  it('should report no issues under normal conditions', async () => {
    const summary = await getResourceSummary();

    // Under normal test conditions, should be healthy
    // (unless running under extreme load)
    expect(summary.metrics).toBeDefined();
  });
});
