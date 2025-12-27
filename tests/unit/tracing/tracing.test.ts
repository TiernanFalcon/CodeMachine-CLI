/**
 * Request Tracing Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  generateCorrelationId,
  isValidCorrelationId,
  parseCorrelationId,
  createCorrelationHeaders,
} from '../../../src/shared/tracing/correlation.js';
import {
  createTraceContext,
  getTraceContext,
  getCorrelationId,
  withTraceContext,
  withNewTrace,
  withNewTraceAsync,
  setTraceAttribute,
  setTraceAttributes,
  getTraceAttribute,
  addTraceTag,
  hasTraceTag,
  getTraceDuration,
  createChildContext,
} from '../../../src/shared/tracing/context.js';
import {
  startSpan,
  withSpan,
  withSpanAsync,
  setSpanAttribute,
  spanToSummary,
  spanToLog,
  onSpanComplete,
  SpanCollector,
  formatSpanTree,
} from '../../../src/shared/tracing/span.js';

describe('Correlation ID', () => {
  describe('generateCorrelationId', () => {
    it('should generate short IDs by default', () => {
      const id = generateCorrelationId();
      expect(id).toHaveLength(12);
      expect(/^[0-9a-f]{12}$/.test(id)).toBe(true);
    });

    it('should generate UUIDs when specified', () => {
      const id = generateCorrelationId('uuid');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate prefixed IDs when specified', () => {
      const id = generateCorrelationId('prefixed');
      expect(id).toMatch(/^[0-9a-z]+-[0-9a-f]{8}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('isValidCorrelationId', () => {
    it('should validate short IDs', () => {
      expect(isValidCorrelationId('abcd1234ef56')).toBe(true);
      expect(isValidCorrelationId('ABCD1234EF56')).toBe(true);
    });

    it('should validate UUIDs', () => {
      expect(isValidCorrelationId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should validate prefixed IDs', () => {
      expect(isValidCorrelationId('abc123-12345678')).toBe(true);
    });

    it('should reject invalid IDs', () => {
      expect(isValidCorrelationId('')).toBe(false);
      expect(isValidCorrelationId('too-short')).toBe(false);
      expect(isValidCorrelationId('not-valid-id')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidCorrelationId(null as any)).toBe(false);
      expect(isValidCorrelationId(undefined as any)).toBe(false);
      expect(isValidCorrelationId(123 as any)).toBe(false);
    });
  });

  describe('parseCorrelationId', () => {
    it('should parse valid string IDs', () => {
      const id = 'abcd1234ef56';
      expect(parseCorrelationId(id)).toBe(id);
    });

    it('should return undefined for invalid strings', () => {
      expect(parseCorrelationId('invalid')).toBeUndefined();
    });

    it('should extract from header objects', () => {
      expect(parseCorrelationId({ 'x-correlation-id': 'abcd1234ef56' })).toBe(
        'abcd1234ef56'
      );
      expect(parseCorrelationId({ 'x-request-id': 'abcd1234ef56' })).toBe(
        'abcd1234ef56'
      );
    });

    it('should try multiple header names', () => {
      expect(parseCorrelationId({ 'trace-id': 'abcd1234ef56' })).toBe(
        'abcd1234ef56'
      );
    });

    it('should return undefined if no valid header found', () => {
      expect(parseCorrelationId({ 'other-header': 'abcd1234ef56' })).toBeUndefined();
    });
  });

  describe('createCorrelationHeaders', () => {
    it('should create headers with correlation ID', () => {
      const headers = createCorrelationHeaders('abcd1234ef56');

      expect(headers['x-correlation-id']).toBe('abcd1234ef56');
      expect(headers['x-request-id']).toBe('abcd1234ef56');
    });
  });
});

describe('Trace Context', () => {
  describe('createTraceContext', () => {
    it('should create context with auto-generated ID', () => {
      const context = createTraceContext();

      expect(context.correlationId).toBeDefined();
      expect(isValidCorrelationId(context.correlationId)).toBe(true);
      expect(context.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('should use provided correlation ID', () => {
      const context = createTraceContext('custom-id-12');

      expect(context.correlationId).toBe('custom-id-12');
    });

    it('should set parent span ID', () => {
      const context = createTraceContext('custom-id-12', 'parent-span');

      expect(context.parentSpanId).toBe('parent-span');
    });
  });

  describe('Context propagation', () => {
    it('should propagate context within withTraceContext', () => {
      const context = createTraceContext('test-trace-01');

      withTraceContext(context, () => {
        expect(getTraceContext()).toBe(context);
        expect(getCorrelationId()).toBe('test-trace-01');
      });
    });

    it('should isolate context between calls', () => {
      const context1 = createTraceContext('trace-1-abcd');
      const context2 = createTraceContext('trace-2-efgh');

      withTraceContext(context1, () => {
        expect(getCorrelationId()).toBe('trace-1-abcd');
      });

      withTraceContext(context2, () => {
        expect(getCorrelationId()).toBe('trace-2-efgh');
      });
    });

    it('should propagate through async boundaries', async () => {
      const context = createTraceContext('async-trace1');

      await withNewTraceAsync(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(getTraceContext()).toBeDefined();
      }, 'async-trace1');
    });
  });

  describe('withNewTrace', () => {
    it('should create new trace with auto ID', () => {
      const result = withNewTrace(() => {
        return getCorrelationId();
      });

      expect(result).toBeDefined();
      expect(isValidCorrelationId(result!)).toBe(true);
    });

    it('should create new trace with provided ID', () => {
      const result = withNewTrace(() => {
        return getCorrelationId();
      }, 'provided-id1');

      expect(result).toBe('provided-id1');
    });
  });

  describe('Trace attributes', () => {
    it('should set and get attributes', () => {
      const context = createTraceContext();

      withTraceContext(context, () => {
        setTraceAttribute('key', 'value');
        expect(getTraceAttribute('key')).toBe('value');
      });
    });

    it('should set multiple attributes', () => {
      const context = createTraceContext();

      withTraceContext(context, () => {
        setTraceAttributes({ key1: 'value1', key2: 'value2' });
        expect(getTraceAttribute('key1')).toBe('value1');
        expect(getTraceAttribute('key2')).toBe('value2');
      });
    });

    it('should return undefined outside context', () => {
      expect(getTraceAttribute('key')).toBeUndefined();
    });
  });

  describe('Trace tags', () => {
    it('should add and check tags', () => {
      const context = createTraceContext();

      withTraceContext(context, () => {
        addTraceTag('important');
        expect(hasTraceTag('important')).toBe(true);
        expect(hasTraceTag('other')).toBe(false);
      });
    });

    it('should not duplicate tags', () => {
      const context = createTraceContext();

      withTraceContext(context, () => {
        addTraceTag('test');
        addTraceTag('test');
        expect(context.tags).toEqual(['test']);
      });
    });
  });

  describe('Trace duration', () => {
    it('should track duration', async () => {
      const context = createTraceContext();

      await withTraceContext(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const duration = getTraceDuration();
        expect(duration).toBeGreaterThanOrEqual(50);
      });
    });

    it('should return undefined outside context', () => {
      expect(getTraceDuration()).toBeUndefined();
    });
  });

  describe('Child context', () => {
    it('should create child with same correlation ID', () => {
      const parent = createTraceContext('parent-id-01');
      const child = createChildContext(parent, 'span-123');

      expect(child.correlationId).toBe('parent-id-01');
      expect(child.parentSpanId).toBe('span-123');
    });

    it('should inherit attributes', () => {
      const parent = createTraceContext();
      parent.attributes.key = 'value';

      const child = createChildContext(parent, 'span-123');

      expect(child.attributes.key).toBe('value');
    });

    it('should inherit tags', () => {
      const parent = createTraceContext();
      parent.tags.push('inherited');

      const child = createChildContext(parent, 'span-123');

      expect(child.tags).toContain('inherited');
    });
  });
});

describe('Span', () => {
  describe('startSpan', () => {
    it('should create span with name', () => {
      const { span } = startSpan('test-operation');

      expect(span.name).toBe('test-operation');
      expect(span.id).toBeDefined();
      expect(span.status).toBe('ok');
    });

    it('should set attributes', () => {
      const { span } = startSpan('test', { key: 'value' });

      expect(span.attributes.key).toBe('value');
    });

    it('should finish span with status', () => {
      const { span, finish } = startSpan('test');

      const finished = finish('error', 'Something failed');

      expect(finished.status).toBe('error');
      expect(finished.errorMessage).toBe('Something failed');
      expect(finished.duration).toBeDefined();
    });
  });

  describe('withSpan', () => {
    it('should execute function and return result', () => {
      const result = withSpan('test', () => 'result');
      expect(result).toBe('result');
    });

    it('should catch and rethrow errors', () => {
      expect(() =>
        withSpan('test', () => {
          throw new Error('test error');
        })
      ).toThrow('test error');
    });

    it('should emit completed spans', () => {
      const spans: any[] = [];
      const unsubscribe = onSpanComplete((span) => spans.push(span));

      withSpan('test', () => 'result');

      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('test');
      expect(spans[0].status).toBe('ok');

      unsubscribe();
    });

    it('should emit error spans', () => {
      const spans: any[] = [];
      const unsubscribe = onSpanComplete((span) => spans.push(span));

      try {
        withSpan('test', () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      expect(spans).toHaveLength(1);
      expect(spans[0].status).toBe('error');
      expect(spans[0].errorMessage).toBe('test error');

      unsubscribe();
    });
  });

  describe('withSpanAsync', () => {
    it('should execute async function', async () => {
      const result = await withSpanAsync('test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async result';
      });

      expect(result).toBe('async result');
    });

    it('should catch async errors', async () => {
      await expect(
        withSpanAsync('test', async () => {
          throw new Error('async error');
        })
      ).rejects.toThrow('async error');
    });
  });

  describe('setSpanAttribute', () => {
    it('should add attribute to span', () => {
      const { span } = startSpan('test');
      setSpanAttribute(span, 'key', 'value');

      expect(span.attributes.key).toBe('value');
    });
  });

  describe('spanToSummary', () => {
    it('should format successful span', () => {
      const { span, finish } = startSpan('test-op');
      finish('ok');

      const summary = spanToSummary(span);

      expect(summary).toContain('✓');
      expect(summary).toContain('test-op');
      expect(summary).toMatch(/\d+ms/);
    });

    it('should format error span', () => {
      const { span, finish } = startSpan('test-op');
      finish('error', 'Failed');

      const summary = spanToSummary(span);

      expect(summary).toContain('✗');
      expect(summary).toContain('Failed');
    });
  });

  describe('spanToLog', () => {
    it('should create log object', () => {
      const { span, finish } = startSpan('test-op');
      finish();

      const log = spanToLog(span);

      expect(log.spanId).toBe(span.id);
      expect(log.name).toBe('test-op');
      expect(log.status).toBe('ok');
      expect(log.durationMs).toBeDefined();
    });
  });
});

describe('SpanCollector', () => {
  let collector: SpanCollector;

  beforeEach(() => {
    collector = new SpanCollector();
    collector.start();
  });

  afterEach(() => {
    collector.stop();
  });

  it('should collect completed spans', () => {
    withSpan('span1', () => {});
    withSpan('span2', () => {});

    const spans = collector.getSpans();
    expect(spans).toHaveLength(2);
  });

  it('should filter spans by correlation ID', () => {
    const context = createTraceContext('trace-abc123');

    withTraceContext(context, () => {
      withSpan('traced', () => {});
    });

    withSpan('untraced', () => {});

    const traced = collector.getSpansForTrace('trace-abc123');
    expect(traced).toHaveLength(1);
    expect(traced[0].name).toBe('traced');
  });

  it('should build span tree', () => {
    const context = createTraceContext('tree-trace1');

    withTraceContext(context, () => {
      withSpan('parent', () => {
        withSpan('child1', () => {});
        withSpan('child2', () => {});
      });
    });

    const tree = collector.buildTree('tree-trace1');
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('parent');
    expect(tree[0].children).toHaveLength(2);
  });

  it('should clear collected spans', () => {
    withSpan('test', () => {});

    collector.clear();

    expect(collector.getSpans()).toHaveLength(0);
  });
});

describe('formatSpanTree', () => {
  it('should format span tree', () => {
    const span = {
      id: 'span1',
      name: 'root',
      correlationId: 'trace1',
      startTime: Date.now(),
      endTime: Date.now() + 100,
      duration: 100,
      status: 'ok' as const,
      attributes: {},
      children: [
        {
          id: 'span2',
          name: 'child',
          parentId: 'span1',
          correlationId: 'trace1',
          startTime: Date.now(),
          endTime: Date.now() + 50,
          duration: 50,
          status: 'ok' as const,
          attributes: {},
          children: [],
        },
      ],
    };

    const formatted = formatSpanTree([span]);

    expect(formatted).toContain('root');
    expect(formatted).toContain('child');
  });
});
