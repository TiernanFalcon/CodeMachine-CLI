/**
 * Memory and Resource Monitoring
 *
 * Provides real-time monitoring of system resources including memory usage,
 * CPU utilization, and process health for production observability.
 *
 * ## Features
 * - Memory usage tracking (heap, RSS, external)
 * - CPU usage monitoring
 * - Event loop lag detection
 * - Resource usage alerts
 * - Historical metrics collection
 *
 * ## Usage
 *
 * ```typescript
 * import { ResourceMonitor, getMemoryUsage } from './resource-monitor';
 *
 * // Quick one-time check
 * const memory = getMemoryUsage();
 * console.log(`Heap: ${memory.heapUsedMB}MB / ${memory.heapTotalMB}MB`);
 *
 * // Continuous monitoring
 * const monitor = new ResourceMonitor({ intervalMs: 5000 });
 * monitor.on('metrics', (metrics) => console.log(metrics));
 * monitor.on('alert', (alert) => console.warn(alert));
 * monitor.start();
 * ```
 *
 * @module resource-monitor
 */

/**
 * Memory usage metrics
 */
export interface MemoryMetrics {
  /** Total heap size in bytes */
  heapTotal: number;
  /** Used heap size in bytes */
  heapUsed: number;
  /** Resident set size in bytes */
  rss: number;
  /** External memory in bytes */
  external: number;
  /** Array buffers size in bytes */
  arrayBuffers: number;
  /** Total heap size in MB */
  heapTotalMB: number;
  /** Used heap size in MB */
  heapUsedMB: number;
  /** Resident set size in MB */
  rssMB: number;
  /** Heap usage percentage */
  heapUsagePercent: number;
}

/**
 * CPU usage metrics
 */
export interface CpuMetrics {
  /** User CPU time in microseconds */
  user: number;
  /** System CPU time in microseconds */
  system: number;
  /** Total CPU time in microseconds */
  total: number;
  /** CPU usage percentage (0-100) */
  usagePercent: number;
}

/**
 * Event loop metrics
 */
export interface EventLoopMetrics {
  /** Current event loop lag in ms */
  lagMs: number;
  /** Whether the event loop is considered lagging */
  isLagging: boolean;
}

/**
 * Complete resource metrics
 */
export interface ResourceMetrics {
  /** Timestamp of the metrics */
  timestamp: Date;
  /** Memory metrics */
  memory: MemoryMetrics;
  /** CPU metrics */
  cpu: CpuMetrics;
  /** Event loop metrics */
  eventLoop: EventLoopMetrics;
  /** Process uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Resource alert types
 */
export type AlertType = 'memory_high' | 'memory_critical' | 'cpu_high' | 'event_loop_lag';

/**
 * Resource alert
 */
export interface ResourceAlert {
  /** Alert type */
  type: AlertType;
  /** Alert message */
  message: string;
  /** Current value */
  value: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Resource monitor configuration
 */
export interface ResourceMonitorConfig {
  /** Monitoring interval in ms */
  intervalMs: number;
  /** Memory warning threshold (percentage) */
  memoryWarningPercent: number;
  /** Memory critical threshold (percentage) */
  memoryCriticalPercent: number;
  /** CPU warning threshold (percentage) */
  cpuWarningPercent: number;
  /** Event loop lag threshold in ms */
  eventLoopLagThresholdMs: number;
  /** Maximum metrics to keep in history */
  maxHistorySize: number;
}

/**
 * Default configuration
 */
export const DEFAULT_MONITOR_CONFIG: ResourceMonitorConfig = {
  intervalMs: 10000, // 10 seconds
  memoryWarningPercent: 80,
  memoryCriticalPercent: 95,
  cpuWarningPercent: 90,
  eventLoopLagThresholdMs: 100,
  maxHistorySize: 100,
};

/**
 * Convert bytes to megabytes
 */
function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): MemoryMetrics {
  const mem = process.memoryUsage();

  return {
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    rss: mem.rss,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
    heapTotalMB: bytesToMB(mem.heapTotal),
    heapUsedMB: bytesToMB(mem.heapUsed),
    rssMB: bytesToMB(mem.rss),
    heapUsagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
  };
}

/**
 * Get CPU usage since last call
 */
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

export function getCpuUsage(): CpuMetrics {
  const current = process.cpuUsage(lastCpuUsage);
  const elapsed = Date.now() - lastCpuTime;

  // Calculate percentage (microseconds to percentage)
  const totalCpu = current.user + current.system;
  const usagePercent = elapsed > 0 ? Math.round((totalCpu / (elapsed * 1000)) * 100) : 0;

  // Update baseline
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = Date.now();

  return {
    user: current.user,
    system: current.system,
    total: totalCpu,
    usagePercent: Math.min(100, usagePercent),
  };
}

/**
 * Measure event loop lag
 */
export function measureEventLoopLag(): Promise<EventLoopMetrics> {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      resolve({
        lagMs: lag,
        isLagging: lag > DEFAULT_MONITOR_CONFIG.eventLoopLagThresholdMs,
      });
    });
  });
}

/**
 * Get complete resource metrics
 */
export async function getResourceMetrics(): Promise<ResourceMetrics> {
  const [eventLoop] = await Promise.all([measureEventLoopLag()]);

  return {
    timestamp: new Date(),
    memory: getMemoryUsage(),
    cpu: getCpuUsage(),
    eventLoop,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

/**
 * Resource monitor event types
 */
type MonitorEventType = 'metrics' | 'alert' | 'start' | 'stop';

/**
 * Resource monitor event listener
 */
type MonitorEventListener<T> = (data: T) => void;

/**
 * Resource monitor class for continuous monitoring
 */
export class ResourceMonitor {
  private config: ResourceMonitorConfig;
  private interval: ReturnType<typeof setInterval> | null = null;
  private history: ResourceMetrics[] = [];
  private listeners: Map<MonitorEventType, MonitorEventListener<unknown>[]> = new Map();
  private isRunning = false;

  constructor(config: Partial<ResourceMonitorConfig> = {}) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('start', { timestamp: new Date() });

    // Initial collection
    this.collect();

    // Set up interval
    this.interval = setInterval(() => this.collect(), this.config.intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    this.emit('stop', { timestamp: new Date() });
  }

  /**
   * Check if monitoring is active
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get metrics history
   */
  getHistory(): ResourceMetrics[] {
    return [...this.history];
  }

  /**
   * Get the latest metrics
   */
  getLatest(): ResourceMetrics | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Clear metrics history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Add event listener
   */
  on(event: 'metrics', listener: MonitorEventListener<ResourceMetrics>): () => void;
  on(event: 'alert', listener: MonitorEventListener<ResourceAlert>): () => void;
  on(event: 'start' | 'stop', listener: MonitorEventListener<{ timestamp: Date }>): () => void;
  on(event: MonitorEventType, listener: MonitorEventListener<unknown>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Collect metrics and check thresholds
   */
  private async collect(): Promise<void> {
    try {
      const metrics = await getResourceMetrics();

      // Add to history
      this.history.push(metrics);
      if (this.history.length > this.config.maxHistorySize) {
        this.history.shift();
      }

      // Emit metrics event
      this.emit('metrics', metrics);

      // Check thresholds
      this.checkThresholds(metrics);
    } catch (error) {
      // Log collection errors at debug level - may occur during shutdown
      if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG) {
        console.error('[DEBUG] Resource collection error:', error instanceof Error ? error.message : error);
      }
    }
  }

  /**
   * Check resource thresholds and emit alerts
   */
  private checkThresholds(metrics: ResourceMetrics): void {
    // Memory checks
    if (metrics.memory.heapUsagePercent >= this.config.memoryCriticalPercent) {
      this.emit('alert', {
        type: 'memory_critical',
        message: `Critical memory usage: ${metrics.memory.heapUsagePercent}%`,
        value: metrics.memory.heapUsagePercent,
        threshold: this.config.memoryCriticalPercent,
        timestamp: new Date(),
      } as ResourceAlert);
    } else if (metrics.memory.heapUsagePercent >= this.config.memoryWarningPercent) {
      this.emit('alert', {
        type: 'memory_high',
        message: `High memory usage: ${metrics.memory.heapUsagePercent}%`,
        value: metrics.memory.heapUsagePercent,
        threshold: this.config.memoryWarningPercent,
        timestamp: new Date(),
      } as ResourceAlert);
    }

    // CPU check
    if (metrics.cpu.usagePercent >= this.config.cpuWarningPercent) {
      this.emit('alert', {
        type: 'cpu_high',
        message: `High CPU usage: ${metrics.cpu.usagePercent}%`,
        value: metrics.cpu.usagePercent,
        threshold: this.config.cpuWarningPercent,
        timestamp: new Date(),
      } as ResourceAlert);
    }

    // Event loop check
    if (metrics.eventLoop.isLagging) {
      this.emit('alert', {
        type: 'event_loop_lag',
        message: `Event loop lag: ${metrics.eventLoop.lagMs}ms`,
        value: metrics.eventLoop.lagMs,
        threshold: this.config.eventLoopLagThresholdMs,
        timestamp: new Date(),
      } as ResourceAlert);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit<T>(event: MonitorEventType, data: T): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as MonitorEventListener<T>)(data);
        } catch (listenerError) {
          // Log listener errors at debug level to aid troubleshooting
          if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG) {
            console.error('[DEBUG] Resource monitor listener error:', listenerError instanceof Error ? listenerError.message : listenerError);
          }
        }
      }
    }
  }
}

/**
 * Format memory metrics for display
 */
export function formatMemoryMetrics(metrics: MemoryMetrics): string {
  return [
    `Heap: ${metrics.heapUsedMB}MB / ${metrics.heapTotalMB}MB (${metrics.heapUsagePercent}%)`,
    `RSS: ${metrics.rssMB}MB`,
  ].join(' | ');
}

/**
 * Format resource metrics for display
 */
export function formatResourceMetrics(metrics: ResourceMetrics): string {
  return [
    `Memory: ${formatMemoryMetrics(metrics.memory)}`,
    `CPU: ${metrics.cpu.usagePercent}%`,
    `Event Loop Lag: ${metrics.eventLoop.lagMs}ms`,
    `Uptime: ${metrics.uptimeSeconds}s`,
  ].join(' | ');
}

/**
 * Get a summary of current resource usage
 */
export async function getResourceSummary(): Promise<{
  healthy: boolean;
  issues: string[];
  metrics: ResourceMetrics;
}> {
  const metrics = await getResourceMetrics();
  const issues: string[] = [];

  if (metrics.memory.heapUsagePercent >= DEFAULT_MONITOR_CONFIG.memoryCriticalPercent) {
    issues.push(`Critical memory usage: ${metrics.memory.heapUsagePercent}%`);
  } else if (metrics.memory.heapUsagePercent >= DEFAULT_MONITOR_CONFIG.memoryWarningPercent) {
    issues.push(`High memory usage: ${metrics.memory.heapUsagePercent}%`);
  }

  if (metrics.cpu.usagePercent >= DEFAULT_MONITOR_CONFIG.cpuWarningPercent) {
    issues.push(`High CPU usage: ${metrics.cpu.usagePercent}%`);
  }

  if (metrics.eventLoop.isLagging) {
    issues.push(`Event loop lag: ${metrics.eventLoop.lagMs}ms`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    metrics,
  };
}
