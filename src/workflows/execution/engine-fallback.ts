/**
 * Engine Fallback Logic
 *
 * Wraps engine execution with rate limit detection and automatic fallback.
 * When a rate limit is encountered, marks the engine as unavailable and
 * retries with the next available engine.
 */

import { registry } from '../../infra/engines/index.js';
import { debug } from '../../shared/logging/logger.js';
import { RateLimitManager } from './rate-limit-manager.js';
import { authCache } from './engine.js';
import type { EngineRunOptions, EngineRunResult } from '../../infra/engines/core/types.js';
import type { WorkflowEventEmitter } from '../events/index.js';

/**
 * Options for running with fallback
 */
export interface RunWithFallbackOptions {
  /** Primary engine to try first */
  primaryEngine: string;
  /** Engine run options */
  runOptions: EngineRunOptions;
  /** Rate limit manager instance */
  rateLimitManager: RateLimitManager;
  /** Event emitter for logging */
  emitter?: WorkflowEventEmitter;
  /** Agent ID for logging */
  agentId?: string;
  /** Maximum number of fallback attempts */
  maxAttempts?: number;
}

/**
 * Result from running with fallback
 */
export interface RunWithFallbackResult extends EngineRunResult {
  /** Engine that was actually used */
  engineUsed: string;
  /** Whether a fallback was needed */
  fellBack: boolean;
  /** Engines that were rate-limited during this attempt */
  rateLimitedEngines: string[];
}

/**
 * Run engine with automatic fallback on rate limit
 *
 * Tries the primary engine first. If rate limited, marks it unavailable
 * and tries the next authenticated engine. Continues until success or
 * all engines are exhausted.
 */
export async function runWithFallback(
  options: RunWithFallbackOptions
): Promise<RunWithFallbackResult> {
  const {
    primaryEngine,
    runOptions,
    rateLimitManager,
    emitter,
    agentId,
    maxAttempts = 3,
  } = options;

  const rateLimitedEngines: string[] = [];
  let currentEngine = primaryEngine;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    // Check if current engine is rate-limited
    if (!rateLimitManager.isEngineAvailable(currentEngine)) {
      const waitTime = rateLimitManager.getTimeUntilAvailable(currentEngine);
      debug('[EngineFallback] Engine %s is rate-limited (wait %ds), trying next', currentEngine, waitTime);

      if (emitter && agentId) {
        emitter.logMessage(agentId, `⏳ ${currentEngine} is rate-limited (${waitTime}s remaining), trying fallback...`);
      }

      // Find next available engine
      const nextEngine = await findNextAvailableEngine(currentEngine, rateLimitManager);
      if (!nextEngine) {
        throw new Error(
          `All engines are rate-limited. ${currentEngine} resets in ${waitTime}s.`
        );
      }

      currentEngine = nextEngine;
      if (emitter && agentId) {
        emitter.logMessage(agentId, `🔄 Falling back to ${currentEngine}`);
      }
      continue;
    }

    // Get engine and run
    const engine = registry.get(currentEngine);
    if (!engine) {
      throw new Error(`Engine not found: ${currentEngine}`);
    }

    debug('[EngineFallback] Attempting engine %s (attempt %d/%d)', currentEngine, attempts, maxAttempts);

    try {
      const result = await engine.run(runOptions);

      // Check if rate limited
      if (result.isRateLimitError) {
        debug('[EngineFallback] Engine %s hit rate limit', currentEngine);

        // Mark engine as rate-limited
        await rateLimitManager.markRateLimited(
          currentEngine,
          result.rateLimitResetsAt,
          result.retryAfterSeconds
        );
        rateLimitedEngines.push(currentEngine);

        if (emitter && agentId) {
          const resetInfo = result.retryAfterSeconds
            ? `(resets in ${result.retryAfterSeconds}s)`
            : '';
          emitter.logMessage(agentId, `⚠️ ${currentEngine} rate limited ${resetInfo}`);
        }

        // Find next available engine
        const nextEngine = await findNextAvailableEngine(currentEngine, rateLimitManager);
        if (!nextEngine) {
          // No fallback available - return the rate limit result
          return {
            ...result,
            engineUsed: currentEngine,
            fellBack: rateLimitedEngines.length > 0,
            rateLimitedEngines,
          };
        }

        currentEngine = nextEngine;
        if (emitter && agentId) {
          emitter.logMessage(agentId, `🔄 Switching to ${currentEngine}`);
        }
        continue;
      }

      // Success!
      return {
        ...result,
        engineUsed: currentEngine,
        fellBack: currentEngine !== primaryEngine,
        rateLimitedEngines,
      };
    } catch (error) {
      // Check if error message indicates rate limit
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (
        errorMsg.toLowerCase().includes('rate limit') ||
        errorMsg.includes('429') ||
        errorMsg.toLowerCase().includes('too many requests')
      ) {
        debug('[EngineFallback] Engine %s threw rate limit error', currentEngine);

        await rateLimitManager.markRateLimited(currentEngine);
        rateLimitedEngines.push(currentEngine);

        const nextEngine = await findNextAvailableEngine(currentEngine, rateLimitManager);
        if (!nextEngine) {
          throw error; // Re-throw if no fallback
        }

        currentEngine = nextEngine;
        if (emitter && agentId) {
          emitter.logMessage(agentId, `🔄 Rate limit error, switching to ${currentEngine}`);
        }
        continue;
      }

      // Non-rate-limit error - rethrow
      throw error;
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts. Rate-limited engines: ${rateLimitedEngines.join(', ')}`);
}

/**
 * Find next available engine (authenticated and not rate-limited)
 */
async function findNextAvailableEngine(
  excludeEngine: string,
  rateLimitManager: RateLimitManager
): Promise<string | null> {
  const engines = registry.getAll();

  for (const engine of engines) {
    const engineId = engine.metadata.id;

    // Skip excluded engine
    if (engineId === excludeEngine) continue;

    // Skip rate-limited engines
    if (!rateLimitManager.isEngineAvailable(engineId)) continue;

    // Check if authenticated
    const isAuthed = await authCache.isAuthenticated(
      engineId,
      () => engine.auth.isAuthenticated()
    );

    if (isAuthed) {
      debug('[EngineFallback] Found available fallback engine: %s', engineId);
      return engineId;
    }
  }

  debug('[EngineFallback] No available fallback engines found');
  return null;
}

/**
 * Check if any engines are available (not rate-limited and authenticated)
 */
export async function hasAvailableEngine(
  rateLimitManager: RateLimitManager
): Promise<boolean> {
  const engines = registry.getAll();

  for (const engine of engines) {
    const engineId = engine.metadata.id;

    if (!rateLimitManager.isEngineAvailable(engineId)) continue;

    const isAuthed = await authCache.isAuthenticated(
      engineId,
      () => engine.auth.isAuthenticated()
    );

    if (isAuthed) return true;
  }

  return false;
}
