/**
 * Rate Limit Manager
 *
 * Tracks rate-limited engines and manages fallback timing.
 * Persists state to disk for crash recovery.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debug } from '../../shared/logging/logger.js';

/**
 * Rate limit entry for a single engine
 */
interface RateLimitEntry {
  engineId: string;
  rateLimitedAt: number;  // Unix timestamp when rate limited
  resetsAt: number;       // Unix timestamp when rate limit expires
  retryAfterSeconds?: number;
}

/**
 * Persisted rate limit state
 */
interface RateLimitState {
  entries: RateLimitEntry[];
  lastUpdated: number;
}

/**
 * Rate Limit Manager
 *
 * Tracks which engines are rate-limited and when they become available.
 * State is persisted to .codemachine/rate-limits.json for crash recovery.
 */
export class RateLimitManager {
  private static instance: RateLimitManager | null = null;
  private entries: Map<string, RateLimitEntry> = new Map();
  private cmRoot: string;
  private persistPath: string;
  private initialized = false;

  private constructor(cmRoot: string) {
    this.cmRoot = cmRoot;
    this.persistPath = path.join(cmRoot, 'rate-limits.json');
  }

  /**
   * Get singleton instance
   */
  static getInstance(cmRoot?: string): RateLimitManager {
    if (!RateLimitManager.instance) {
      if (!cmRoot) {
        throw new Error('RateLimitManager requires cmRoot on first initialization');
      }
      RateLimitManager.instance = new RateLimitManager(cmRoot);
    }
    return RateLimitManager.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    RateLimitManager.instance = null;
  }

  /**
   * Initialize manager - loads persisted state
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      const state: RateLimitState = JSON.parse(content);

      // Load entries and clean up expired ones
      const now = Date.now();
      for (const entry of state.entries) {
        if (entry.resetsAt > now) {
          this.entries.set(entry.engineId, entry);
          debug('[RateLimitManager] Loaded rate limit for %s (resets in %ds)',
            entry.engineId, Math.round((entry.resetsAt - now) / 1000));
        }
      }

      this.initialized = true;
      debug('[RateLimitManager] Initialized with %d active rate limits', this.entries.size);
    } catch (_error) {
      // File doesn't exist or is invalid - start fresh
      this.initialized = true;
      debug('[RateLimitManager] Initialized fresh (no persisted state)');
    }
  }

  /**
   * Mark an engine as rate-limited
   */
  async markRateLimited(
    engineId: string,
    resetsAt?: Date,
    retryAfterSeconds?: number
  ): Promise<void> {
    const now = Date.now();

    // Calculate reset time
    let resetTime: number;
    if (resetsAt) {
      resetTime = resetsAt.getTime();
    } else if (retryAfterSeconds) {
      resetTime = now + (retryAfterSeconds * 1000);
    } else {
      // Default: 60 seconds if no timing info provided
      resetTime = now + 60000;
    }

    const entry: RateLimitEntry = {
      engineId,
      rateLimitedAt: now,
      resetsAt: resetTime,
      retryAfterSeconds,
    };

    this.entries.set(engineId, entry);
    debug('[RateLimitManager] Engine %s rate limited until %s (in %ds)',
      engineId,
      new Date(resetTime).toISOString(),
      Math.round((resetTime - now) / 1000)
    );

    await this.persist();
  }

  /**
   * Check if an engine is currently available (not rate-limited)
   */
  isEngineAvailable(engineId: string): boolean {
    const entry = this.entries.get(engineId);
    if (!entry) return true;

    const now = Date.now();
    if (entry.resetsAt <= now) {
      // Rate limit expired - remove entry
      this.entries.delete(engineId);
      debug('[RateLimitManager] Engine %s rate limit expired, now available', engineId);
      return true;
    }

    return false;
  }

  /**
   * Get time until an engine is available (in seconds)
   * Returns 0 if engine is available
   */
  getTimeUntilAvailable(engineId: string): number {
    const entry = this.entries.get(engineId);
    if (!entry) return 0;

    const now = Date.now();
    if (entry.resetsAt <= now) {
      this.entries.delete(engineId);
      return 0;
    }

    return Math.ceil((entry.resetsAt - now) / 1000);
  }

  /**
   * Get all rate-limited engines
   */
  getRateLimitedEngines(): string[] {
    const now = Date.now();
    const rateLimited: string[] = [];

    for (const [engineId, entry] of this.entries) {
      if (entry.resetsAt > now) {
        rateLimited.push(engineId);
      }
    }

    return rateLimited;
  }

  /**
   * Clear rate limit for an engine (e.g., if it becomes available)
   */
  async clearRateLimit(engineId: string): Promise<void> {
    if (this.entries.has(engineId)) {
      this.entries.delete(engineId);
      debug('[RateLimitManager] Cleared rate limit for %s', engineId);
      await this.persist();
    }
  }

  /**
   * Persist state to disk
   */
  private async persist(): Promise<void> {
    const state: RateLimitState = {
      entries: Array.from(this.entries.values()),
      lastUpdated: Date.now(),
    };

    try {
      await fs.mkdir(path.dirname(this.persistPath), { recursive: true });
      await fs.writeFile(this.persistPath, JSON.stringify(state, null, 2), 'utf-8');
      debug('[RateLimitManager] Persisted state with %d entries', state.entries.length);
    } catch (error) {
      debug('[RateLimitManager] Failed to persist state: %o', error);
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let removed = 0;

    for (const [engineId, entry] of this.entries) {
      if (entry.resetsAt <= now) {
        this.entries.delete(engineId);
        removed++;
      }
    }

    if (removed > 0) {
      debug('[RateLimitManager] Cleaned up %d expired entries', removed);
      await this.persist();
    }
  }
}

/**
 * Create and initialize a rate limit manager
 */
export async function createRateLimitManager(cmRoot: string): Promise<RateLimitManager> {
  const manager = RateLimitManager.getInstance(cmRoot);
  await manager.initialize();
  return manager;
}
