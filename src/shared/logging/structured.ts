/**
 * Structured Logging
 *
 * Provides JSON-formatted logging with context, correlation IDs,
 * and integration with the tracing system.
 */

import { format as formatMessage } from 'node:util';
import { getCorrelationId, getTraceContext } from '../tracing/context.js';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry
 */
export interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Correlation ID from trace context */
  correlationId?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Error details if applicable */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Source location */
  source?: string;
  /** Duration in ms for timed operations */
  durationMs?: number;
}

/**
 * Log output format
 */
export type LogFormat = 'json' | 'text' | 'pretty';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: LogLevel;
  /** Output format */
  format: LogFormat;
  /** Whether to include stack traces */
  includeStackTrace: boolean;
  /** Whether to include correlation IDs */
  includeCorrelationId: boolean;
  /** Whether to include timestamps */
  includeTimestamp: boolean;
  /** Whether to colorize output (only for text/pretty formats) */
  colorize: boolean;
  /** Output destination */
  output: 'stdout' | 'stderr' | 'both';
  /** Custom context to include in all logs */
  defaultContext?: Record<string, unknown>;
}

/**
 * Log level priority
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ANSI color codes
 */
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  format: 'text',
  includeStackTrace: true,
  includeCorrelationId: true,
  includeTimestamp: true,
  colorize: true,
  output: 'stderr',
};

/**
 * Current configuration
 */
let currentConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Log listeners
 */
type LogListener = (entry: LogEntry) => void;
const listeners: LogListener[] = [];

/**
 * Configure the structured logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...currentConfig };
}

/**
 * Add a log listener
 */
export function addLogListener(listener: LogListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentConfig.level];
}

/**
 * Create a log entry
 */
function createEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (currentConfig.includeCorrelationId) {
    const correlationId = getCorrelationId();
    if (correlationId) {
      entry.correlationId = correlationId;
    }
  }

  if (context || currentConfig.defaultContext) {
    entry.context = { ...currentConfig.defaultContext, ...context };
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
    };
    if (currentConfig.includeStackTrace && error.stack) {
      entry.error.stack = error.stack;
    }
  }

  return entry;
}

/**
 * Format entry as JSON
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Format entry as text
 */
function formatText(entry: LogEntry, colorize: boolean): string {
  const parts: string[] = [];

  // Timestamp
  if (currentConfig.includeTimestamp) {
    const ts = colorize
      ? `${COLORS.dim}${entry.timestamp}${COLORS.reset}`
      : entry.timestamp;
    parts.push(ts);
  }

  // Level
  let levelStr = entry.level.toUpperCase().padEnd(5);
  if (colorize) {
    switch (entry.level) {
      case 'debug':
        levelStr = `${COLORS.gray}${levelStr}${COLORS.reset}`;
        break;
      case 'info':
        levelStr = `${COLORS.blue}${levelStr}${COLORS.reset}`;
        break;
      case 'warn':
        levelStr = `${COLORS.yellow}${levelStr}${COLORS.reset}`;
        break;
      case 'error':
        levelStr = `${COLORS.red}${levelStr}${COLORS.reset}`;
        break;
    }
  }
  parts.push(`[${levelStr}]`);

  // Correlation ID
  if (entry.correlationId) {
    const cid = entry.correlationId.slice(0, 8);
    parts.push(colorize ? `${COLORS.cyan}[${cid}]${COLORS.reset}` : `[${cid}]`);
  }

  // Message
  parts.push(entry.message);

  // Context
  if (entry.context && Object.keys(entry.context).length > 0) {
    const ctx = Object.entries(entry.context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    parts.push(colorize ? `${COLORS.dim}${ctx}${COLORS.reset}` : ctx);
  }

  // Error
  if (entry.error) {
    const errStr = `${entry.error.name}: ${entry.error.message}`;
    parts.push(colorize ? `${COLORS.red}${errStr}${COLORS.reset}` : errStr);
  }

  let result = parts.join(' ');

  // Stack trace
  if (entry.error?.stack) {
    result += '\n' + (colorize ? `${COLORS.dim}${entry.error.stack}${COLORS.reset}` : entry.error.stack);
  }

  return result;
}

/**
 * Format entry as pretty JSON
 */
function formatPretty(entry: LogEntry): string {
  return JSON.stringify(entry, null, 2);
}

/**
 * Format a log entry according to config
 */
function formatEntry(entry: LogEntry): string {
  switch (currentConfig.format) {
    case 'json':
      return formatJson(entry);
    case 'pretty':
      return formatPretty(entry);
    case 'text':
    default:
      return formatText(entry, currentConfig.colorize);
  }
}

/**
 * Output a log entry
 */
function outputEntry(entry: LogEntry): void {
  const formatted = formatEntry(entry);

  switch (currentConfig.output) {
    case 'stdout':
      process.stdout.write(formatted + '\n');
      break;
    case 'both':
      process.stdout.write(formatted + '\n');
      process.stderr.write(formatted + '\n');
      break;
    case 'stderr':
    default:
      process.stderr.write(formatted + '\n');
      break;
  }

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // Ignore listener errors
    }
  }
}

/**
 * Log a message at a specific level
 */
function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  if (!shouldLog(level)) return;

  const entry = createEntry(level, message, context, error);
  outputEntry(entry);
}

/**
 * Log a debug message
 */
export function logDebug(
  message: string,
  context?: Record<string, unknown>
): void {
  log('debug', message, context);
}

/**
 * Log an info message
 */
export function logInfo(
  message: string,
  context?: Record<string, unknown>
): void {
  log('info', message, context);
}

/**
 * Log a warning message
 */
export function logWarn(
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  log('warn', message, context, error);
}

/**
 * Log an error message
 */
export function logError(
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  log('error', message, context, error);
}

/**
 * Create a child logger with preset context
 */
export function createChildLogger(
  defaultContext: Record<string, unknown>
): {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>, error?: Error) => void;
  error: (message: string, context?: Record<string, unknown>, error?: Error) => void;
} {
  return {
    debug: (message, context) =>
      log('debug', message, { ...defaultContext, ...context }),
    info: (message, context) =>
      log('info', message, { ...defaultContext, ...context }),
    warn: (message, context, error) =>
      log('warn', message, { ...defaultContext, ...context }, error),
    error: (message, context, error) =>
      log('error', message, { ...defaultContext, ...context }, error),
  };
}

/**
 * Create a timed logger that logs duration
 */
export function createTimedLog(
  message: string,
  context?: Record<string, unknown>
): { end: (additionalContext?: Record<string, unknown>) => void } {
  const startTime = Date.now();
  logDebug(`${message} started`, context);

  return {
    end: (additionalContext) => {
      const durationMs = Date.now() - startTime;
      logInfo(`${message} completed`, {
        ...context,
        ...additionalContext,
        durationMs,
      });
    },
  };
}

/**
 * Wrap an async function with timing logs
 */
export async function withTimedLog<T>(
  name: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const timer = createTimedLog(name, context);
  try {
    const result = await fn();
    timer.end({ status: 'success' });
    return result;
  } catch (error) {
    timer.end({ status: 'error' });
    throw error;
  }
}

/**
 * Log entries buffer for testing
 */
export class LogBuffer {
  private entries: LogEntry[] = [];
  private unsubscribe: (() => void) | undefined;

  start(): void {
    this.entries = [];
    this.unsubscribe = addLogListener((entry) => {
      this.entries.push(entry);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  clear(): void {
    this.entries = [];
  }
}
