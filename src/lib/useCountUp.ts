import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Count up to a target, easing out. Jumps straight to the value when the user
 * prefers reduced motion. Extracted from Stats.tsx so the hero intel card and
 * secondary pages can reuse the exact same motion feel.
 */
export function useCountUp(target: number | null, duration = 1700) {
  const reduceMotion = useReducedMotion()
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null) return
    if (reduceMotion) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 4)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduceMotion])
  return value
}
