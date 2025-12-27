/**
 * Circuit Breaker Unit Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  DEFAULT_CIRCUIT_CONFIG,
  circuitRegistry,
  withCircuitBreaker,
  isCircuitOpen,
  getCircuitStats,
} from '../../../src/infra/engines/core/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuit: CircuitBreaker;

  beforeEach(() => {
    circuit = new CircuitBreaker('test', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 100, // Short for testing
      failureWindow: 1000,
      halfOpenMaxRequests: 2,
    });
  });

  describe('Initial State', () => {
    it('should start in closed state', () => {
      expect(circuit.getState()).toBe('closed');
    });

    it('should have zero failures initially', () => {
      const stats = circuit.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should allow requests in closed state', () => {
      expect(circuit.allowRequest()).toBe(true);
    });
  });

  describe('State Transitions', () => {
    it('should transition to open after failure threshold', () => {
      expect(circuit.getState()).toBe('closed');

      // Record failures up to threshold
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      expect(circuit.getState()).toBe('closed');

      circuit.recordFailure(new Error('fail 3')); // Threshold reached
      expect(circuit.getState()).toBe('open');
    });

    it('should transition to half-open after reset timeout', async () => {
      // Open the circuit
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));
      expect(circuit.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(circuit.getState()).toBe('half_open');
    });

    it('should transition to closed after success threshold in half-open', async () => {
      // Open the circuit
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      // Wait for half-open
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(circuit.getState()).toBe('half_open');

      // Record successes
      circuit.recordSuccess();
      expect(circuit.getState()).toBe('half_open');

      circuit.recordSuccess(); // Threshold reached
      expect(circuit.getState()).toBe('closed');
    });

    it('should transition back to open on failure in half-open', async () => {
      // Open the circuit
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      // Wait for half-open
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(circuit.getState()).toBe('half_open');

      // Single failure reopens
      circuit.recordFailure(new Error('fail 4'));
      expect(circuit.getState()).toBe('open');
    });
  });

  describe('Request Handling', () => {
    it('should reject requests when open', () => {
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      expect(circuit.allowRequest()).toBe(false);
    });

    it('should limit requests in half-open state', async () => {
      // Open the circuit
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      // Wait for half-open
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Max 2 requests allowed in half-open
      expect(circuit.allowRequest()).toBe(true);
      expect(circuit.allowRequest()).toBe(true);
      expect(circuit.allowRequest()).toBe(false);
    });
  });

  describe('Execute', () => {
    it('should execute function when closed', async () => {
      const result = await circuit.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('should throw CircuitOpenError when open', async () => {
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      try {
        await circuit.execute(() => Promise.resolve('should not reach'));
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).circuitName).toBe('test');
      }
    });

    it('should record success on function success', async () => {
      await circuit.execute(() => Promise.resolve('success'));
      expect(circuit.getStats().successes).toBe(1);
    });

    it('should record failure on function error', async () => {
      try {
        await circuit.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // Expected
      }
      expect(circuit.getStats().failures).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track total requests', () => {
      circuit.allowRequest();
      circuit.allowRequest();
      circuit.allowRequest();

      expect(circuit.getStats().totalRequests).toBe(3);
    });

    it('should track last failure time', () => {
      const before = new Date();
      circuit.recordFailure(new Error('fail'));
      const after = new Date();

      const stats = circuit.getStats();
      expect(stats.lastFailure).toBeDefined();
      expect(stats.lastFailure!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.lastFailure!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should track last success time', () => {
      const before = new Date();
      circuit.recordSuccess();
      const after = new Date();

      const stats = circuit.getStats();
      expect(stats.lastSuccess).toBeDefined();
      expect(stats.lastSuccess!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.lastSuccess!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Event Handling', () => {
    it('should emit state change events', () => {
      const events: string[] = [];
      circuit.on((event) => {
        if (event.type === 'state_change') {
          events.push(`${event.from}->${event.to}`);
        }
      });

      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      expect(events).toContain('closed->open');
    });

    it('should allow removing listeners', () => {
      let eventCount = 0;
      const unsubscribe = circuit.on(() => eventCount++);

      circuit.recordFailure(new Error('fail'));
      expect(eventCount).toBe(1);

      unsubscribe();

      circuit.recordFailure(new Error('fail'));
      expect(eventCount).toBe(1); // No change
    });
  });

  describe('Force State', () => {
    it('should allow forcing state to open', () => {
      expect(circuit.getState()).toBe('closed');
      circuit.forceState('open');
      expect(circuit.getState()).toBe('open');
    });

    it('should allow forcing state to half-open', () => {
      circuit.forceState('half_open');
      expect(circuit.getState()).toBe('half_open');
    });

    it('should allow forcing state to closed', () => {
      circuit.forceState('open');
      circuit.forceState('closed');
      expect(circuit.getState()).toBe('closed');
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      circuit.recordFailure(new Error('fail 1'));
      circuit.recordFailure(new Error('fail 2'));
      circuit.recordFailure(new Error('fail 3'));

      circuit.reset();

      const stats = circuit.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Failure Window', () => {
    it('should only count recent failures', async () => {
      // Create circuit with short failure window
      const shortWindowCircuit = new CircuitBreaker('short-window', {
        ...DEFAULT_CIRCUIT_CONFIG,
        failureThreshold: 3,
        failureWindow: 50, // 50ms
      });

      shortWindowCircuit.recordFailure(new Error('fail 1'));
      shortWindowCircuit.recordFailure(new Error('fail 2'));

      // Wait for failures to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Old failures should be expired, this shouldn't open the circuit
      shortWindowCircuit.recordFailure(new Error('fail 3'));

      expect(shortWindowCircuit.getState()).toBe('closed');
    });
  });
});

describe('CircuitOpenError', () => {
  it('should contain circuit details', () => {
    const openedAt = new Date();
    const resetAt = new Date(openedAt.getTime() + 30000);
    const error = new CircuitOpenError('test', openedAt, resetAt);

    expect(error.circuitName).toBe('test');
    expect(error.openedAt).toBe(openedAt);
    expect(error.resetAt).toBe(resetAt);
    expect(error.message).toContain('test');
  });

  it('should calculate remaining time', () => {
    const openedAt = new Date();
    const resetAt = new Date(Date.now() + 1000); // 1 second from now
    const error = new CircuitOpenError('test', openedAt, resetAt);

    expect(error.remainingMs).toBeGreaterThan(0);
    expect(error.remainingMs).toBeLessThanOrEqual(1000);
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry({
      failureThreshold: 5,
      resetTimeout: 100,
    });
  });

  it('should create and cache circuit breakers', () => {
    const circuit1 = registry.get('test');
    const circuit2 = registry.get('test');

    expect(circuit1).toBe(circuit2);
  });

  it('should create circuits with custom config', () => {
    const circuit = registry.get('custom', { failureThreshold: 10 });
    // Record 9 failures (below threshold of 10)
    for (let i = 0; i < 9; i++) {
      circuit.recordFailure(new Error(`fail ${i}`));
    }
    expect(circuit.getState()).toBe('closed');
  });

  it('should get circuit for engine', () => {
    const circuit = registry.forEngine('claude');
    expect(circuit.name).toBe('engine:claude');
  });

  it('should check if circuit exists', () => {
    expect(registry.has('test')).toBe(false);
    registry.get('test');
    expect(registry.has('test')).toBe(true);
  });

  it('should remove circuits', () => {
    registry.get('test');
    expect(registry.has('test')).toBe(true);

    registry.remove('test');
    expect(registry.has('test')).toBe(false);
  });

  it('should list all circuit names', () => {
    registry.get('circuit1');
    registry.get('circuit2');
    registry.get('circuit3');

    const names = registry.names();
    expect(names).toContain('circuit1');
    expect(names).toContain('circuit2');
    expect(names).toContain('circuit3');
  });

  it('should get stats for all circuits', () => {
    registry.get('circuit1');
    registry.get('circuit2');

    const allStats = registry.getAllStats();
    expect(allStats['circuit1']).toBeDefined();
    expect(allStats['circuit2']).toBeDefined();
  });

  it('should reset all circuits', () => {
    const c1 = registry.get('circuit1');
    const c2 = registry.get('circuit2');

    c1.recordFailure(new Error('fail'));
    c2.recordFailure(new Error('fail'));

    registry.resetAll();

    expect(c1.getStats().failures).toBe(0);
    expect(c2.getStats().failures).toBe(0);
  });
});

describe('Global Functions', () => {
  beforeEach(() => {
    circuitRegistry.resetAll();
  });

  it('withCircuitBreaker should execute with protection', async () => {
    const result = await withCircuitBreaker('mock', () =>
      Promise.resolve('success')
    );
    expect(result).toBe('success');
  });

  it('isCircuitOpen should check circuit state', () => {
    expect(isCircuitOpen('mock')).toBe(false);

    const circuit = circuitRegistry.forEngine('mock');
    circuit.forceState('open');

    expect(isCircuitOpen('mock')).toBe(true);
  });

  it('getCircuitStats should return circuit stats', () => {
    const stats = getCircuitStats('mock');
    expect(stats.state).toBeDefined();
    expect(stats.failures).toBeDefined();
  });
});
