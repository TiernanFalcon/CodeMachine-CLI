/**
 * Span Tracing for Operations
 *
 * Provides detailed timing and context tracking for individual operations.
 */

import { randomBytes } from 'node:crypto';
import {
  getTraceContext,
  createChildContext,
  withTraceContext,
  getCorrelationId,
} from './context.js';

/**
 * Span status indicating operation outcome
 */
export type SpanStatus = 'ok' | 'error' | 'cancelled';

/**
 * Span representing a traced operation
 */
export interface Span {
  /** Unique span ID */
  id: string;
  /** Operation name */
  name: string;
  /** Parent span ID if nested */
  parentId?: string;
  /** Correlation ID for the trace */
  correlationId: string;
  /** Start time in milliseconds */
  startTime: number;
  /** End time in milliseconds (set when finished) */
  endTime?: number;
  /** Duration in milliseconds (set when finished) */
  duration?: number;
  /** Span status */
  status: SpanStatus;
  /** Error message if status is error */
  errorMessage?: string;
  /** Span attributes */
  attributes: Record<string, unknown>;
  /** Child spans */
  children: Span[];
}

/**
 * Active span tracker
 */
interface ActiveSpan {
  span: Span;
  finish: (status?: SpanStatus, errorMessage?: string) => Span;
}

/**
 * Span event listener
 */
export type SpanEventListener = (span: Span) => void;

/**
 * Global span listeners
 */
const spanListeners: SpanEventListener[] = [];

/**
 * Add a listener for completed spans
 */
export function onSpanComplete(listener: SpanEventListener): () => void {
  spanListeners.push(listener);
  return () => {
    const index = spanListeners.indexOf(listener);
    if (index >= 0) {
      spanListeners.splice(index, 1);
    }
  };
}

/**
 * Emit a completed span to all listeners
 */
function emitSpan(span: Span): void {
  for (const listener of spanListeners) {
    try {
      listener(span);
    } catch (listenerError) {
      // Log listener errors at debug level
      if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG) {
        console.error('[DEBUG] Span listener error:', listenerError instanceof Error ? listenerError.message : listenerError);
      }
    }
  }
}

/**
 * Generate a span ID
 */
function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Create and start a new span
 */
export function startSpan(name: string, attributes?: Record<string, unknown>): ActiveSpan {
  const context = getTraceContext();
  const correlationId = context?.correlationId ?? 'unknown';
  const parentId = context?.parentSpanId;

  const span: Span = {
    id: generateSpanId(),
    name,
    parentId,
    correlationId,
    startTime: Date.now(),
    status: 'ok',
    attributes: attributes ?? {},
    children: [],
  };

  const finish = (status: SpanStatus = 'ok', errorMessage?: string): Span => {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    span.errorMessage = errorMessage;
    emitSpan(span);
    return span;
  };

  return { span, finish };
}

/**
 * Execute a function within a span
 */
export function withSpan<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, unknown>
): T {
  const { span, finish } = startSpan(name, attributes);
  const context = getTraceContext();

  try {
    const childContext = context
      ? createChildContext(context, span.id)
      : undefined;

    const result = childContext
      ? withTraceContext(childContext, () => fn(span))
      : fn(span);

    finish('ok');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finish('error', message);
    throw error;
  }
}

/**
 * Execute an async function within a span
 */
export async function withSpanAsync<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const { span, finish } = startSpan(name, attributes);
  const context = getTraceContext();

  try {
    const childContext = context
      ? createChildContext(context, span.id)
      : undefined;

    const result = childContext
      ? await withTraceContext(childContext, () => fn(span))
      : await fn(span);

    finish('ok');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finish('error', message);
    throw error;
  }
}

/**
 * Add an attribute to a span
 */
export function setSpanAttribute(span: Span, key: string, value: unknown): void {
  span.attributes[key] = value;
}

/**
 * Add multiple attributes to a span
 */
export function setSpanAttributes(span: Span, attributes: Record<string, unknown>): void {
  Object.assign(span.attributes, attributes);
}

/**
 * Create a span summary for logging
 */
export function spanToSummary(span: Span): string {
  const status = span.status === 'ok' ? '✓' : span.status === 'error' ? '✗' : '○';
  const duration = span.duration !== undefined ? `${span.duration}ms` : 'running';
  const error = span.errorMessage ? ` - ${span.errorMessage}` : '';

  return `[${span.correlationId.slice(0, 8)}] ${status} ${span.name} (${duration})${error}`;
}

/**
 * Create a detailed span log
 */
export function spanToLog(span: Span): Record<string, unknown> {
  return {
    spanId: span.id,
    parentId: span.parentId,
    correlationId: span.correlationId,
    name: span.name,
    status: span.status,
    startTime: new Date(span.startTime).toISOString(),
    endTime: span.endTime ? new Date(span.endTime).toISOString() : undefined,
    durationMs: span.duration,
    error: span.errorMessage,
    attributes: span.attributes,
    childCount: span.children.length,
  };
}

/**
 * Decorator for tracing methods
 */
export function traced(name?: string) {
  return function <T extends (...args: unknown[]) => unknown>(
    _target: object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> | void {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;

    const spanName = name ?? propertyKey;

    descriptor.value = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const result = withSpan(spanName, () => originalMethod.apply(this, args));
      return result as ReturnType<T>;
    } as T;

    return descriptor;
  };
}

/**
 * Collect all spans for a trace
 */
export class SpanCollector {
  private spans: Span[] = [];
  private unsubscribe: (() => void) | undefined;

  /**
   * Start collecting spans
   */
  start(): void {
    this.spans = [];
    this.unsubscribe = onSpanComplete((span) => {
      this.spans.push(span);
    });
  }

  /**
   * Stop collecting spans
   */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /**
   * Get collected spans
   */
  getSpans(): Span[] {
    return [...this.spans];
  }

  /**
   * Get spans for a specific correlation ID
   */
  getSpansForTrace(correlationId: string): Span[] {
    return this.spans.filter((s) => s.correlationId === correlationId);
  }

  /**
   * Build a span tree
   */
  buildTree(correlationId: string): Span[] {
    const spans = this.getSpansForTrace(correlationId);
    const spanMap = new Map<string, Span>();
    const roots: Span[] = [];

    // Create map of all spans
    for (const span of spans) {
      spanMap.set(span.id, { ...span, children: [] });
    }

    // Build tree structure
    for (const span of spans) {
      const spanCopy = spanMap.get(span.id)!;
      if (span.parentId) {
        const parent = spanMap.get(span.parentId);
        if (parent) {
          parent.children.push(spanCopy);
        } else {
          roots.push(spanCopy);
        }
      } else {
        roots.push(spanCopy);
      }
    }

    return roots;
  }

  /**
   * Clear collected spans
   */
  clear(): void {
    this.spans = [];
  }
}

/**
 * Format a span tree for display
 */
export function formatSpanTree(spans: Span[], indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const span of spans) {
    lines.push(`${prefix}${spanToSummary(span)}`);
    if (span.children.length > 0) {
      lines.push(formatSpanTree(span.children, indent + 1));
    }
  }

  return lines.join('\n');
}
