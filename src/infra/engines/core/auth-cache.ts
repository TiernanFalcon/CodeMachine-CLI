/**
 * Engine Authentication Cache
 *
 * Shared cache for engine authentication status with configurable TTL.
 * Prevents repeated auth checks that can take 10-30 seconds each.
 *
 * CRITICAL: This fixes the delay bug when spawning multiple subagents
 * by ensuring auth status is cached across all execution contexts.
 *
 * TTL is configurable via CODEMACHINE_AUTH_CACHE_TTL_MS environment variable.
 */

import { getAuthCacheTtlMs } from '../../../shared/config/timeouts.js';

interface CacheEntry {
  isAuthenticated: boolean;
  timestamp: number;
}

/**
 * Cache for engine authentication status with TTL
 */
export class EngineAuthCache {
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Check if engine is authenticated (with caching)
   *
   * @param engineId - The engine identifier
   * @param checkFn - Function to perform actual auth check if cache miss
   * @returns Whether the engine is authenticated
   */
  async isAuthenticated(
    engineId: string,
    checkFn: () => Promise<boolean>
  ): Promise<boolean> {
    const cached = this.cache.get(engineId);
    const now = Date.now();
    const ttlMs = getAuthCacheTtlMs();

    // Return cached value if still valid
    if (cached && now - cached.timestamp < ttlMs) {
      return cached.isAuthenticated;
    }

    // Cache miss or expired - perform actual check
    const result = await checkFn();

    // Cache the result
    this.cache.set(engineId, {
      isAuthenticated: result,
      timestamp: now,
    });

    return result;
  }

  /**
   * Invalidate cache for a specific engine
   * Useful after authentication state changes
   */
  invalidate(engineId: string): void {
    this.cache.delete(engineId);
  }

  /**
   * Clear entire cache
   * Useful for testing or after bulk auth changes
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries (for debugging)
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Global auth cache instance shared across all execution contexts
 */
export const engineAuthCache = new EngineAuthCache();
