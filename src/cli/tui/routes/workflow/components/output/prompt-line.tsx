/** @jsxImportSource @opentui/solid */
/**
 * Prompt Line Component
 *
 * Always-present command input at the bottom of the output window.
 * Replaces modal-based pause and chained prompt box with inline UX.
 *
 * States:
 * - disabled: Workflow not running / completed (grayed out)
 * - passive: Agent working, user can see but not type
 * - active: Waiting for user input (paused or chaining)
 * - chained: Shows next prompt in chain
 */

import { createSignal, Show } from "solid-js"
import { useTheme } from "@tui/shared/context/theme"
import { ChainConfirmModal } from "./chain-confirm-modal.js"
import { useTypingAnimation } from "./use-typing-animation.js"
import {
  getPromptSymbol,
  getSymbolColor,
  getPlaceholder,
  getHint,
  isInteractiveState,
  getNextStepInfo,
} from "./prompt-line-helpers.js"

const LARGE_PASTE_THRESHOLD = 1000
const PLACEHOLDER_TEXT = "Enter to continue or type prompt..."

type PendingPaste = { placeholder: string; content: string }

export type PromptLineState =
  | { mode: "disabled" }
  | { mode: "passive"; chainedStep?: { name: string; index: number; total: number } }
  | { mode: "active"; reason?: "paused" | "chaining" }
  | { mode: "chained"; name: string; description: string; index: number; total: number }

export interface PromptLineProps {
  state: PromptLineState
  isFocused: boolean
  onSubmit: (prompt: string) => void
  onSkip?: () => void
  onFocusExit: () => void
}

export function PromptLine(props: PromptLineProps) {
  const themeCtx = useTheme()
  const [input, setInput] = createSignal("")
  const [pendingPastes, setPendingPastes] = createSignal<PendingPaste[]>([])
  const [showConfirm, setShowConfirm] = createSignal(false)
  const [pendingSubmitValue, setPendingSubmitValue] = createSignal("")
  let pasteCounter = 0

  // Typing animation for placeholder
  const typingText = useTypingAnimation({
    text: PLACEHOLDER_TEXT,
    isActive: () =>
      props.isFocused &&
      isInteractiveState(props.state) &&
      input() === "",
  })

  // Computed state helpers
  const isInteractive = () => isInteractiveState(props.state)
  const showInput = () => props.isFocused

  // Submit handlers
  const prepareSubmitValue = () => {
    let value = input().trim()
    for (const { placeholder, content } of pendingPastes()) {
      value = value.replace(placeholder, content)
    }
    return value
  }

  const doSubmit = (value: string) => {
    setPendingPastes([])
    pasteCounter = 0
    setInput("")
    props.onSubmit(value)
  }

  const handleSubmit = () => {
    const value = prepareSubmitValue()

    // For chained prompts, show confirmation only if input is empty
    if (props.state.mode === "chained" && value === "") {
      setPendingSubmitValue(value)
      setShowConfirm(true)
      return
    }

    doSubmit(value)
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    doSubmit(pendingSubmitValue())
    setPendingSubmitValue("")
  }

  const handleCancelConfirm = () => {
    setShowConfirm(false)
    setPendingSubmitValue("")
  }

  // Input handlers
  const handleKeyDown = (evt: { name?: string; ctrl?: boolean; preventDefault?: () => void }) => {
    if (evt.name === "return") {
      handleSubmit()
      return
    }

    if (evt.name === "left" && input() === "") {
      evt.preventDefault?.()
      props.onFocusExit()
      return
    }
  }

  const handlePaste = (evt: { text: string; preventDefault?: () => void }) => {
    if (!isInteractive() || !evt.text) return

    // Normalize line endings
    const normalized = evt.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const cleanText = normalized.replace(/\n+/g, " ").trim()

    if (!cleanText) return
    evt.preventDefault?.()

    // Large paste: use placeholder
    if (cleanText.length > LARGE_PASTE_THRESHOLD) {
      pasteCounter++
      const placeholder = `[Pasted Content ${cleanText.length} chars${pasteCounter > 1 ? ` #${pasteCounter}` : ""}]`
      setPendingPastes((prev) => [...prev, { placeholder, content: cleanText }])
      setInput((prev) => prev + placeholder)
    } else {
      setInput((prev) => prev + cleanText)
    }
  }

  // Get visual styling using helpers
  const symbolColor = () => getSymbolColor(props.state, themeCtx.theme)
  const promptSymbol = () => getPromptSymbol(props.state)
  const placeholder = () => getPlaceholder(props.state)
  const hint = () => getHint(props.state, isInteractive())
  const nextStepInfo = () => getNextStepInfo(props.state)

  return (
    <>
      <box flexDirection="column" flexShrink={0} paddingLeft={1} paddingRight={1}>
        {/* Separator line */}
        <box height={1}>
          <text fg={themeCtx.theme.borderSubtle}>
            {"─".repeat(60)}
          </text>
        </box>

        {/* Prompt line */}
        <box flexDirection="row" height={1} justifyContent="space-between">
          <box flexDirection="row" flexGrow={1}>
            {/* Prompt symbol */}
            <text fg={symbolColor()}>{promptSymbol()} </text>

            {/* Placeholder text (when not focused) */}
            <Show when={!showInput()}>
              <text fg={themeCtx.theme.textMuted}>{placeholder()}</text>
            </Show>

            {/* Input (always shown when focused) */}
            <Show when={showInput()}>
              <input
                value={input()}
                placeholder={isInteractive() ? typingText() : placeholder()}
                placeholderColor={themeCtx.theme.textMuted}
                onInput={isInteractive() ? setInput : () => {}}
                onKeyDown={isInteractive() ? handleKeyDown : () => {}}
                onPaste={handlePaste}
                focused={!showConfirm()}
                flexGrow={1}
                backgroundColor={themeCtx.theme.background}
                focusedBackgroundColor={themeCtx.theme.background}
                textColor={themeCtx.theme.text}
                focusedTextColor={themeCtx.theme.text}
                cursorColor={isInteractive() ? themeCtx.theme.primary : themeCtx.theme.textMuted}
              />
            </Show>
          </box>

          {/* Hint */}
          <Show when={hint()}>
            <text fg={themeCtx.theme.textMuted}> {hint()}</text>
          </Show>
        </box>
      </box>

      {/* Confirmation modal for chained prompts */}
      <Show when={showConfirm()}>
        <ChainConfirmModal
          stepIndex={nextStepInfo().index}
          stepName={nextStepInfo().name}
          stepDescription={nextStepInfo().description}
          totalSteps={nextStepInfo().total}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      </Show>
    </>
  )
}
