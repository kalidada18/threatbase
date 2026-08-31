import { useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion'

interface TiltCardProps {
  children: ReactNode
  className?: string
  /** Max tilt in degrees. */
  max?: number
  /** Add a soft pointer-tracking glare layer. */
  glare?: boolean
  style?: CSSProperties
}

/**
 * Pointer-tracked 3D tilt. Springs keep the motion weighted; disabled on
 * touch devices and under prefers-reduced-motion (both fall through to a
 * plain wrapper).
 */
export function TiltCard({ children, className, max = 8, glare = true, style }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const [enabled] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
  const active = enabled && !reduceMotion

  const px = useMotionValue(0.5) // pointer position, 0..1 within the card
  const py = useMotionValue(0.5)
  const spring = { stiffness: 220, damping: 22, mass: 0.6 }
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), spring)
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring)
  const glareX = useTransform(px, (v) => `${v * 100}%`)
  const glareY = useTransform(py, (v) => `${v * 100}%`)
  const glareBg = useTransform(
    [glareX, glareY],
    ([x, y]: string[]) =>
      `radial-gradient(320px circle at ${x} ${y}, rgba(255,255,255,0.14), transparent 65%)`
  )
  const glareOpacity = useSpring(0, { stiffness: 200, damping: 30 })

  const onMove = (e: React.PointerEvent) => {
    if (!active || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width)
    py.set((e.clientY - rect.top) / rect.height)
    if (glare) glareOpacity.set(0.5)
  }

  const onLeave = () => {
    px.set(0.5)
    py.set(0.5)
    glareOpacity.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: active ? rotateX : 0, rotateY: active ? rotateY : 0, transformPerspective: 900, ...style }}
      className={className}
    >
      {children}
      {glare && active && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
          style={{ opacity: glareOpacity, background: glareBg }}
        />
      )}
    </motion.div>
  )
}
