/**
 * Log Stream Hook for OpenTUI/SolidJS
 *
 * Streams log file contents with real-time updates for running agents.
 * Ported from src/ui/hooks/useLogStream.ts (React/Ink version)
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import { AgentMonitorService } from "../../../../../agents/monitoring/monitor.js"
import type { AgentRecord } from "../../../../../agents/monitoring/types.js"
import { existsSync, statSync, createReadStream } from "fs"

// Debug logging (writes to tui-debug.log when DEBUG is enabled)
const DEBUG_ENABLED = process.env.DEBUG &&
  process.env.DEBUG.trim() !== '' &&
  process.env.DEBUG !== '0' &&
  process.env.DEBUG.toLowerCase() !== 'false'

function logDebug(message: string, ...args: unknown[]) {
  if (DEBUG_ENABLED) {
    console.log(`[LogStream] ${message}`, ...args)
  }
}

export interface LogStreamResult {
  lines: string[]
  isLoading: boolean
  isConnecting: boolean
  error: string | null
  logPath: string
  fileSize: number
  agentName: string
  isRunning: boolean
  latestThinking: string | null
}

/**
 * Read new content from log file starting at byte offset
 * Returns { content, newSize } for incremental updates
 */
function readLogIncremental(filePath: string, fromByte: number): Promise<{ content: string; newSize: number }> {
  return new Promise((resolve) => {
    try {
      if (!existsSync(filePath)) {
        resolve({ content: '', newSize: 0 })
        return
      }

      const stats = statSync(filePath)
      const currentSize = stats.size

      // No new content
      if (currentSize <= fromByte) {
        resolve({ content: '', newSize: currentSize })
        return
      }

      // Read only new bytes
      const chunks: Buffer[] = []
      const stream = createReadStream(filePath, {
        start: fromByte,
        end: currentSize - 1,
        encoding: undefined
      })

      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf-8')
        resolve({ content, newSize: currentSize })
      })
      stream.on('error', () => resolve({ content: '', newSize: fromByte }))
    } catch {
      resolve({ content: '', newSize: fromByte })
    }
  })
}

/**
 * Hook to stream log file contents with real-time updates for running agents
 * Uses 500ms polling for reliability across all filesystems
 */
export function useLogStream(monitoringAgentId: () => number | undefined): LogStreamResult {
  const [lines, setLines] = createSignal<string[]>([])
  const [isLoading, setIsLoading] = createSignal(true)
  const [isConnecting, setIsConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [fileSize, setFileSize] = createSignal(0)
  const [agent, setAgent] = createSignal<AgentRecord | null>(null)
  const [latestThinking, setLatestThinking] = createSignal<string | null>(null)

  createEffect(() => {
    const agentId = monitoringAgentId()

    logDebug('Effect triggered, agentId=%s', agentId)

    if (agentId === undefined) {
      logDebug('No agentId, resetting state')
      setIsLoading(true)
      setIsConnecting(false)
      setError(null)
      setLines([])
      return
    }

    let mounted = true
    let pollInterval: NodeJS.Timeout | undefined
    let retryInterval: NodeJS.Timeout | undefined

    // Incremental read state
    let lastReadByte = 0
    let accumulatedLines: string[] = []
    let partialLine = '' // Handle lines split across reads

    /**
     * Try to get agent from registry with retries
     */
    async function getAgentWithRetry(attempts = 5, delay = 300): Promise<AgentRecord | null> {
      const monitor = AgentMonitorService.getInstance()
      // agentId is guaranteed to be defined here because we return early if undefined
      const id = agentId as number

      logDebug('getAgentWithRetry id=%d attempts=%d', id, attempts)

      for (let i = 0; i < attempts; i++) {
        const agentRecord = monitor.getAgent(id)
        if (agentRecord) {
          logDebug('Found agent on attempt %d: name=%s status=%s logPath=%s',
            i + 1, agentRecord.name, agentRecord.status, agentRecord.logPath)
          return agentRecord
        }

        logDebug('Agent not found on attempt %d/%d', i + 1, attempts)
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      logDebug('Agent not found after %d attempts', attempts)
      return null
    }

    /**
     * Filter out box-style header lines and telemetry from log display
     * These are kept in log files for debugging but hidden from UI
     */
    function filterHeaderLines(fileLines: string[]): string[] {
      const filtered = fileLines.filter((line) => {
        if (line.includes("╭─") || line.includes("╰─")) return false
        if (line.includes("Started:") || line.includes("Prompt:")) return false
        // Filter out token telemetry lines (shown in telemetry bar instead)
        if (line.includes("Tokens:") && (line.includes("in/") || line.includes("out"))) return false
        return true
      })
      // Trim empty lines from start
      while (filtered.length > 0 && !filtered[0]?.trim()) {
        filtered.shift()
      }
      return filtered
    }

    /**
     * Extract latest thinking line from logs
     * Looks for lines with "Thinking:" pattern
     */
    function extractLatestThinking(fileLines: string[]): string | null {
      for (let i = fileLines.length - 1; i >= 0; i--) {
        const line = fileLines[i]
        if (line && line.includes("Thinking:")) {
          // Extract text after "Thinking:" and strip markers
          const match = line.match(/Thinking:\s*(.+)/)
          if (match) {
            return match[1].trim()
          }
        }
      }
      return null
    }

    /**
     * Update log lines from file using incremental reads
     * Only reads new bytes since last poll
     */
    async function updateLogsIncremental(logPath: string): Promise<boolean> {
      if (!mounted) return false

      try {
        if (!existsSync(logPath)) {
          logDebug('updateLogs: file does not exist: %s', logPath)
          return false
        }

        const { content, newSize } = await readLogIncremental(logPath, lastReadByte)

        // No new content
        if (!content && lastReadByte > 0) {
          return true // File exists, just no updates
        }

        if (content) {
          // Prepend any partial line from previous read
          const fullContent = partialLine + content
          const newLines = fullContent.split('\n')

          // Last element might be partial (no trailing newline)
          partialLine = newLines.pop() ?? ''

          // Append new complete lines
          accumulatedLines = [...accumulatedLines, ...newLines]
          lastReadByte = newSize
        }

        if (mounted) {
          const filteredLines = filterHeaderLines(accumulatedLines)
          const thinking = extractLatestThinking(accumulatedLines)
          setLines(filteredLines)
          setLatestThinking(thinking)
          setFileSize(newSize)
          setIsConnecting(false)
          setError(null)
          logDebug('updateLogs: success, lines=%d size=%d', filteredLines.length, newSize)
          return true
        }
      } catch (err) {
        logDebug('updateLogs: error reading file: %s', err)
      }
      return false
    }

    /**
     * Initialize log streaming
     */
    async function initialize(): Promise<void> {
      logDebug('initialize: starting')
      const agentRecord = await getAgentWithRetry()

      if (!agentRecord) {
        logDebug('initialize: agent not found, setting error')
        if (mounted) {
          setError("Agent not found in monitoring registry")
          setIsLoading(false)
          setIsConnecting(false)
        }
        return
      }

      if (!mounted) return

      logDebug('initialize: agent found, logPath=%s', agentRecord.logPath)
      setAgent(agentRecord)
      setError(null)

      // Reset incremental state for new agent
      lastReadByte = 0
      accumulatedLines = []
      partialLine = ''

      // Initial log read
      const success = await updateLogsIncremental(agentRecord.logPath)
      logDebug('initialize: initial updateLogs success=%s', success)

      if (mounted) {
        setIsLoading(false)
      }

      // If file doesn't exist yet, set up retry polling
      if (!success && mounted) {
        logDebug('initialize: file not ready, starting retry polling')
        setIsConnecting(true)
        const MAX_RETRIES = 240 // 120 seconds
        let currentRetry = 0

        retryInterval = setInterval(async () => {
          if (!mounted) {
            clearInterval(retryInterval)
            return
          }

          currentRetry++

          if (currentRetry >= MAX_RETRIES) {
            logDebug('initialize: max retries reached (%d), giving up', MAX_RETRIES)
            clearInterval(retryInterval)
            setIsConnecting(false)
            setError("Can't connect to agent after 120 sec")
            return
          }

          const retrySuccess = await updateLogsIncremental(agentRecord.logPath)

          if (retrySuccess) {
            logDebug('initialize: retry %d succeeded, starting polling', currentRetry)
            clearInterval(retryInterval)
            // Always start polling after successful connection
            if (mounted) {
              startPolling(agentRecord.logPath)
            }
          }
        }, 500)

        return
      }

      // Always start polling for log updates
      if (success) {
        logDebug('initialize: starting polling immediately')
        startPolling(agentRecord.logPath)
      }
    }

    /**
     * Start polling for log updates (incremental reads)
     */
    function startPolling(logPath: string): void {
      logDebug('startPolling: path=%s', logPath)
      if (pollInterval) {
        clearInterval(pollInterval)
      }

      // 500ms polling with incremental reads
      pollInterval = setInterval(async () => {
        if (mounted) {
          await updateLogsIncremental(logPath)
        }
      }, 500)
    }

    initialize()

    // Cleanup
    onCleanup(() => {
      logDebug('cleanup: unmounting, clearing intervals')
      mounted = false
      if (pollInterval) {
        clearInterval(pollInterval)
      }
      if (retryInterval) {
        clearInterval(retryInterval)
      }
    })
  })

  return {
    get lines() {
      return lines()
    },
    get isLoading() {
      return isLoading()
    },
    get isConnecting() {
      return isConnecting()
    },
    get error() {
      return error()
    },
    get logPath() {
      return agent()?.logPath || ""
    },
    get fileSize() {
      return fileSize()
    },
    get agentName() {
      return agent()?.name || ""
    },
    get isRunning() {
      return agent()?.status === "running"
    },
    get latestThinking() {
      return latestThinking()
    },
  }
}
