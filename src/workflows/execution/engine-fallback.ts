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
  /** Ordered list of fallback engines to try (after primary) */
  fallbackChain?: string[];
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
  /** If all engines exhausted, when the soonest one resets */
  allEnginesExhausted?: boolean;
  /** Soonest reset time if all engines exhausted */
  soonestResetAt?: Date;
  /** Engine ID that will reset soonest */
  soonestResetEngine?: string;
}

/**
 * Run engine with automatic fallback on rate limit
 *
 * Tries the primary engine first, then each engine in the fallback chain.
 * If all are rate limited, returns with allEnginesExhausted=true and
 * the soonest reset time so the workflow can wait.
 */
export async function runWithFallback(
  options: RunWithFallbackOptions
): Promise<RunWithFallbackResult> {
  const {
    primaryEngine,
    fallbackChain = [],
    runOptions,
    rateLimitManager,
    emitter,
    agentId,
    maxAttempts = 3,
  } = options;

  // Build the full engine list: primary + fallback chain
  const engineList = [primaryEngine, ...fallbackChain.filter(e => e !== primaryEngine)];
  const rateLimitedEngines: string[] = [];
  let attempts = 0;
  let engineIndex = 0;

  while (attempts < maxAttempts && engineIndex < engineList.length) {
    const currentEngine = engineList[engineIndex];
    attempts++;

    // Check if current engine is rate-limited
    if (!rateLimitManager.isEngineAvailable(currentEngine)) {
      const waitTime = rateLimitManager.getTimeUntilAvailable(currentEngine);
      debug('[EngineFallback] Engine %s is rate-limited (wait %ds), trying next in chain', currentEngine, waitTime);

      if (emitter && agentId) {
        emitter.logMessage(agentId, `⏳ ${currentEngine} is rate-limited (${waitTime}s remaining), trying fallback...`);
      }

      rateLimitedEngines.push(currentEngine);
      engineIndex++;
      continue;
    }

    // Check if engine is authenticated
    const engine = registry.get(currentEngine);
    if (!engine) {
      debug('[EngineFallback] Engine %s not found, skipping', currentEngine);
      engineIndex++;
      continue;
    }

    const isAuthed = await authCache.isAuthenticated(
      currentEngine,
      () => engine.auth.isAuthenticated()
    );
    if (!isAuthed) {
      debug('[EngineFallback] Engine %s not authenticated, skipping', currentEngine);
      engineIndex++;
      continue;
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

        engineIndex++;
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

        if (emitter && agentId) {
          emitter.logMessage(agentId, `🔄 Rate limit error on ${currentEngine}, trying next...`);
        }

        engineIndex++;
        continue;
      }

      // Non-rate-limit error - rethrow
      throw error;
    }
  }

  // All engines exhausted - find the soonest reset time
  const { soonestEngine, soonestResetAt } = findSoonestReset(engineList, rateLimitManager);

  if (emitter && agentId && soonestResetAt) {
    const waitSeconds = Math.ceil((soonestResetAt.getTime() - Date.now()) / 1000);
    emitter.logMessage(agentId, `⏳ All engines rate-limited. ${soonestEngine} resets in ${waitSeconds}s`);
  }

  // Return a result indicating we need to wait
  return {
    stdout: '',
    stderr: 'All engines in fallback chain are rate-limited',
    engineUsed: primaryEngine,
    fellBack: true,
    rateLimitedEngines,
    allEnginesExhausted: true,
    soonestResetAt,
    soonestResetEngine: soonestEngine,
    isRateLimitError: true,
  };
}

/**
 * Find the engine that will reset soonest
 */
function findSoonestReset(
  engines: string[],
  rateLimitManager: RateLimitManager
): { soonestEngine: string | undefined; soonestResetAt: Date | undefined } {
  let soonestEngine: string | undefined;
  let soonestResetAt: Date | undefined;

  for (const engineId of engines) {
    const waitTime = rateLimitManager.getTimeUntilAvailable(engineId);
    if (waitTime > 0) {
      const resetAt = new Date(Date.now() + waitTime * 1000);
      if (!soonestResetAt || resetAt < soonestResetAt) {
        soonestResetAt = resetAt;
        soonestEngine = engineId;
      }
    }
  }

  return { soonestEngine, soonestResetAt };
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
