import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import type { WorkflowStep } from '../templates/index.js';
import { isModuleStep } from '../templates/types.js';
import { executeStep } from './step.js';
import { mainAgents } from '../utils/config.js';
import type { WorkflowEventEmitter } from '../events/index.js';
import { debug } from '../../shared/logging/logger.js';

export interface FallbackExecutionOptions {
  logger: (message: string) => void;
  stderrLogger: (message: string) => void;
  emitter?: WorkflowEventEmitter;
  abortSignal?: AbortSignal;
}

/**
 * Checks if there's any plan state to recover from.
 * Returns true if there are partial plan files that need recovery analysis.
 * Returns false if:
 * - Plan directory doesn't exist or is empty (nothing to recover)
 * - Plan is already complete (plan_manifest.json exists)
 */
function hasPlanStateToRecover(cwd: string): boolean {
  const planDir = path.join(cwd, '.codemachine', 'artifacts', 'plan');

  // Check if directory exists
  if (!existsSync(planDir)) {
    debug('[fallback] Plan directory does not exist - nothing to recover');
    return false;
  }

  try {
    const files = readdirSync(planDir);

    // If directory is empty, nothing to recover
    if (files.length === 0) {
      debug('[fallback] Plan directory is empty - nothing to recover');
      return false;
    }

    // If plan_manifest.json exists, plan is complete - no recovery needed
    if (files.includes('plan_manifest.json')) {
      debug('[fallback] plan_manifest.json exists - plan is complete, no recovery needed');
      return false;
    }

    // Check if there are any .md files (partial plan state)
    const hasMdFiles = files.some(f => f.endsWith('.md'));
    if (!hasMdFiles) {
      debug('[fallback] No .md files in plan directory - nothing to recover');
      return false;
    }

    debug('[fallback] Found partial plan state - recovery needed');
    return true;
  } catch (error) {
    debug('[fallback] Error reading plan directory: %o', error);
    return false;
  }
}

/**
 * Checks if a fallback should be executed for this step.
 * Returns true if the step is in notCompletedSteps and has a fallback agent defined.
 */
export function shouldExecuteFallback(
  step: WorkflowStep,
  stepIndex: number,
  notCompletedSteps: number[],
): boolean {
  return isModuleStep(step) && notCompletedSteps.includes(stepIndex) && !!step.notCompletedFallback;
}

/**
 * Executes the fallback agent for a step that previously failed.
 * The fallback agent uses the same configuration (model, engine, etc.) as the original step.
 */
export async function executeFallbackStep(
  step: WorkflowStep,
  cwd: string,
  workflowStartTime: number,
  engineType: string,
  emitter?: WorkflowEventEmitter,
  uniqueParentAgentId?: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  // Only module steps can have fallback agents
  if (!isModuleStep(step)) {
    throw new Error('Only module steps can have fallback agents');
  }

  if (!step.notCompletedFallback) {
    throw new Error('No fallback agent defined for this step');
  }

  const fallbackAgentId = step.notCompletedFallback;
  const parentAgentId = uniqueParentAgentId ?? step.agentId;

  // Special case: Skip plan-fallback if there's no plan state to recover from
  // This prevents the fallback agent from running when the plan-agent failed
  // immediately (e.g., due to rate limiting) before producing any output
  if (fallbackAgentId === 'plan-fallback' && !hasPlanStateToRecover(cwd)) {
    debug('[fallback] Skipping plan-fallback - no plan state to recover from');
    if (emitter) {
      emitter.logMessage(fallbackAgentId, `No plan state to recover - skipping fallback and re-running plan-agent.`);
    }
    return; // Skip fallback, let the original step run fresh
  }

  if (emitter) {
    emitter.logMessage(fallbackAgentId, `Fallback agent for ${step.agentName} started to work.`);
  }

  // Look up the fallback agent's configuration to get its prompt path
  const fallbackAgent = mainAgents.find((agent) => agent?.id === fallbackAgentId);
  if (!fallbackAgent) {
    throw new Error(`Fallback agent not found: ${fallbackAgentId}`);
  }

  const promptPath = fallbackAgent.promptPath;
  const promptPathInvalid = Array.isArray(promptPath)
    ? promptPath.length === 0 || promptPath.some(p => typeof p !== 'string' || p.trim() === '')
    : typeof promptPath !== 'string' || promptPath.trim() === '';

  if (promptPathInvalid) {
    throw new Error(`Fallback agent ${fallbackAgentId} is missing a promptPath configuration`);
  }

  const safePromptPath = promptPath as string | string[];

  // Create a fallback step with the fallback agent's prompt path
  const fallbackStep: WorkflowStep = {
    ...step,
    agentId: fallbackAgentId,
    agentName: fallbackAgent.name || fallbackAgentId,
    promptPath: safePromptPath, // Use the fallback agent's prompt, not the original step's
  };

  // Add fallback agent as sub-agent
  const engineName = engineType; // preserve original engine type, even if unknown
  const fallbackAgentData = {
    id: fallbackAgentId,
    name: fallbackAgent.name || fallbackAgentId,
    engine: engineName,
    status: 'running' as const,
    parentId: parentAgentId,
    startTime: Date.now(),
    telemetry: { tokensIn: 0, tokensOut: 0 },
    toolCount: 0,
    thinkingCount: 0,
  };
  if (emitter) {
    emitter.addSubAgent(parentAgentId, fallbackAgentData);
  }

  try {
    await executeStep(fallbackStep, cwd, {
      logger: () => {},
      stderrLogger: () => {},
      uniqueAgentId: fallbackAgentId,
      abortSignal,
    });

    // Update status on success
    if (emitter) {
      emitter.updateAgentStatus(fallbackAgentId, 'completed');
      emitter.logMessage(fallbackAgentId, `Fallback agent completed successfully.`);
      emitter.logMessage(fallbackAgentId, '═'.repeat(80));
    }
  } catch (error) {
    // Don't update status to failed - let it stay as running/retrying
    const errorMsg = `Fallback agent failed: ${error instanceof Error ? error.message : String(error)}`;
    if (emitter) {
      emitter.logMessage(fallbackAgentId, errorMsg);
    }
    throw error; // Re-throw to prevent original step from running
  }
}
