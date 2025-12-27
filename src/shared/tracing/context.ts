/**
 * Trace Context Management
 *
 * Provides async-safe context propagation for tracing information.
 * Uses AsyncLocalStorage for automatic context propagation across async boundaries.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { generateCorrelationId } from './correlation.js';

/**
 * Trace context containing all tracing information
 */
export interface TraceContext {
  /** Unique correlation ID for this trace */
  correlationId: string;
  /** Optional parent span ID for nested operations */
  parentSpanId?: string;
  /** Optional trace start time */
  startTime: number;
  /** Custom attributes for this trace */
  attributes: Record<string, unknown>;
  /** Tags for categorization */
  tags: string[];
}

/**
 * Async local storage for trace context
 */
const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Create a new trace context
 */
export function createTraceContext(
  correlationId?: string,
  parentSpanId?: string
): TraceContext {
  return {
    correlationId: correlationId ?? generateCorrelationId(),
    parentSpanId,
    startTime: Date.now(),
    attributes: {},
    tags: [],
  };
}

/**
 * Get the current trace context
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Get the current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return traceStorage.getStore()?.correlationId;
}

/**
 * Run a function within a trace context
 */
export function withTraceContext<T>(
  context: TraceContext,
  fn: () => T
): T {
  return traceStorage.run(context, fn);
}

/**
 * Run a function with a new trace context
 */
export function withNewTrace<T>(
  fn: () => T,
  correlationId?: string
): T {
  const context = createTraceContext(correlationId);
  return withTraceContext(context, fn);
}

/**
 * Run an async function within a trace context
 */
export async function withTraceContextAsync<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  return traceStorage.run(context, fn);
}

/**
 * Run an async function with a new trace context
 */
export async function withNewTraceAsync<T>(
  fn: () => Promise<T>,
  correlationId?: string
): Promise<T> {
  const context = createTraceContext(correlationId);
  return withTraceContextAsync(context, fn);
}

/**
 * Add an attribute to the current trace context
 */
export function setTraceAttribute(key: string, value: unknown): void {
  const context = traceStorage.getStore();
  if (context) {
    context.attributes[key] = value;
  }
}

/**
 * Add multiple attributes to the current trace context
 */
export function setTraceAttributes(attributes: Record<string, unknown>): void {
  const context = traceStorage.getStore();
  if (context) {
    Object.assign(context.attributes, attributes);
  }
}

/**
 * Get an attribute from the current trace context
 */
export function getTraceAttribute<T = unknown>(key: string): T | undefined {
  const context = traceStorage.getStore();
  return context?.attributes[key] as T | undefined;
}

/**
 * Add a tag to the current trace context
 */
export function addTraceTag(tag: string): void {
  const context = traceStorage.getStore();
  if (context && !context.tags.includes(tag)) {
    context.tags.push(tag);
  }
}

/**
 * Check if the current trace has a tag
 */
export function hasTraceTag(tag: string): boolean {
  const context = traceStorage.getStore();
  return context?.tags.includes(tag) ?? false;
}

/**
 * Get trace duration since start
 */
export function getTraceDuration(): number | undefined {
  const context = traceStorage.getStore();
  return context ? Date.now() - context.startTime : undefined;
}

/**
 * Create a child context for nested operations
 */
export function createChildContext(
  parentContext: TraceContext,
  spanId: string
): TraceContext {
  return {
    correlationId: parentContext.correlationId,
    parentSpanId: spanId,
    startTime: Date.now(),
    attributes: { ...parentContext.attributes },
    tags: [...parentContext.tags],
  };
}
