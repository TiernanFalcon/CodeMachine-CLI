/**
 * Workflow Control Bus
 *
 * A dedicated event bus for workflow control signals, replacing the use of
 * `process` as a global event emitter. This provides:
 * - Explicit dependencies (no hidden global state)
 * - Type safety for control events
 * - Proper cleanup to prevent memory leaks
 * - Testability through injection
 *
 * @example
 * ```typescript
 * // Get the singleton instance
 * const bus = WorkflowControlBus.getInstance();
 *
 * // Subscribe to events
 * const unsubscribe = bus.on('pause', () => handlePause());
 *
 * // Emit events
 * bus.emit('stop');
 *
 * // Clean up
 * unsubscribe();
 * ```
 */

import { EventEmitter } from 'node:events';
import { debug } from '../../shared/logging/logger.js';

/**
 * Workflow control event types
 */
export interface WorkflowControlEvents {
  /** Request to pause the workflow */
  pause: void;
  /** Request to skip the current step */
  skip: void;
  /** Request to stop the workflow */
  stop: void;
  /** Request to stop (with stopping state) */
  stopping: void;
  /** Mode change (autonomous/manual) */
  'mode-change': { autonomousMode: boolean };
  /** User input submitted */
  input: { prompt?: string; skip?: boolean };
  /** Workflow error notification */
  error: { error?: Error; reason?: string; agentId?: string };
  /** User-initiated stop notification */
  'user-stop': void;
}

/**
 * Event handler type
 */
type EventHandler<T> = T extends void ? () => void : (data: T) => void;

/**
 * Workflow Control Bus - singleton event bus for workflow control signals
 *
 * This replaces the pattern of using `process` as a global event emitter,
 * providing explicit dependencies and proper cleanup.
 */
export class WorkflowControlBus {
  private static instance: WorkflowControlBus | null = null;
  private emitter: EventEmitter;
  private listenerCounts: Map<string, number> = new Map();

  private constructor() {
    this.emitter = new EventEmitter();
    // Increase max listeners to avoid warnings in complex workflows
    this.emitter.setMaxListeners(50);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): WorkflowControlBus {
    if (!WorkflowControlBus.instance) {
      WorkflowControlBus.instance = new WorkflowControlBus();
    }
    return WorkflowControlBus.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    if (WorkflowControlBus.instance) {
      WorkflowControlBus.instance.removeAllListeners();
      WorkflowControlBus.instance = null;
    }
  }

  /**
   * Subscribe to a control event
   * @returns Unsubscribe function
   */
  on<K extends keyof WorkflowControlEvents>(
    event: K,
    handler: EventHandler<WorkflowControlEvents[K]>
  ): () => void {
    const eventName = `workflow:${event}`;
    this.emitter.on(eventName, handler as (...args: unknown[]) => void);

    // Track listener count for debugging
    const count = (this.listenerCounts.get(eventName) ?? 0) + 1;
    this.listenerCounts.set(eventName, count);
    debug('[ControlBus] Added listener for %s (count: %d)', eventName, count);

    // Return unsubscribe function
    return () => {
      this.emitter.off(eventName, handler as (...args: unknown[]) => void);
      const newCount = (this.listenerCounts.get(eventName) ?? 1) - 1;
      this.listenerCounts.set(eventName, newCount);
      debug('[ControlBus] Removed listener for %s (count: %d)', eventName, newCount);
    };
  }

  /**
   * Subscribe to a control event (once)
   * @returns Unsubscribe function
   */
  once<K extends keyof WorkflowControlEvents>(
    event: K,
    handler: EventHandler<WorkflowControlEvents[K]>
  ): () => void {
    const eventName = `workflow:${event}`;
    this.emitter.once(eventName, handler as (...args: unknown[]) => void);

    const count = (this.listenerCounts.get(eventName) ?? 0) + 1;
    this.listenerCounts.set(eventName, count);
    debug('[ControlBus] Added once listener for %s (count: %d)', eventName, count);

    return () => {
      this.emitter.off(eventName, handler as (...args: unknown[]) => void);
      const newCount = (this.listenerCounts.get(eventName) ?? 1) - 1;
      this.listenerCounts.set(eventName, newCount);
    };
  }

  /**
   * Emit a control event
   */
  emit<K extends keyof WorkflowControlEvents>(
    event: K,
    ...args: WorkflowControlEvents[K] extends void ? [] : [WorkflowControlEvents[K]]
  ): void {
    const eventName = `workflow:${event}`;
    debug('[ControlBus] Emitting %s', eventName);
    this.emitter.emit(eventName, ...args);
  }

  /**
   * Remove all listeners for a specific event
   */
  removeAllListeners(event?: keyof WorkflowControlEvents): void {
    if (event) {
      const eventName = `workflow:${event}`;
      this.emitter.removeAllListeners(eventName);
      this.listenerCounts.set(eventName, 0);
      debug('[ControlBus] Removed all listeners for %s', eventName);
    } else {
      this.emitter.removeAllListeners();
      this.listenerCounts.clear();
      debug('[ControlBus] Removed all listeners');
    }
  }

  /**
   * Get listener count for an event (for debugging)
   */
  listenerCount(event: keyof WorkflowControlEvents): number {
    const eventName = `workflow:${event}`;
    return this.emitter.listenerCount(eventName);
  }
}

/**
 * Convenience function to get the control bus instance
 */
export function getControlBus(): WorkflowControlBus {
  return WorkflowControlBus.getInstance();
}
