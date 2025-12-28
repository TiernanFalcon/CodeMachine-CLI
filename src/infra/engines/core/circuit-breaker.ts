/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by detecting when a service is failing
 * and short-circuiting requests until the service recovers.
 *
 * ## States
 * - **CLOSED**: Normal operation, requests pass through
 * - **OPEN**: Failures exceeded threshold, requests are immediately rejected
 * - **HALF_OPEN**: Testing recovery, limited requests pass through
 *
 * ## Usage
 *
 * ### Basic Usage
 * ```typescript
 * import { CircuitBreaker } from './circuit-breaker';
 *
 * const circuit = new CircuitBreaker('my-service', {
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 * });
 *
 * // Execute with circuit protection
 * try {
 *   const result = await circuit.execute(() => myApiCall());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     console.log('Circuit is open, try again later');
 *   }
 * }
 * ```
 *
 * ### Engine-Specific Circuits
 * ```typescript
 * import { withCircuitBreaker, isCircuitOpen } from './circuit-breaker';
 *
 * // Use the global registry for engine circuits
 * const result = await withCircuitBreaker('claude', () => runClaudeQuery());
 *
 * // Check circuit state
 * if (isCircuitOpen('claude')) {
 *   console.log('Claude circuit is open');
 * }
 * ```
 *
 * ### Event Handling
 * ```typescript
 * circuit.on((event) => {
 *   if (event.type === 'state_change') {
 *     console.log(`Circuit changed from ${event.from} to ${event.to}`);
 *   }
 * });
 * ```
 *
 * @module circuit-breaker
 */

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Number of consecutive successes needed to close the circuit from half-open */
  successThreshold: number;
  /** Time in ms before transitioning from open to half-open */
  resetTimeout: number;
  /** Time window in ms for counting failures (sliding window) */
  failureWindow: number;
  /** Maximum requests allowed in half-open state */
  halfOpenMaxRequests: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 30000, // 30 seconds
  failureWindow: 60000, // 60 seconds
  halfOpenMaxRequests: 3,
};

/**
 * Failure record for tracking
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  openedAt?: Date;
  closedAt?: Date;
}

/**
 * Circuit breaker event types
 */
export type CircuitEvent =
  | { type: 'state_change'; from: CircuitState; to: CircuitState }
  | { type: 'request_allowed' }
  | { type: 'request_rejected' }
  | { type: 'failure'; error: Error }
  | { type: 'success' };

/**
 * Circuit breaker event listener
 */
export type CircuitEventListener = (event: CircuitEvent) => void;

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly openedAt: Date,
    public readonly resetAt: Date
  ) {
    super(
      `Circuit '${circuitName}' is open. Reset at ${resetAt.toISOString()}`
    );
    this.name = 'CircuitOpenError';
  }

  /**
   * Time remaining until circuit can reset
   */
  get remainingMs(): number {
    return Math.max(0, this.resetAt.getTime() - Date.now());
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: FailureRecord[] = [];
  private consecutiveSuccesses = 0;
  private halfOpenRequests = 0;
  private openedAt?: Date;
  private closedAt?: Date;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private totalRequests = 0;
  private listeners: CircuitEventListener[] = [];

  constructor(
    public readonly name: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG
  ) {}

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.getState(),
      failures: this.getRecentFailureCount(),
      successes: this.consecutiveSuccesses,
      totalRequests: this.totalRequests,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      openedAt: this.openedAt,
      closedAt: this.closedAt,
    };
  }

  /**
   * Check if a request is allowed
   */
  allowRequest(): boolean {
    this.checkStateTransition();
    this.totalRequests++;

    switch (this.state) {
      case 'closed':
        this.emit({ type: 'request_allowed' });
        return true;

      case 'open':
        this.emit({ type: 'request_rejected' });
        return false;

      case 'half_open':
        if (this.halfOpenRequests < this.config.halfOpenMaxRequests) {
          this.halfOpenRequests++;
          this.emit({ type: 'request_allowed' });
          return true;
        }
        this.emit({ type: 'request_rejected' });
        return false;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.lastSuccess = new Date();
    this.consecutiveSuccesses++;
    this.emit({ type: 'success' });

    if (this.state === 'half_open') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(error: Error): void {
    this.lastFailure = new Date();
    this.consecutiveSuccesses = 0;
    this.failures.push({ timestamp: Date.now(), error });
    this.emit({ type: 'failure', error });

    if (this.state === 'half_open') {
      // Single failure in half-open reopens the circuit
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      if (this.getRecentFailureCount() >= this.config.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allowRequest()) {
      throw new CircuitOpenError(
        this.name,
        this.openedAt!,
        new Date(this.openedAt!.getTime() + this.config.resetTimeout)
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Force the circuit to a specific state (for testing or manual override)
   */
  forceState(state: CircuitState): void {
    const from = this.state;
    this.state = state;

    if (state === 'open') {
      this.openedAt = new Date();
      this.halfOpenRequests = 0;
    } else if (state === 'closed') {
      this.closedAt = new Date();
      this.failures = [];
      this.consecutiveSuccesses = 0;
    } else if (state === 'half_open') {
      this.halfOpenRequests = 0;
      this.consecutiveSuccesses = 0;
    }

    if (from !== state) {
      this.emit({ type: 'state_change', from, to: state });
    }
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.forceState('closed');
    this.failures = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenRequests = 0;
    this.totalRequests = 0;
    this.lastFailure = undefined;
    this.lastSuccess = undefined;
    this.openedAt = undefined;
    this.closedAt = new Date();
  }

  /**
   * Add an event listener
   */
  on(listener: CircuitEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Check for automatic state transitions
   */
  private checkStateTransition(): void {
    if (this.state === 'open' && this.openedAt) {
      const elapsed = Date.now() - this.openedAt.getTime();
      if (elapsed >= this.config.resetTimeout) {
        this.transitionTo('half_open');
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const from = this.state;
    if (from === newState) return;

    this.state = newState;

    switch (newState) {
      case 'open':
        this.openedAt = new Date();
        this.halfOpenRequests = 0;
        break;
      case 'closed':
        this.closedAt = new Date();
        this.failures = [];
        this.consecutiveSuccesses = 0;
        break;
      case 'half_open':
        this.halfOpenRequests = 0;
        this.consecutiveSuccesses = 0;
        break;
    }

    this.emit({ type: 'state_change', from, to: newState });
  }

  /**
   * Get the count of recent failures within the failure window
   */
  private getRecentFailureCount(): number {
    const cutoff = Date.now() - this.config.failureWindow;
    this.failures = this.failures.filter((f) => f.timestamp >= cutoff);
    return this.failures.length;
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: CircuitEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (listenerError) {
        // Log listener errors at debug level
        if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG) {
          console.error('[DEBUG] Circuit breaker listener error:', listenerError instanceof Error ? listenerError.message : listenerError);
        }
      }
    }
  }
}

/**
 * Circuit breaker registry for managing multiple circuits
 */
export class CircuitBreakerRegistry {
  private circuits = new Map<string, CircuitBreaker>();
  private defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...defaultConfig };
  }

  /**
   * Get or create a circuit breaker by name
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = new CircuitBreaker(name, { ...this.defaultConfig, ...config });
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  /**
   * Get a circuit breaker for a specific engine
   */
  forEngine(engineId: string): CircuitBreaker {
    return this.get(`engine:${engineId}`, ENGINE_CIRCUIT_CONFIGS[engineId]);
  }

  /**
   * Check if a specific circuit exists
   */
  has(name: string): boolean {
    return this.circuits.has(name);
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.circuits.delete(name);
  }

  /**
   * Get all circuit names
   */
  names(): string[] {
    return Array.from(this.circuits.keys());
  }

  /**
   * Get stats for all circuits
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    for (const [name, circuit] of this.circuits) {
      stats[name] = circuit.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }
}

/**
 * Engine-specific circuit breaker configurations
 */
export const ENGINE_CIRCUIT_CONFIGS: Record<string, Partial<CircuitBreakerConfig>> = {
  claude: {
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    successThreshold: 2,
  },
  gemini: {
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    successThreshold: 2,
  },
  codex: {
    failureThreshold: 3,
    resetTimeout: 45000, // 45 seconds
    successThreshold: 2,
  },
  opencode: {
    failureThreshold: 4,
    resetTimeout: 30000,
    successThreshold: 2,
  },
};

/**
 * Global circuit breaker registry
 */
export const circuitRegistry = new CircuitBreakerRegistry();

/**
 * Execute a function with circuit breaker protection for a specific engine
 */
export async function withCircuitBreaker<T>(
  engineId: string,
  fn: () => Promise<T>
): Promise<T> {
  const circuit = circuitRegistry.forEngine(engineId);
  return circuit.execute(fn);
}

/**
 * Check if an engine's circuit is open
 */
export function isCircuitOpen(engineId: string): boolean {
  const circuit = circuitRegistry.forEngine(engineId);
  return circuit.getState() === 'open';
}

/**
 * Get circuit stats for an engine
 */
export function getCircuitStats(engineId: string): CircuitStats {
  const circuit = circuitRegistry.forEngine(engineId);
  return circuit.getStats();
}
