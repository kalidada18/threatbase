import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

interface TypewriterProps {
  text: string
  /** ms per character. */
  speed?: number
  /** Pause before typing starts, ms. */
  startDelay?: number
  className?: string
  cursorClassName?: string
}

/**
 * Terminal-style typewriter with a blinking block cursor. Under reduced
 * motion the full text renders statically with a non-blinking cursor.
 * Starts when mounted (pages place it inside their scroll-reveal wrappers).
 */
export function Typewriter({ text, speed = 45, startDelay = 400, className, cursorClassName = 'bg-red-500' }: TypewriterProps) {
  const reduceMotion = useReducedMotion()
  const [count, setCount] = useState(reduceMotion ? text.length : 0)
  const done = count >= text.length

  useEffect(() => {
    if (reduceMotion) return
    let i = 0
    let interval: ReturnType<typeof setInterval> | undefined
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        i += 1
        setCount(i)
        if (i >= text.length && interval) clearInterval(interval)
      }, speed)
    }, startDelay)
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval) }
  }, [text, speed, startDelay, reduceMotion])

  return (
    <span className={className}>
      <span>{text.slice(0, count)}</span>
      <span
        aria-hidden
        className={`ml-0.5 inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] ${cursorClassName} ${done && !reduceMotion ? 'animate-blink' : ''} motion-reduce:animate-none`}
      />
      <span className="sr-only">{text}</span>
    </span>
  )
}
