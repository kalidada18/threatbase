import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion'

interface SpotlightProps {
  children: ReactNode
  className?: string
  /** Radial glow size in px. */
  size?: number
  /** Glow colour (rgb triplet, e.g. "207, 23, 51"). */
  color?: string
}

/**
 * Cursor-following radial glow. Writes CSS custom properties on mousemove —
 * no React re-render, GPU-composited only. Disabled under reduced motion.
 */
export function Spotlight({ children, className = '', size = 420, color = '207, 23, 51' }: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const opacity = useMotionValue(0)
  const smooth = useSpring(opacity, { stiffness: 180, damping: 28 })

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || reduceMotion) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`)
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`)
    opacity.set(1)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => opacity.set(0)}
      className={`group/spot relative ${className}`}
    >
      {children}
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 group-hover/spot:opacity-100 transition-opacity duration-300"
          style={{
            opacity: smooth,
            background: `radial-gradient(${size}px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(${color}, 0.10), transparent 70%)`,
          }}
        />
      )}
    </motion.div>
  )
}
