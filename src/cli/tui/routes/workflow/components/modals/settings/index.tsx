/** @jsxImportSource @opentui/solid */
/**
 * Settings Modal
 *
 * Allows user to select engine presets and configure fallback behavior.
 */

import { createSignal, For } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/shared/context/theme"
import { ModalBase, ModalHeader, ModalFooter } from "@tui/shared/components/modal"

export interface SettingsModalProps {
  currentPreset: string | null
  fallbackEnabled: boolean
  onSelect: (preset: string | null) => void
  onFallbackToggle: (enabled: boolean) => void
  onClose: () => void
}

interface PresetOption {
  value: string | null
  label: string
  description: string
}

const PRESET_OPTIONS: PresetOption[] = [
  { value: null, label: "Default", description: "Use step-level engine settings" },
  { value: "all-claude", label: "All Claude", description: "Opus (complex) / Sonnet (standard) / Haiku (simple)" },
  { value: "all-gemini", label: "All Gemini", description: "Pro (complex/standard) / Flash (simple)" },
  { value: "all-codex", label: "All Codex", description: "GPT-4o (complex/standard) / GPT-4o-mini (simple)" },
  { value: "all-cursor", label: "All Cursor", description: "Claude 3.5 Sonnet for all tiers" },
]

// Total menu items: presets + 1 for fallback toggle
const TOTAL_ITEMS = PRESET_OPTIONS.length + 1
const FALLBACK_INDEX = PRESET_OPTIONS.length

export function SettingsModal(props: SettingsModalProps) {
  const themeCtx = useTheme()
  const dimensions = useTerminalDimensions()

  // Find current selection index
  const initialIndex = PRESET_OPTIONS.findIndex(opt => opt.value === props.currentPreset)
  const [selectedIndex, setSelectedIndex] = createSignal(initialIndex >= 0 ? initialIndex : 0)

  const modalWidth = () => {
    const safeWidth = Math.max(50, (dimensions()?.width ?? 80) - 8)
    return Math.min(safeWidth, 70)
  }

  useKeyboard((evt) => {
    if (evt.name === "up") {
      evt.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : TOTAL_ITEMS - 1))
      return
    }

    if (evt.name === "down") {
      evt.preventDefault()
      setSelectedIndex((prev) => (prev < TOTAL_ITEMS - 1 ? prev + 1 : 0))
      return
    }

    if (evt.name === "return") {
      evt.preventDefault()
      const idx = selectedIndex()
      if (idx === FALLBACK_INDEX) {
        // Toggle fallback
        props.onFallbackToggle(!props.fallbackEnabled)
      } else {
        // Select preset
        const option = PRESET_OPTIONS[idx]
        props.onSelect(option.value)
      }
      return
    }

    if (evt.name === "escape") {
      evt.preventDefault()
      props.onClose()
      return
    }
  })

  return (
    <ModalBase width={modalWidth()}>
      <ModalHeader title="Engine Settings" icon="*" iconColor={themeCtx.theme.primary} />
      <box paddingLeft={2} paddingRight={2} paddingTop={1}>
        <text fg={themeCtx.theme.textMuted}>Select engine preset:</text>
      </box>
      <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
        <For each={PRESET_OPTIONS}>
          {(option, index) => {
            const isSelected = () => index() === selectedIndex()
            const isCurrent = () => option.value === props.currentPreset

            return (
              <box flexDirection="row" paddingTop={index() > 0 ? 0 : 0}>
                <box width={3}>
                  <text fg={isSelected() ? themeCtx.theme.primary : themeCtx.theme.textMuted}>
                    {isCurrent() ? "* " : isSelected() ? "> " : "  "}
                  </text>
                </box>
                <box flexDirection="column" flexGrow={1}>
                  <text fg={isSelected() ? themeCtx.theme.primary : themeCtx.theme.text}>
                    {option.label}
                  </text>
                  <text fg={themeCtx.theme.textMuted}>
                    {option.description}
                  </text>
                </box>
              </box>
            )
          }}
        </For>
      </box>

      {/* Divider */}
      <box paddingLeft={2} paddingRight={2}>
        <text fg={themeCtx.theme.borderSubtle}>{"─".repeat(modalWidth() - 4)}</text>
      </box>

      {/* Fallback Toggle */}
      <box paddingLeft={2} paddingRight={2} paddingTop={1}>
        <text fg={themeCtx.theme.textMuted}>Rate limit behavior:</text>
      </box>
      <box flexDirection="row" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
        <box width={3}>
          <text fg={selectedIndex() === FALLBACK_INDEX ? themeCtx.theme.primary : themeCtx.theme.textMuted}>
            {selectedIndex() === FALLBACK_INDEX ? "> " : "  "}
          </text>
        </box>
        <box flexDirection="column" flexGrow={1}>
          <text fg={selectedIndex() === FALLBACK_INDEX ? themeCtx.theme.primary : themeCtx.theme.text}>
            Fallback: {props.fallbackEnabled ? "ON" : "OFF"}
          </text>
          <text fg={themeCtx.theme.textMuted}>
            {props.fallbackEnabled
              ? "Will try other engines if rate limited"
              : "Will wait for rate limit reset (no engine switch)"}
          </text>
        </box>
      </box>

      <ModalFooter shortcuts="[Up/Down] Navigate  [Enter] Select/Toggle  [Esc] Cancel" />
    </ModalBase>
  )
}
