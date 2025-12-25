/**
 * Settings Actions
 *
 * Actions for managing settings like engine presets and fallback.
 */

import type { WorkflowState } from "../types"

export type SettingsActionsContext = {
  getState(): WorkflowState
  setState(state: WorkflowState): void
  notify(): void
}

export function createSettingsActions(ctx: SettingsActionsContext) {
  function setEnginePreset(preset: string | null): void {
    const state = ctx.getState()
    if (state.selectedEnginePreset === preset) return
    ctx.setState({ ...state, selectedEnginePreset: preset })
    ctx.notify()
  }

  function setFallbackEnabled(enabled: boolean): void {
    const state = ctx.getState()
    if (state.fallbackEnabled === enabled) return
    ctx.setState({ ...state, fallbackEnabled: enabled })
    ctx.notify()
  }

  return {
    setEnginePreset,
    setFallbackEnabled,
  }
}
