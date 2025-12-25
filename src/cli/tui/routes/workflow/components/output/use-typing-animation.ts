/**
 * Typing Animation Hook
 *
 * Creates a typewriter-style animation effect for placeholder text.
 * Types forward, pauses, erases backward, pauses, then repeats.
 */

import { createSignal, createEffect, onCleanup, Accessor } from "solid-js"

interface UseTypingAnimationOptions {
  /** Text to animate */
  text: string
  /** Whether animation is active */
  isActive: Accessor<boolean>
  /** Typing speed in milliseconds per character */
  typingSpeed?: number
  /** Pause duration in milliseconds at ends */
  pauseDuration?: number
}

/**
 * Hook that provides animated typewriter text
 *
 * @example
 * const typingText = useTypingAnimation({
 *   text: "Enter to continue...",
 *   isActive: () => props.isFocused && input() === ""
 * })
 */
export function useTypingAnimation(options: UseTypingAnimationOptions): Accessor<string> {
  const {
    text,
    isActive,
    typingSpeed = 40,
    pauseDuration = 1000,
  } = options

  const [typingText, setTypingText] = createSignal("")
  const pauseCycles = Math.round(pauseDuration / typingSpeed)

  createEffect(() => {
    if (!isActive()) {
      setTypingText("")
      return
    }

    // Animation state
    let charIndex = 0
    let forward = true
    let pauseCounter = 0

    setTypingText("")

    const interval = setInterval(() => {
      if (forward) {
        if (charIndex < text.length) {
          charIndex++
          setTypingText(text.slice(0, charIndex))
        } else {
          pauseCounter++
          if (pauseCounter >= pauseCycles) {
            forward = false
            pauseCounter = 0
          }
        }
      } else {
        if (charIndex > 0) {
          charIndex--
          setTypingText(text.slice(0, charIndex))
        } else {
          pauseCounter++
          if (pauseCounter >= pauseCycles) {
            forward = true
            pauseCounter = 0
          }
        }
      }
    }, typingSpeed)

    onCleanup(() => {
      clearInterval(interval)
    })
  })

  return typingText
}
