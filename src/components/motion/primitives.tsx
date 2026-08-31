import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Shared entrance variants — one vocabulary across the site so every section
 * reveals with the same motion feel (fade + rise + de-blur, expo ease-out).
 */
export const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE_EXPO } },
}

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

export const staggerFast: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  /** Animate once when scrolled into view (default). */
  once?: boolean
  amount?: number
  as?: 'div' | 'section' | 'li' | 'span'
}

/**
 * Scroll-into-view reveal wrapper. The single most reused motion primitive —
 * anything that just needs to fade up when it enters the viewport.
 */
export function Reveal({ children, className, delay = 0, y = 24, once = true, amount = 0.3, as = 'div' }: RevealProps) {
  const MotionTag = (motion as any)[as] ?? motion.div
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once, amount }}
      transition={{ duration: 0.6, delay, ease: EASE_EXPO }}
    >
      {children}
    </MotionTag>
  )
}
