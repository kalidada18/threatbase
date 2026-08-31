import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { EASE_EXPO } from './primitives'

interface SectionHeadingProps {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: string
  align?: 'left' | 'center'
  className?: string
  /** Optional right-side slot (e.g. the "Synced" chip on the Stats section). */
  aside?: ReactNode
}

/**
 * Single source of truth for the landing-page h2 pattern that was previously
 * copy-pasted across HowItWorks/Stats/Feeds/Analytics. Optional eyebrow chip,
 * consistent type scale, one reveal animation.
 */
export function SectionHeading({ title, subtitle, eyebrow, align = 'left', className = '', aside }: SectionHeadingProps) {
  const centered = align === 'center'
  return (
    <motion.div
      className={`mb-12 ${centered ? 'text-center mx-auto' : aside ? '' : 'max-w-2xl'} ${className}`}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, ease: EASE_EXPO }}
    >
      <div className={aside ? 'flex flex-col md:flex-row md:items-end justify-between gap-5' : ''}>
        <div className={aside && !centered ? 'max-w-2xl' : ''}>
          {eyebrow && <div className="eyebrow mb-4">{eyebrow}</div>}
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">{title}</h2>
          {subtitle && (
            <p className={`mt-3 md:mt-4 text-slate-400 text-base md:text-lg font-medium leading-relaxed ${centered ? 'max-w-xl mx-auto' : ''}`}>
              {subtitle}
            </p>
          )}
        </div>
        {aside}
      </div>
    </motion.div>
  )
}
