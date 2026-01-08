import { registry, engineAuthCache } from '../../infra/engines/index.js';
import { debug } from '../../shared/logging/logger.js';
import type { WorkflowEventEmitter } from '../events/index.js';
import {
  getEngineSelectionContext,
  resolveEngineForAgent,
  resolveEngineAndModelForAgent,
  isFallbackEnabled,
  type EngineConfigFile,
} from './engine-presets.js';

// Re-export for backwards compatibility (deprecated - use engineAuthCache from infra/engines instead)
export { EngineAuthCache, engineAuthCache as authCache } from '../../infra/engines/index.js';

/**
 * Workflow-scoped engine configuration context.
 * Prevents config leakage between concurrent or sequential workflows
 * by using a unique symbol key per workflow instance.
 *
 * This class can be instantiated directly for testing, or use the
 * module-level default via getWorkflowConfigContext().
 */
export class WorkflowConfigContext {
  private configs: Map<symbol, EngineConfigFile | null> = new Map();
  private currentWorkflow: symbol | null = null;

  /**
   * Start a new workflow context and return its unique key
   */
  startWorkflow(): symbol {
    const key = Symbol('workflow-config');
    this.currentWorkflow = key;
    this.configs.set(key, null);
    return key;
  }

  /**
   * End a workflow context and clean up its config
   */
  endWorkflow(key: symbol): void {
    this.configs.delete(key);
    if (this.currentWorkflow === key) {
      this.currentWorkflow = null;
    }
  }

  /**
   * Set config for the current workflow
   */
  setConfig(config: EngineConfigFile | null): void {
    if (this.currentWorkflow) {
      this.configs.set(this.currentWorkflow, config);
    }
  }

  /**
   * Get config for the current workflow
   */
  getConfig(): EngineConfigFile | null {
    return this.currentWorkflow ? this.configs.get(this.currentWorkflow) ?? null : null;
  }

  /**
   * Clear config for the current workflow (without ending it)
   */
  clearConfig(): void {
    if (this.currentWorkflow) {
      this.configs.set(this.currentWorkflow, null);
    }
  }

  /**
   * Reset the context completely (for testing)
   * @internal
   */
  reset(): void {
    this.configs.clear();
    this.currentWorkflow = null;
  }
}

// Default context manager for workflow configs
let workflowConfigContext = new WorkflowConfigContext();

/**
 * Get the current workflow config context
 * @internal For testing - use the exported functions instead
 */
export function getWorkflowConfigContext(): WorkflowConfigContext {
  return workflowConfigContext;
}

/**
 * Replace the workflow config context (for testing)
 * @internal
 */
export function setWorkflowConfigContext(context: WorkflowConfigContext): void {
  workflowConfigContext = context;
}

/**
 * Reset the workflow config context to a fresh instance (for testing)
 * @internal
 */
export function resetWorkflowConfigContext(): void {
  workflowConfigContext = new WorkflowConfigContext();
}

/**
 * Start a new workflow context - call this at workflow start
 * Returns a key that should be passed to endWorkflowContext() when done
 */
export function startWorkflowContext(): symbol {
  return workflowConfigContext.startWorkflow();
}

/**
 * End a workflow context and clean up - call this at workflow end
 */
export function endWorkflowContext(key: symbol): void {
  workflowConfigContext.endWorkflow(key);
}

/**
 * Set the cached engine config file for the current workflow
 */
export function setEngineConfigFile(config: EngineConfigFile | null): void {
  workflowConfigContext.setConfig(config);
}

/**
 * Clear the cached engine config file
 */
export function clearEngineConfigFile(): void {
  workflowConfigContext.clearConfig();
}

// Internal getter for the current workflow's config
function getCachedConfigFile(): EngineConfigFile | null {
  return workflowConfigContext.getConfig();
}

interface StepWithEngine {
  engine?: string;
  agentId: string;
  agentName?: string;
}

/**
 * Select engine for step execution with fallback logic
 *
 * Priority order (highest to lowest):
 * 1. CLI --engine flag (global override via preset context)
 * 2. CLI --preset flag (via preset context)
 * 3. Step-level engine override (from workflow template)
 * 4. Config file preset
 * 5. Config file per-agent override
 * 6. First authenticated engine by registry order
 * 7. Default engine
 */
export async function selectEngine(
  step: StepWithEngine,
  emitter: WorkflowEventEmitter,
  uniqueAgentId: string
): Promise<string> {
  debug(`[DEBUG workflow] step.engine=${step.engine}, agentId=${step.agentId}`);

  // Check for preset/override context first
  const selectionContext = getEngineSelectionContext();
  const cachedConfig = getCachedConfigFile();
  const presetEngine = resolveEngineForAgent(step.agentId, selectionContext, cachedConfig);

  if (presetEngine) {
    debug(`[DEBUG workflow] Preset/override engine for ${step.agentId}: ${presetEngine}`);
    const presetEngineModule = await registry.getAsync(presetEngine);
    const isPresetAuthed = presetEngineModule
      ? await engineAuthCache.isAuthenticated(presetEngineModule.metadata.id, () => presetEngineModule.auth.isAuthenticated())
      : false;

    if (isPresetAuthed) {
      const presetName = selectionContext?.preset ?? selectionContext?.globalEngine ?? 'config';
      emitter.logMessage(uniqueAgentId, `Using ${presetEngineModule?.metadata.name ?? presetEngine} (${presetName})`);
      debug(`[DEBUG workflow] Engine determined from preset: ${presetEngine}`);
      return presetEngine;
    } else {
      const pretty = presetEngineModule?.metadata.name ?? presetEngine;
      emitter.logMessage(uniqueAgentId, `${pretty} from preset is not authenticated; falling back to step/default engine`);
    }
  }

  // Check if fallback is enabled
  const selectionContextForFallback = getEngineSelectionContext();
  const fallbackAllowed = isFallbackEnabled(selectionContextForFallback, cachedConfig);
  debug(`[DEBUG workflow] Fallback enabled: ${fallbackAllowed}`);

  // Determine engine: step override > first authenticated engine
  let engineType: string;
  if (step.engine) {
    debug(`[DEBUG workflow] Using step-specified engine: ${step.engine}`);
    engineType = step.engine;

    // If an override is provided but not authenticated, log and fall back (if allowed)
    const overrideEngine = await registry.getAsync(engineType);
    debug(`[DEBUG workflow] Checking auth for override engine...`);
    const isOverrideAuthed = overrideEngine
      ? await engineAuthCache.isAuthenticated(overrideEngine.metadata.id, () => overrideEngine.auth.isAuthenticated())
      : false;
    debug(`[DEBUG workflow] isOverrideAuthed=${isOverrideAuthed}`);
    if (!isOverrideAuthed) {
      const pretty = overrideEngine?.metadata.name ?? engineType;

      // If fallback is disabled, throw an error instead of falling back
      if (!fallbackAllowed) {
        const noFallbackMsg = `${pretty} is not authenticated and fallback is disabled. Run 'codemachine auth login' to authenticate.`;
        emitter.logMessage(uniqueAgentId, noFallbackMsg);
        throw new Error(noFallbackMsg);
      }

      const authMsg = `${pretty} override is not authenticated; falling back to first authenticated engine by order. Run 'codemachine auth login' to use ${pretty}.`;
      emitter.logMessage(uniqueAgentId, authMsg);

      // Find first authenticated engine by order (with parallel auth checks)
      const engines = await registry.getAllAsync();
      const authResults = await Promise.all(
        engines.map(async (eng) => ({
          engine: eng,
          isAuth: await engineAuthCache.isAuthenticated(
            eng.metadata.id,
            () => eng.auth.isAuthenticated()
          ),
        }))
      );
      const authenticatedEngine = authResults.find((r) => r.isAuth)?.engine;
      // If none authenticated, fall back to registry default (may still require auth)
      const fallbackEngine = authenticatedEngine ?? (await registry.getDefaultAsync()) ?? null;

      if (fallbackEngine) {
        engineType = fallbackEngine.metadata.id;
        const fallbackMsg = `Falling back to ${fallbackEngine.metadata.name} (${engineType})`;
        emitter.logMessage(uniqueAgentId, fallbackMsg);
      }
    }
  } else {
    debug(`[DEBUG workflow] No step.engine specified, finding authenticated engine...`);
    // Fallback: find first authenticated engine by order (with parallel auth checks)
    const engines = await registry.getAllAsync();
    debug(`[DEBUG workflow] Available engines: ${engines.map(e => e.metadata.id).join(', ')}`);

    // Check all engines in parallel for performance
    const authResults = await Promise.all(
      engines.map(async (engine) => {
        debug(`[DEBUG workflow] Checking auth for engine: ${engine.metadata.id}`);
        const isAuth = await engineAuthCache.isAuthenticated(
          engine.metadata.id,
          () => engine.auth.isAuthenticated()
        );
        debug(`[DEBUG workflow] Engine ${engine.metadata.id} isAuth=${isAuth}`);
        return { engine, isAuth };
      })
    );

    // Find first authenticated engine (preserves registry order)
    const authenticatedResult = authResults.find((r) => r.isAuth);
    let foundEngine = authenticatedResult?.engine ?? null;

    if (!foundEngine) {
      debug(`[DEBUG workflow] No authenticated engine found, using default`);
      // If no authenticated engine, use default (first by order)
      foundEngine = (await registry.getDefaultAsync()) ?? null;
    }

    if (!foundEngine) {
      debug(`[DEBUG workflow] No engines registered at all!`);
      throw new Error('No engines registered. Please install at least one engine.');
    }

    engineType = foundEngine.metadata.id;
    debug(`[DEBUG workflow] Selected engine: ${engineType}`);
    const engineMsg = `No engine specified, using ${foundEngine.metadata.name} (${engineType})`;
    emitter.logMessage(uniqueAgentId, engineMsg);
  }

  debug(`[DEBUG workflow] Engine determined: ${engineType}`);
  return engineType;
}

/**
 * Get the model from preset configuration for an agent
 *
 * Returns the model if a preset is active and has a model mapping for the agent's tier,
 * otherwise returns undefined to let the caller use step.model or engine default.
 */
export function getPresetModel(agentId: string): string | undefined {
  const selectionContext = getEngineSelectionContext();
  const resolution = resolveEngineAndModelForAgent(agentId, selectionContext, getCachedConfigFile());

  if (resolution?.model) {
    debug(`[DEBUG workflow] Preset model for ${agentId}: ${resolution.model}`);
    return resolution.model;
  }

  return undefined;
}
