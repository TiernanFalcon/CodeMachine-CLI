import * as path from 'node:path';

import type { EngineType } from '../../infra/engines/index.js';
import { getEngine } from '../../infra/engines/index.js';
import { MemoryAdapter } from '../../infra/fs/memory-adapter.js';
import { MemoryStore } from '../index.js';
import { loadAgentConfig } from './config.js';
import { loadChainedPrompts, type ChainedPrompt } from './chained.js';
import { AgentMonitorService, AgentLoggerService } from '../monitoring/index.js';

export type { ChainedPrompt } from './chained.js';
import type { ParsedTelemetry } from '../../infra/engines/core/types.js';
import { formatForLogFile } from '../../shared/formatters/logFileFormatter.js';
import { info, error, debug } from '../../shared/logging/logger.js';
import { parseToolUse, extractContextFromTool, extractGoal } from './parser.js';

/**
 * Cache for engine authentication status with TTL (shared across all subagents)
 * Prevents repeated auth checks that can take 10-30 seconds each
 * CRITICAL: This fixes the 5-minute delay bug when spawning multiple subagents
 */
class EngineAuthCache {
  private cache: Map<string, { isAuthenticated: boolean; timestamp: number }> = new Map();
  private ttlMs: number = 5 * 60 * 1000; // 5 minutes TTL

  async isAuthenticated(engineId: string, checkFn: () => Promise<boolean>): Promise<boolean> {
    const cached = this.cache.get(engineId);
    const now = Date.now();

    // Return cached value if still valid
    if (cached && (now - cached.timestamp) < this.ttlMs) {
      return cached.isAuthenticated;
    }

    // Cache miss or expired - perform actual check
    const result = await checkFn();

    // Cache the result
    this.cache.set(engineId, {
      isAuthenticated: result,
      timestamp: now
    });

    return result;
  }
}

// Global auth cache instance (shared across all subagent executions)
const authCache = new EngineAuthCache();

// --------------------------------------------------------------------------
// Helper Types
// --------------------------------------------------------------------------

interface EngineResolution {
  engineType: EngineType;
  engineModule: Awaited<ReturnType<typeof import('../../infra/engines/index.js').registry.get>>;
  model: string | undefined;
  modelReasoningEffort: 'low' | 'medium' | 'high' | undefined;
}

interface MonitoringContext {
  monitor: AgentMonitorService | null;
  loggerService: AgentLoggerService | null;
  monitoringAgentId: number | undefined;
}

// --------------------------------------------------------------------------
// Engine Resolution Helpers
// --------------------------------------------------------------------------

/**
 * Resolve which engine to use based on overrides and config
 */
async function resolveEngine(
  agentId: string,
  agentConfig: Awaited<ReturnType<typeof loadAgentConfig>>,
  engineOverride?: EngineType
): Promise<EngineResolution> {
  const { registry } = await import('../../infra/engines/index.js');

  let engineType: EngineType;

  if (engineOverride) {
    engineType = engineOverride;
  } else if (agentConfig.engine) {
    engineType = agentConfig.engine;
  } else {
    // Fallback: find first authenticated engine by order (WITH CACHING)
    const engines = registry.getAll();
    let foundEngine = null;

    for (const engine of engines) {
      const isAuth = await authCache.isAuthenticated(
        engine.metadata.id,
        () => engine.auth.isAuthenticated()
      );
      if (isAuth) {
        foundEngine = engine;
        break;
      }
    }

    if (!foundEngine) {
      foundEngine = registry.getDefault();
    }

    if (!foundEngine) {
      throw new Error('No engines registered. Please install at least one engine.');
    }

    engineType = foundEngine.metadata.id;
    info(`No engine specified for agent '${agentId}', using ${foundEngine.metadata.name} (${engineType})`);
  }

  // Ensure authentication
  await ensureEngineAuth(engineType);

  const engineModule = registry.get(engineType);
  if (!engineModule) {
    throw new Error(`Engine not found: ${engineType}`);
  }

  // Model resolution: CLI override > agent config > engine default
  const model = (agentConfig.model as string | undefined) ?? engineModule.metadata.defaultModel;
  const modelReasoningEffort = (agentConfig.modelReasoningEffort as 'low' | 'medium' | 'high' | undefined) ?? engineModule.metadata.defaultModelReasoningEffort;

  return { engineType, engineModule, model, modelReasoningEffort };
}

// --------------------------------------------------------------------------
// Monitoring Helpers
// --------------------------------------------------------------------------

/**
 * Initialize monitoring context (register or resume agent)
 */
async function initializeMonitoring(
  options: {
    disableMonitoring?: boolean;
    resumeMonitoringId?: number;
    ui?: AgentExecutionUI;
    uniqueAgentId?: string;
    displayPrompt?: string;
    parentId?: number;
  },
  agentId: string,
  prompt: string,
  engineType: EngineType,
  model: string | undefined
): Promise<MonitoringContext> {
  if (options.disableMonitoring) {
    return { monitor: null, loggerService: null, monitoringAgentId: undefined };
  }

  const monitor = AgentMonitorService.getInstance();
  const loggerService = AgentLoggerService.getInstance();
  let monitoringAgentId: number | undefined;

  if (options.resumeMonitoringId !== undefined) {
    // RESUME: Use existing monitoring entry
    monitoringAgentId = options.resumeMonitoringId;
    debug(`[AgentRunner] RESUME: Using existing monitoringId=%d`, monitoringAgentId);

    await monitor.markRunning(monitoringAgentId);

    if (options.ui && options.uniqueAgentId) {
      debug(`[AgentRunner] RESUME: Registering monitoringId=%d with UI`, monitoringAgentId);
      options.ui.registerMonitoringId(options.uniqueAgentId, monitoringAgentId);
    }
  } else {
    // NEW EXECUTION: Register new monitoring entry
    const promptForDisplay = options.displayPrompt || prompt;
    debug(`[AgentRunner] NEW: Registering monitoring for agentId=%s`, agentId);

    monitoringAgentId = await monitor.register({
      name: agentId,
      prompt: promptForDisplay,
      parentId: options.parentId,
      engine: engineType,
      engineProvider: engineType,
      modelName: model,
    });
    debug(`[AgentRunner] NEW: Registered with monitoringId=%d`, monitoringAgentId);

    // Store full prompt for debug mode logging
    loggerService.storeFullPrompt(monitoringAgentId, prompt);

    if (options.ui && options.uniqueAgentId && monitoringAgentId !== undefined) {
      debug(`[AgentRunner] NEW: Registering monitoringId=%d with UI`, monitoringAgentId);
      options.ui.registerMonitoringId(options.uniqueAgentId, monitoringAgentId);
    }
  }

  return { monitor, loggerService, monitoringAgentId };
}

// --------------------------------------------------------------------------
// Session Resume Helpers
// --------------------------------------------------------------------------

/**
 * Resolve resume session ID from options
 */
async function resolveResumeSession(
  resumeSessionIdOption?: string,
  resumeMonitoringId?: number
): Promise<string | undefined> {
  if (resumeSessionIdOption) {
    return resumeSessionIdOption;
  }

  if (resumeMonitoringId !== undefined) {
    const monitor = AgentMonitorService.getInstance();
    const resumeAgent = monitor.getAgent(resumeMonitoringId);
    debug(`[AgentRunner] Looking up sessionId from monitoringId=%d`, resumeMonitoringId);

    if (resumeAgent?.sessionId) {
      debug(`[AgentRunner] Using sessionId %s from monitoringId %d`, resumeAgent.sessionId, resumeMonitoringId);
      return resumeAgent.sessionId;
    }
  }

  return undefined;
}

// --------------------------------------------------------------------------
// Public Interface
// --------------------------------------------------------------------------

/**
 * Minimal UI interface for agent execution
 */
export interface AgentExecutionUI {
  registerMonitoringId(uiAgentId: string, monitoringAgentId: number): void;
  setAgentGoal?(agentId: string, goal: string): void;
  setCurrentFile?(agentId: string, file: string): void;
  setCurrentAction?(agentId: string, action: string): void;
}

export interface ExecuteAgentOptions {
  /**
   * Engine to use (overrides agent config)
   */
  engine?: EngineType;

  /**
   * Model to use (overrides agent config)
   */
  model?: string;

  /**
   * Working directory for execution
   */
  workingDir: string;

  /**
   * Project root for config lookup (defaults to workingDir)
   */
  projectRoot?: string;

  /**
   * Logger for stdout
   */
  logger?: (chunk: string) => void;

  /**
   * Logger for stderr
   */
  stderrLogger?: (chunk: string) => void;

  /**
   * Telemetry callback (for UI updates)
   */
  onTelemetry?: (telemetry: ParsedTelemetry) => void;

  /**
   * Abort signal
   */
  abortSignal?: AbortSignal;

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Parent agent ID (for tracking parent-child relationships)
   */
  parentId?: number;

  /**
   * Disable monitoring (for special cases where monitoring is not desired)
   */
  disableMonitoring?: boolean;

  /**
   * UI manager (for registering monitoring IDs)
   */
  ui?: AgentExecutionUI;

  /**
   * Unique agent ID for UI (for registering monitoring IDs)
   */
  uniqueAgentId?: string;

  /**
   * Display prompt (for logging/monitoring - shows user's actual request)
   * If not provided, uses the full execution prompt
   */
  displayPrompt?: string;

  /**
   * Monitoring ID for resuming (skip new registration, use existing log)
   */
  resumeMonitoringId?: number;

  /**
   * Custom prompt for resume (instead of "Continue from where you left off")
   */
  resumePrompt?: string;

  /**
   * Session ID for resuming (direct, for when monitoringId is not available)
   */
  resumeSessionId?: string;

  /**
   * Selected conditions for filtering conditional chained prompt paths
   */
  selectedConditions?: string[];
}

/**
 * Ensures the engine is authenticated
 */
async function ensureEngineAuth(engineType: EngineType): Promise<void> {
  const { registry } = await import('../../infra/engines/index.js');
  const engine = registry.get(engineType);

  if (!engine) {
    const availableEngines = registry.getAllIds().join(', ');
    throw new Error(
      `Unknown engine type: ${engineType}. Available engines: ${availableEngines}`
    );
  }

  const isAuthed = await engine.auth.isAuthenticated();
  if (!isAuthed) {
    console.error(`\n${engine.metadata.name} authentication required`);
    console.error(`\nRun the following command to authenticate:\n`);
    console.error(`  codemachine auth login\n`);
    throw new Error(`${engine.metadata.name} authentication required`);
  }
}

/**
 * Executes a sub-agent or CLI agent with a pre-built prompt
 *
 * This is a low-level execution function that:
 * - Accepts FINAL, ready-to-use prompts (no template loading or prompt building)
 * - Handles engine authentication
 * - Manages monitoring and logging
 * - Executes the engine
 * - Stores output in memory
 *
 * Prompt building is the caller's responsibility:
 * - Orchestration layer: builds [SYSTEM] + [INPUT FILES] + [REQUEST]
 * - Workflow layer: processes templates with processPromptString()
 *
 * This loads agent configuration from:
 * - config/sub.agents.js
 * - config/main.agents.js
 * - .codemachine/agents/agents-config.json
 *
 * Used by:
 * - Orchestration executor (src/agents/orchestration/executor.ts)
 * - Workflow step executor (src/workflows/execution/step.ts)
 * - CLI commands (via orchestration)
 */
export interface AgentExecutionOutput {
  output: string;
  agentId?: number;
  chainedPrompts?: ChainedPrompt[];
}

export async function executeAgent(
  agentId: string,
  prompt: string,
  options: ExecuteAgentOptions,
): Promise<AgentExecutionOutput> {
  const { workingDir, projectRoot, engine: engineOverride, model: modelOverride, logger, stderrLogger, onTelemetry, abortSignal, timeout, parentId, disableMonitoring, ui, uniqueAgentId, displayPrompt, resumeMonitoringId, resumePrompt, resumeSessionId: resumeSessionIdOption, selectedConditions } = options;

  debug(`[AgentRunner] executeAgent called: agentId=%s promptLength=%d`, agentId, prompt.length);
  debug(`[AgentRunner] Options: workingDir=%s engineOverride=%s modelOverride=%s parentId=%s`,
    workingDir, engineOverride ?? '(none)', modelOverride ?? '(none)', parentId ?? '(none)');
  debug(`[AgentRunner] Resume options: resumeMonitoringId=%s resumeSessionId=%s resumePrompt=%s`,
    resumeMonitoringId ?? '(none)', resumeSessionIdOption ?? '(none)', resumePrompt ? resumePrompt.slice(0, 50) + '...' : '(none)');

  // Resolve resume session ID
  const resumeSessionId = await resolveResumeSession(resumeSessionIdOption, resumeMonitoringId);
  if (resumeSessionId) {
    debug(`[AgentRunner] Will resume with sessionId: %s`, resumeSessionId);
  }

  // Load agent config and resolve engine/model
  const agentConfig = await loadAgentConfig(agentId, projectRoot ?? workingDir);
  const { engineType, model: resolvedModel, modelReasoningEffort } = await resolveEngine(
    agentId,
    agentConfig,
    engineOverride
  );

  // Apply model override if provided
  const model = modelOverride ?? resolvedModel;

  // Initialize monitoring
  const { monitor, loggerService, monitoringAgentId } = await initializeMonitoring(
    { disableMonitoring, resumeMonitoringId, ui, uniqueAgentId, displayPrompt, parentId },
    agentId,
    prompt,
    engineType,
    model
  );

  // Set up memory
  const memoryDir = path.resolve(workingDir, '.codemachine', 'memory');
  const adapter = new MemoryAdapter(memoryDir);
  const store = new MemoryStore(adapter);

  // Get engine and execute
  // NOTE: Prompt is already complete - no template loading or building here
  const engine = getEngine(engineType);
  debug(`[AgentRunner] Starting engine execution: engine=%s model=%s resumeSessionId=%s`,
    engineType, model, resumeSessionId ?? '(new session)');

  let totalStdout = '';
  let lastParsedLength = 0; // Track what we've already parsed to avoid duplicates
  let goalExtracted = false; // Track if we've extracted the goal yet

  try {
    const result = await engine.run({
      prompt, // Already complete and ready to use
      workingDir,
      resumeSessionId,
      resumePrompt,
      model,
      modelReasoningEffort,
      env: {
        ...process.env,
        // Pass parent agent ID to child processes (for orchestration context)
        ...(monitoringAgentId !== undefined && {
          CODEMACHINE_PARENT_AGENT_ID: monitoringAgentId.toString()
        })
      },
      onData: (chunk) => {
        totalStdout += chunk;

        // Extract context from agent output (goal, file, action)
        if (ui && uniqueAgentId) {
          // Extract goal from initial output (only once)
          if (!goalExtracted && totalStdout.length > 50) {
            const goal = extractGoal(totalStdout);
            if (goal) {
              debug(`[AgentRunner] Extracted goal: %s`, goal);
              ui.setAgentGoal?.(uniqueAgentId, goal);
              goalExtracted = true;
            }
          }

          // Parse tool use from new content (avoid re-parsing)
          const newContent = totalStdout.slice(lastParsedLength);
          if (newContent.length > 0) {
            const toolUse = parseToolUse(newContent);
            if (toolUse.tool && toolUse.parameters) {
              const context = extractContextFromTool(toolUse.tool, toolUse.parameters);

              if (context.currentFile) {
                debug(`[AgentRunner] Detected file: %s`, context.currentFile);
                ui.setCurrentFile?.(uniqueAgentId, context.currentFile);
              }

              if (context.currentAction) {
                debug(`[AgentRunner] Detected action: %s`, context.currentAction);
                ui.setCurrentAction?.(uniqueAgentId, context.currentAction);
              }

              // Update parsed position to end of this tool call
              lastParsedLength = totalStdout.length;
            }
          }
        }

        // Dual-stream: write to log file (with status text) AND original logger (with colors)
        if (loggerService && monitoringAgentId !== undefined) {
          // Transform color markers to status text for log file readability
          const logChunk = formatForLogFile(chunk);
          loggerService.write(monitoringAgentId, logChunk);
        }

        // Keep original format with color markers for UI display
        if (logger) {
          logger(chunk);
        } else {
          try {
            process.stdout.write(chunk);
          } catch {
            // ignore streaming failures
          }
        }
      },
      onErrorData: (chunk) => {
        // Also log stderr to file (with status text transformation)
        if (loggerService && monitoringAgentId !== undefined) {
          const logChunk = formatForLogFile(chunk);
          loggerService.write(monitoringAgentId, `[STDERR] ${logChunk}`);
        }

        if (stderrLogger) {
          stderrLogger(chunk);
        } else {
          try {
            process.stderr.write(chunk);
          } catch {
            // ignore streaming failures
          }
        }
      },
      onTelemetry: (telemetry) => {
        // Update telemetry in monitoring (fire and forget - don't block streaming)
        if (monitor && monitoringAgentId !== undefined) {
          monitor.updateTelemetry(monitoringAgentId, telemetry).catch(err =>
            error(`Failed to update telemetry: ${err}`)
          );
        }

        // Forward to caller's telemetry callback (for UI updates)
        if (onTelemetry) {
          onTelemetry(telemetry);
        }
      },
      onSessionId: (sessionId) => {
        // Store session ID for resume capability
        debug(`[onSessionId callback] sessionId=${sessionId}, monitor=${!!monitor}, monitoringAgentId=${monitoringAgentId}`);
        if (monitor && monitoringAgentId !== undefined) {
          monitor.setSessionId(monitoringAgentId, sessionId).catch(err =>
            error(`Failed to set session ID: ${err}`)
          );
        }
      },
      abortSignal,
      timeout,
    });

    // Store output in memory
    // Prefer totalStdout (formatted text from onData) over result.stdout (raw JSON)
    const stdout = totalStdout || result.stdout;
    const slice = stdout.slice(-2000);
    await store.append({
      agentId,
      content: slice,
      timestamp: new Date().toISOString(),
    });

    debug(`[AgentRunner] Engine execution completed, outputLength=%d`, totalStdout.length);

    // Mark agent as completed
    if (monitor && monitoringAgentId !== undefined) {
      debug(`[AgentRunner] Marking agent %d as completed`, monitoringAgentId);
      await monitor.complete(monitoringAgentId);
      // Note: Don't close stream here - workflow may write more messages
      // Streams will be closed by cleanup handlers or monitoring service shutdown
    }

    // Load chained prompts if configured
    // Always load on fresh execution; on resume, workflow.ts decides whether to use them
    // based on chain resume state (chainResumeInfo)
    let chainedPrompts: ChainedPrompt[] | undefined;
    debug(`[AgentRunner] ChainedPrompts path: %s`, agentConfig.chainedPromptsPath ?? '(none)');
    if (agentConfig.chainedPromptsPath) {
      chainedPrompts = await loadChainedPrompts(
        agentConfig.chainedPromptsPath,
        projectRoot ?? workingDir,
        selectedConditions ?? []
      );
      debug(`[ChainedPrompts] Loaded ${chainedPrompts.length} chained prompts for agent '${agentId}'`);
    } else {
      debug(`[ChainedPrompts] No chainedPromptsPath for agent '${agentId}'`);
    }

    debug(`[AgentRunner] Returning result: monitoringAgentId=%d chainedPrompts=%d`,
      monitoringAgentId ?? -1, chainedPrompts?.length ?? 0);

    return {
      output: stdout,
      agentId: monitoringAgentId,
      chainedPrompts,
    };
  } catch (err) {
    debug(`[AgentRunner] Error during execution: %s`, (err as Error).message);

    // Mark agent as failed (unless already paused - that means intentional abort)
    if (monitor && monitoringAgentId !== undefined) {
      const agent = monitor.getAgent(monitoringAgentId);
      debug(`[AgentRunner] Agent status: %s`, agent?.status ?? '(not found)');
      if (agent?.status !== 'paused') {
        debug(`[AgentRunner] Marking agent %d as failed`, monitoringAgentId);
        await monitor.fail(monitoringAgentId, err as Error);
      } else {
        debug(`[AgentRunner] Agent is paused, not marking as failed`);
      }
      // Note: Don't close stream here - workflow may write more messages
      // Streams will be closed by cleanup handlers or monitoring service shutdown
    }
    throw err;
  }
}
