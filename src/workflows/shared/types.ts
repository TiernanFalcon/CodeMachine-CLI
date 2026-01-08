/**
 * Shared Workflow Types
 *
 * Core types that are shared between workflow execution and UI layers.
 * This is the source of truth - UI layer imports from here, not vice versa.
 */

/**
 * Agent execution status
 */
export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'retrying'
  | 'paused'
  | 'checkpoint';

/**
 * Agent telemetry data
 */
export interface AgentTelemetry {
  tokensIn: number;
  tokensOut: number;
  cached?: number;
  cost?: number;
  duration?: number;
}

/**
 * Workflow execution status
 */
export type WorkflowStatus =
  | 'running'
  | 'stopping'
  | 'completed'
  | 'stopped'
  | 'checkpoint'
  | 'paused'
  | 'error'
  | 'rate_limit_waiting';

/**
 * Loop execution state
 */
export interface LoopState {
  active: boolean;
  sourceAgent: string;
  backSteps: number;
  iteration: number;
  maxIterations: number;
  skipList: string[];
  reason?: string;
}

/**
 * Checkpoint state
 */
export interface CheckpointState {
  active: boolean;
  reason?: string;
}

/**
 * Queued prompt for chained execution
 */
export interface QueuedPrompt {
  name: string;
  label: string;
  content: string;
}

/**
 * Unified input state - when workflow is waiting for user input
 */
export interface InputState {
  active: boolean;
  queuedPrompts?: QueuedPrompt[];
  currentIndex?: number;
  monitoringId?: number;
}

/**
 * @deprecated Use InputState instead
 */
export interface ChainedState {
  active: boolean;
  currentIndex: number;
  totalPrompts: number;
  nextPromptLabel: string | null;
  monitoringId?: number;
}

/**
 * Sub-agent state (child of main agent)
 */
export interface SubAgentState {
  id: string;
  name: string;
  engine: string;
  model?: string;
  status: AgentStatus;
  parentId: string;
  telemetry: AgentTelemetry;
  startTime: number;
  endTime?: number;
  error?: string;
  toolCount: number;
  thinkingCount: number;
}

/**
 * Triggered agent state (spawned by another agent)
 */
export interface TriggeredAgentState {
  id: string;
  name: string;
  engine: string;
  model?: string;
  status: AgentStatus;
  triggeredBy: string;
  triggerCondition?: string;
  telemetry: AgentTelemetry;
  startTime: number;
  endTime?: number;
  error?: string;
  toolCount: number;
  thinkingCount: number;
}
