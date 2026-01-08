import type { RGBA } from "@opentui/core"

// Import and re-export shared types from workflow layer (single source of truth)
// This fixes the layer violation where workflow was importing from TUI
import type {
  AgentStatus,
  AgentTelemetry,
  WorkflowStatus,
  LoopState,
  CheckpointState,
  QueuedPrompt,
  InputState,
  ChainedState,
} from '../../../../../workflows/shared/types.js'

// Re-export the shared types
export type {
  AgentStatus,
  AgentTelemetry,
  WorkflowStatus,
  LoopState,
  CheckpointState,
  QueuedPrompt,
  InputState,
  ChainedState,
}

/**
 * Full agent state with UI-specific properties
 * Extends the shared AgentTelemetry with display state
 */
export interface AgentState {
  id: string
  name: string
  engine: string
  model?: string
  status: AgentStatus
  telemetry: AgentTelemetry
  startTime: number
  endTime?: number
  error?: string
  toolCount: number
  thinkingCount: number
  loopRound?: number
  loopReason?: string
  stepIndex?: number
  totalSteps?: number
  monitoringId?: number // Maps to AgentMonitorService registry ID for log file access
  goal?: string // Agent's current goal/task
  currentFile?: string // File being processed
  currentAction?: string // Current action description
}

/**
 * Sub-agent state with parent reference
 */
export interface SubAgentState extends AgentState {
  parentId: string
}

/**
 * Triggered agent state with trigger info
 */
export interface TriggeredAgentState extends AgentState {
  triggeredBy: string
  triggerCondition?: string
}

/**
 * Rate limit waiting state - when all engines are rate-limited
 */
export interface RateLimitState {
  active: boolean
  /** When the soonest engine resets */
  resetsAt?: Date
  /** Which engine will reset first */
  engineId?: string
  /** List of all rate-limited engines */
  rateLimitedEngines?: string[]
}

/** @deprecated Use InputState instead */
export interface ChainedPromptInfo {
  name: string
  label: string
  content: string
}

export interface ExecutionRecord {
  id: string
  agentName: string
  agentId: string
  cycleNumber?: number
  engine: string
  status: AgentStatus
  startTime: number
  endTime?: number
  duration?: number
  telemetry: AgentTelemetry
  toolCount: number
  thinkingCount: number
  error?: string
}

export interface UIElement {
  id: string
  text: string
  stepIndex: number
}

export interface WorkflowState {
  workflowName: string
  version: string
  packageName: string
  startTime: number
  endTime?: number
  agents: AgentState[]
  subAgents: Map<string, SubAgentState[]>
  triggeredAgents: TriggeredAgentState[]
  uiElements: UIElement[]
  executionHistory: ExecutionRecord[]
  loopState: LoopState | null
  checkpointState: CheckpointState | null
  inputState: InputState | null
  rateLimitState: RateLimitState | null
  /** @deprecated Use inputState instead */
  chainedState: ChainedState | null
  expandedNodes: Set<string>
  showTelemetryView: boolean
  timelineCollapsed: boolean
  selectedAgentId: string | null
  selectedSubAgentId: string | null
  selectedItemType: "main" | "summary" | "sub" | null
  visibleItemCount: number
  scrollOffset: number
  totalSteps: number
  workflowStatus: WorkflowStatus
  agentIdMapVersion: number
  agentLogs: Map<string, string[]>
  autonomousMode: boolean
  /** Currently selected engine preset (null = use step defaults) */
  selectedEnginePreset: string | null
  /** Whether fallback to other engines is enabled on rate limit (default: true) */
  fallbackEnabled: boolean
}

export type ThemeLike = {
  primary: RGBA
  text: RGBA
  textMuted: RGBA
  border: RGBA
  borderSubtle: RGBA
  background: RGBA
  backgroundPanel: RGBA
  backgroundElement: RGBA
}
