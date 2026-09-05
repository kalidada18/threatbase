import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Route-change wrapper: fade + slight rise on a light spring. Springs are
 * frame-rate adaptive, so it settles identically smooth at 60 or 120 fps.
 * (The old per-frame full-page blur was dropped: animating a filter
 * re-rasterizes the whole viewport every frame — the one real jank source
 * here.) Short tweened exit keeps lazy chunk swaps feeling instant.
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { type: 'spring', stiffness: 280, damping: 30, mass: 0.8 }
      }
    >
      {children}
    </motion.div>
  )
}
