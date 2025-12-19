/** @jsxImportSource @opentui/solid */
/**
 * Settings Modal
 *
 * Allows user to select engine presets.
 */

import { createSignal, For } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/shared/context/theme"
import { ModalBase, ModalHeader, ModalFooter } from "@tui/shared/components/modal"

export interface SettingsModalProps {
  currentPreset: string | null
  onSelect: (preset: string | null) => void
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

export function SettingsModal(props: SettingsModalProps) {
  const themeCtx = useTheme()
  const dimensions = useTerminalDimensions()

  // Find current selection index
  const initialIndex = PRESET_OPTIONS.findIndex(opt => opt.value === props.currentPreset)
  const [selectedIndex, setSelectedIndex] = createSignal(initialIndex >= 0 ? initialIndex : 0)

  const modalWidth = () => {
    const safeWidth = Math.max(50, (dimensions()?.width ?? 80) - 8)
    return Math.min(safeWidth, 65)
  }

  useKeyboard((evt) => {
    if (evt.name === "up") {
      evt.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : PRESET_OPTIONS.length - 1))
      return
    }

    if (evt.name === "down") {
      evt.preventDefault()
      setSelectedIndex((prev) => (prev < PRESET_OPTIONS.length - 1 ? prev + 1 : 0))
      return
    }

    if (evt.name === "return") {
      evt.preventDefault()
      const option = PRESET_OPTIONS[selectedIndex()]
      props.onSelect(option.value)
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
      <ModalFooter shortcuts="[Up/Down] Navigate  [Enter] Select  [Esc] Cancel" />
    </ModalBase>
  )
}
