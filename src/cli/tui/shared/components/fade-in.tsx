/** @jsxImportSource @opentui/solid */
import { createSignal, onMount, onCleanup, JSX } from "solid-js"

interface FadeInProps {
  children: JSX.Element
  delay?: number
  duration?: number
}

/**
 * FadeIn component - shows children after a delay.
 * Note: @opentui doesn't support opacity on boxes, so this uses
 * the `visible` property to create a delayed appearance effect.
 */
export function FadeIn(props: FadeInProps) {
  const [visible, setVisible] = createSignal(false)
  const delay = props.delay ?? 0

  onMount(() => {
    // Show content after the delay
    const timer = setTimeout(() => {
      setVisible(true)
    }, delay)

    onCleanup(() => clearTimeout(timer))
  })

  return <box visible={visible()} flexGrow={1}>{props.children}</box>
}
