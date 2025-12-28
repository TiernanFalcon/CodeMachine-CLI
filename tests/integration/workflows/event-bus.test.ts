/**
 * Event Bus Integration Tests
 *
 * Tests event emission, subscription, and history tracking.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { WorkflowEventBus } from '../../../src/workflows/events/event-bus.js';
import type { WorkflowEvent } from '../../../src/workflows/events/types.js';

describe('Event Bus Integration', () => {
  let eventBus: WorkflowEventBus;

  beforeEach(() => {
    eventBus = new WorkflowEventBus();
  });

  describe('Subscription', () => {
    it('should notify subscribers on event emission', () => {
      const received: WorkflowEvent[] = [];

      // Use 'on' method for typed subscription
      eventBus.on('step:start', (event) => {
        received.push(event);
      });

      eventBus.emit({
        type: 'step:start',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'test-step',
      });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('step:start');
    });

    it('should support multiple subscribers for same event', () => {
      let count = 0;

      eventBus.on('workflow:start', () => count++);
      eventBus.on('workflow:start', () => count++);
      eventBus.on('workflow:start', () => count++);

      eventBus.emit({
        type: 'workflow:start',
        timestamp: Date.now(),
        workflowName: 'test',
      });

      expect(count).toBe(3);
    });

    it('should unsubscribe correctly', () => {
      let count = 0;

      const unsubscribe = eventBus.on('step:complete', () => count++);

      eventBus.emit({
        type: 'step:complete',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'test',
        success: true,
      });

      expect(count).toBe(1);

      unsubscribe();

      eventBus.emit({
        type: 'step:complete',
        timestamp: Date.now(),
        stepIndex: 1,
        stepName: 'test2',
        success: true,
      });

      expect(count).toBe(1); // Still 1, no increment after unsubscribe
    });
  });

  describe('Wildcard Subscription', () => {
    it('should receive all events with subscribe method', () => {
      const received: WorkflowEvent[] = [];

      // subscribe() without event type receives all events
      eventBus.subscribe((event) => {
        received.push(event);
      });

      eventBus.emit({
        type: 'workflow:start',
        timestamp: Date.now(),
        workflowName: 'test',
      });

      eventBus.emit({
        type: 'step:start',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'test',
      });

      eventBus.emit({
        type: 'step:complete',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'test',
        success: true,
      });

      expect(received).toHaveLength(3);
    });
  });

  describe('Event History', () => {
    it('should track event history when enabled', () => {
      eventBus.enableHistory(100);

      eventBus.emit({
        type: 'workflow:start',
        timestamp: Date.now(),
        workflowName: 'test',
      });

      eventBus.emit({
        type: 'step:start',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'step-1',
      });

      const history = eventBus.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('workflow:start');
      expect(history[1].type).toBe('step:start');
    });

    it('should limit history size', () => {
      eventBus.enableHistory(3);

      for (let i = 0; i < 5; i++) {
        eventBus.emit({
          type: 'step:start',
          timestamp: Date.now(),
          stepIndex: i,
          stepName: `step-${i}`,
        });
      }

      const history = eventBus.getHistory();

      expect(history).toHaveLength(3);
      // Should keep the last 3 events
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((history[0] as any).stepIndex).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((history[1] as any).stepIndex).toBe(3);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((history[2] as any).stepIndex).toBe(4);
    });

    it('should filter history by event type', () => {
      eventBus.enableHistory(100);

      eventBus.emit({
        type: 'workflow:start',
        timestamp: Date.now(),
        workflowName: 'test',
      });

      eventBus.emit({
        type: 'step:start',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'step-1',
      });

      eventBus.emit({
        type: 'step:complete',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'step-1',
        success: true,
      });

      const stepEvents = eventBus.getHistoryByType('step:start');

      expect(stepEvents).toHaveLength(1);
      expect(stepEvents[0].type).toBe('step:start');
    });

    it('should clear history', () => {
      eventBus.enableHistory(100);

      eventBus.emit({
        type: 'workflow:start',
        timestamp: Date.now(),
        workflowName: 'test',
      });

      expect(eventBus.getHistory()).toHaveLength(1);

      eventBus.clearHistory();

      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue emitting when subscriber throws', () => {
      let secondCalled = false;

      eventBus.on('step:start', () => {
        throw new Error('Subscriber error');
      });

      eventBus.on('step:start', () => {
        secondCalled = true;
      });

      // Should not throw
      eventBus.emit({
        type: 'step:start',
        timestamp: Date.now(),
        stepIndex: 0,
        stepName: 'test',
      });

      expect(secondCalled).toBe(true);
    });
  });
});
