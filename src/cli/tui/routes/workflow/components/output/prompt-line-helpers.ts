/**
 * Prompt Line Helpers
 *
 * Visual styling and text generation for the PromptLine component.
 */

import type { PromptLineState } from "./prompt-line.js"

export interface Theme {
  textMuted: number
  warning: number
  primary: number
}

/**
 * Get the prompt symbol based on current state
 */
export function getPromptSymbol(state: PromptLineState): string {
  if (state.mode === "disabled") return "·"
  if (state.mode === "active" && state.reason === "paused") return "||"
  return "❯"
}

/**
 * Get the color for the prompt symbol
 */
export function getSymbolColor(state: PromptLineState, theme: Theme): number {
  if (state.mode === "disabled") return theme.textMuted
  if (state.mode === "active" && state.reason === "paused") return theme.warning
  return theme.primary
}

/**
 * Get placeholder text based on current state
 */
export function getPlaceholder(state: PromptLineState): string {
  switch (state.mode) {
    case "disabled":
      return "Workflow idle"
    case "passive":
      return "Agent working..."
    case "active":
      return state.reason === "paused"
        ? "Type to steer or Enter to resume"
        : "Type to steer agent..."
    case "chained":
      return `Next: "${state.name}" (${state.index}/${state.total})`
    default:
      return ""
  }
}

/**
 * Get hint text based on current state
 */
export function getHint(state: PromptLineState, isInteractive: boolean): string | null {
  // Show chained step info even in passive mode
  if (state.mode === "passive" && state.chainedStep) {
    const step = state.chainedStep
    return `Step ${step.index}/${step.total}: ${step.name}`
  }

  if (!isInteractive) return null

  if (state.mode === "chained") {
    return `Step ${state.index}/${state.total}: ${state.name}`
  }

  if (state.mode === "active" && state.reason === "paused") {
    return "[Enter] Resume"
  }

  return "[Enter] Send"
}

/**
 * Check if the current state allows user interaction
 */
export function isInteractiveState(state: PromptLineState): boolean {
  return state.mode === "active" || state.mode === "chained"
}

/**
 * Get next step info for confirmation modal
 */
export function getNextStepInfo(state: PromptLineState): {
  index: number
  name: string
  description: string
  total: number
} {
  if (state.mode === "chained") {
    return {
      index: state.index + 1,
      name: state.name,
      description: state.description,
      total: state.total,
    }
  }
  return { index: 0, name: "", description: "", total: 0 }
}
