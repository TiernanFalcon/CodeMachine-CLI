/**
 * Workflow Modals Hook
 *
 * Manages modal state for the workflow view.
 */

import { createSignal } from "solid-js"

export interface WorkflowModalsState {
  logViewerAgentId: () => string | null
  setLogViewerAgentId: (id: string | null) => void
  showHistory: () => boolean
  setShowHistory: (show: boolean) => void
  historySelectedIndex: () => number
  setHistorySelectedIndex: (index: number) => void
  historyLogViewerMonitoringId: () => number | null
  setHistoryLogViewerMonitoringId: (id: number | null) => void
  showSettings: () => boolean
  setShowSettings: (show: boolean) => void
  isLogViewerActive: () => boolean
  isHistoryActive: () => boolean
  isHistoryLogViewerActive: () => boolean
  isSettingsActive: () => boolean
}

/**
 * Hook for managing workflow modal states
 */
export function useWorkflowModals(): WorkflowModalsState {
  const [logViewerAgentId, setLogViewerAgentId] = createSignal<string | null>(null)
  const [showHistory, setShowHistory] = createSignal(false)
  const [historySelectedIndex, setHistorySelectedIndex] = createSignal(0)
  const [historyLogViewerMonitoringId, setHistoryLogViewerMonitoringId] = createSignal<number | null>(null)
  const [showSettings, setShowSettings] = createSignal(false)

  return {
    logViewerAgentId,
    setLogViewerAgentId,
    showHistory,
    setShowHistory,
    historySelectedIndex,
    setHistorySelectedIndex,
    historyLogViewerMonitoringId,
    setHistoryLogViewerMonitoringId,
    showSettings,
    setShowSettings,
    isLogViewerActive: () => logViewerAgentId() !== null,
    isHistoryActive: () => showHistory(),
    isHistoryLogViewerActive: () => historyLogViewerMonitoringId() !== null,
    isSettingsActive: () => showSettings(),
  }
}
