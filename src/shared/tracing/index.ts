/**
 * Request Tracing with Correlation IDs
 *
 * Provides distributed tracing capabilities for tracking requests
 * across the system, supporting debugging and observability.
 *
 * ## Features
 * - Unique correlation IDs for request tracking
 * - Async-safe context propagation using AsyncLocalStorage
 * - Span-based operation timing and tracking
 * - Nested span support for hierarchical tracing
 *
 * ## Usage
 *
 * ### Creating a Trace
 * ```typescript
 * import { withNewTraceAsync, getCorrelationId } from './tracing';
 *
 * await withNewTraceAsync(async () => {
 *   console.log('Correlation ID:', getCorrelationId());
 *   await doWork();
 * });
 * ```
 *
 * ### Tracing Operations with Spans
 * ```typescript
 * import { withSpanAsync, setSpanAttribute } from './tracing';
 *
 * await withSpanAsync('database-query', async (span) => {
 *   setSpanAttribute(span, 'table', 'users');
 *   return await db.query('SELECT * FROM users');
 * });
 * ```
 *
 * ### Collecting Trace Data
 * ```typescript
 * import { SpanCollector, formatSpanTree } from './tracing';
 *
 * const collector = new SpanCollector();
 * collector.start();
 *
 * // ... run traced operations ...
 *
 * const tree = collector.buildTree(correlationId);
 * console.log(formatSpanTree(tree));
 * collector.stop();
 * ```
 *
 * @module tracing
 */

export * from './correlation.js';
export * from './context.js';
export * from './span.js';
