/** @jsxImportSource @opentui/solid */
/**
 * Telemetry Bar Component
 * Ported from: src/ui/components/TelemetryBar.tsx
 *
 * Show workflow info, status, and total telemetry in footer
 */

import { Show, createSignal, createEffect, onCleanup } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/shared/context/theme"
import { formatTokens, formatNumber } from "../../state/formatters"
import type { WorkflowStatus, RateLimitState } from "../../state/types"

export interface TelemetryBarProps {
  workflowName: string
  runtime: string
  status: WorkflowStatus
  total: {
    tokensIn: number
    tokensOut: number
    cached?: number
  }
  autonomousMode?: boolean
  rateLimitState?: RateLimitState | null
}

/**
 * Show workflow info, status, and total telemetry in footer
 */
// Compact threshold - below this width, use compact layout
const COMPACT_WIDTH = 80

export function TelemetryBar(props: TelemetryBarProps) {
  const themeCtx = useTheme()
  const dimensions = useTerminalDimensions()

  const isCompact = () => (dimensions()?.width ?? 80) < COMPACT_WIDTH

  const totalText = () => {
    const cached = props.total.cached ?? 0
    const newTokensIn = props.total.tokensIn - cached
    const base = formatTokens(newTokensIn, props.total.tokensOut)
    return cached > 0 ? `${base} (${formatNumber(cached)} cached)` : base
  }

  // Compact token display - no "cached" info
  const compactTokenText = () => {
    const cached = props.total.cached ?? 0
    const newTokensIn = props.total.tokensIn - cached
    return formatTokens(newTokensIn, props.total.tokensOut)
  }

  // Rate limit countdown timer
  const [countdown, setCountdown] = createSignal<string>("")

  createEffect(() => {
    const rateLimitState = props.rateLimitState
    if (!rateLimitState?.active || !rateLimitState.resetsAt) {
      setCountdown("")
      return
    }

    // Update countdown every second
    const updateCountdown = () => {
      const now = Date.now()
      const resetTime = rateLimitState.resetsAt!.getTime()
      const remaining = Math.max(0, Math.ceil((resetTime - now) / 1000))

      if (remaining <= 0) {
        setCountdown("resuming...")
        return
      }

      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`)
      } else {
        setCountdown(`${seconds}s`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    onCleanup(() => clearInterval(interval))
  })

  const showStatus = () =>
    props.status === "checkpoint" ||
    props.status === "paused" ||
    props.status === "stopped" ||
    props.status === "rate_limit_waiting"

  const statusColor = () => {
    switch (props.status) {
      case "stopped": return themeCtx.theme.error
      case "rate_limit_waiting": return themeCtx.theme.warning
      default: return themeCtx.theme.warning
    }
  }

  const statusText = () => {
    switch (props.status) {
      case "checkpoint": return "Checkpoint"
      case "paused": return "Paused"
      case "stopped": return "Stopped"
      case "rate_limit_waiting": {
        const engine = props.rateLimitState?.engineId
        const cd = countdown()
        if (engine && cd) {
          return `Rate Limited (${engine}) - ${cd}`
        }
        if (cd) {
          return `Rate Limited - ${cd}`
        }
        return "Rate Limited"
      }
      default: return ""
    }
  }

  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
      width="100%"
      borderStyle="rounded"
      borderColor={themeCtx.theme.border}
    >
      {/* Left side: workflow name, runtime, status, autonomous mode */}
      <box flexDirection="row" flexShrink={1}>
        <text fg={themeCtx.theme.text} attributes={1}>
          {props.workflowName}
        </text>
        <text fg={themeCtx.theme.textMuted}> • {props.runtime}</text>
        <Show when={showStatus()}>
          <text fg={themeCtx.theme.text}> • </text>
          <text fg={statusColor()}>{statusText()}</text>
        </Show>
        <Show when={props.autonomousMode}>
          <text fg={themeCtx.theme.text}> • </text>
          <text fg={themeCtx.theme.primary}>AUTO</text>
        </Show>
      </box>

      {/* Right side: token counts */}
      <box flexDirection="row" flexShrink={0}>
        <Show when={!isCompact()}>
          <text fg={themeCtx.theme.textMuted}>Tokens: </text>
          <text fg={themeCtx.theme.text}>{totalText()}</text>
        </Show>
        <Show when={isCompact()}>
          <text fg={themeCtx.theme.text}>{compactTokenText()}</text>
        </Show>
      </box>
    </box>
  )
}
