import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

// Live-scan animation shown while an indicator is being checked. Reads as an
// active security sweep: crisp concentric arcs rotate around a centered brand
// node while sonar pulses emit outward. The phase line narrates the real work
// the scanner does (feeds, reputation, community reports, geo).
//
// Built from stroked SVG arcs rather than a conic-gradient so the sweep stays
// sharp and perfectly concentric at any frozen frame — a spinning conic just
// photographs as a smear.

const PHASES = [
  'Querying threat-intelligence feeds',
  'Weighing indicator reputation',
  'Cross-referencing community reports',
  'Resolving network & geolocation',
]

/** Emitting sonar ring — scales out from the centre and fades. */
function Ping({ delay }: { delay: number }) {
  return (
    <motion.span
      className="absolute inset-0 rounded-full border border-primary/40"
      initial={{ scale: 0.55, opacity: 0.6 }}
      animate={{ scale: 1.15, opacity: 0 }}
      transition={{ duration: 2.4, ease: 'easeOut', repeat: Infinity, delay }}
    />
  )
}

export default function ScanPulse({ ip }: { ip: string }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1000)
    return () => clearInterval(id)
  }, [reduce])

  const spin = (duration: number, dir: 1 | -1 = 1) =>
    reduce
      ? undefined
      : { rotate: 360 * dir, transition: { duration, ease: 'linear' as const, repeat: Infinity } }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-7 select-none">
      {/* Radar emblem — everything shares one centre */}
      <div className="relative flex h-44 w-44 items-center justify-center shrink-0">
        {/* Ambient glow */}
        <div className="absolute inset-4 rounded-full bg-primary/10 blur-2xl" />

        {/* Emitting sonar pulses */}
        {!reduce && (
          <>
            <Ping delay={0} />
            <Ping delay={0.8} />
            <Ping delay={1.6} />
          </>
        )}

        {/* Static range rings */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="19" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        </svg>

        {/* Outer sweep arc (clockwise). Rotating the whole svg is safe: the only
            asymmetric element is the arc, so the track circle spins invisibly. */}
        <motion.svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" animate={spin(3)}>
          <circle
            cx="50" cy="50" r="47" fill="none"
            stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray="70 225" opacity="0.9"
          />
        </motion.svg>

        {/* Inner sweep arc (counter-clockwise, faster) for depth */}
        <motion.svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" animate={spin(2.2, -1)}>
          <circle
            cx="50" cy="50" r="33" fill="none"
            stroke="hsl(var(--primary))" strokeWidth="1" strokeLinecap="round"
            strokeDasharray="34 173" opacity="0.55"
          />
        </motion.svg>

        {/* Breathing brand node — dead centre via flex, so it can never drift */}
        <motion.div
          className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-slate-900 shadow-glow-ruby"
          animate={reduce ? undefined : { scale: [1, 1.07, 1] }}
          transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
        >
          <img
            src={`${import.meta.env.BASE_URL}img/logo.png`}
            className="h-8 w-8 rounded-full"
            alt=""
            aria-hidden="true"
          />
        </motion.div>
      </div>

      {/* Indicator under scan — quiet mono pill with a scan-line shimmer sweeping
          across it. break-all so a long IPv6 / URL / hash wraps inside the pill. */}
      <div className="relative flex max-w-full items-center overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950/60 px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <span className="break-all text-center font-mono text-sm tracking-tight text-platinum-200 sm:text-[0.95rem]">
          {ip}
        </span>
        {!reduce && (
          <motion.div
            className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
            initial={{ x: '-150%' }}
            animate={{ x: '450%' }}
            transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.4 }}
          />
        )}
      </div>

      {/* Live phase readout */}
      <div className="flex min-h-[1.25rem] items-center justify-center gap-2.5 px-2 text-center text-[13px] font-medium text-platinum-400">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {!reduce && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        {reduce ? (
          <span>Analyzing indicator…</span>
        ) : (
          <AnimatePresence mode="wait">
            <motion.span
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {PHASES[phase]}…
            </motion.span>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
