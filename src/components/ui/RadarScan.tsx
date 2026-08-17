'use client'
import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Premium scanning instrument — hexagonal-geometry scanner with concentric
 * precision rings, a rotating sweep beam, pulsing core, and cycling telemetry
 * readout lines. Dark-tech language: teal accent on deep blacks.
 *
 * Collapses to a static instrument under prefers-reduced-motion.
 */

const SCAN_PHASES = [
  'Initializing threat engine',
  'Querying intelligence feeds',
  'Cross-referencing indicators',
  'Analyzing behavioral patterns',
  'Checking reputation databases',
  'Resolving geolocation data',
  'Computing confidence score',
  'Finalizing threat assessment',
]

export default function RadarScan({ size = 220 }: { size?: number }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (reduce) return
    const iv = setInterval(() => {
      setPhase((p) => (p + 1) % SCAN_PHASES.length)
    }, 1800)
    return () => clearInterval(iv)
  }, [reduce])

  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.46

  return (
    <div
      className="relative grid place-items-center select-none"
      style={{ width: size, height: size + 60 }}
      aria-hidden="true"
    >
      {/* Ambient glow under the instrument */}
      <div
        className="absolute rounded-full blur-3xl"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          top: size * 0.15,
          left: size * 0.15,
          background: 'radial-gradient(circle, rgba(45,212,191,0.08), transparent 70%)',
        }}
      />

      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="relative z-10"
        style={{ filter: 'drop-shadow(0 0 24px rgba(45,212,191,0.08))' }}
      >
        <defs>
          {/* Sweep gradient */}
          <linearGradient id="sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(45,212,191,0)" />
            <stop offset="70%" stopColor="rgba(45,212,191,0.06)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0.35)" />
          </linearGradient>

          {/* Core orb gradient */}
          <radialGradient id="core-grad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="50%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0d9488" />
          </radialGradient>

          {/* Glow filter for the core */}
          <filter id="core-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Concentric rings — 3 layers, precision bezel */}
        {[0.96, 0.72, 0.48].map((scale, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={outerR * scale}
            fill="none"
            stroke="rgba(148,163,184,0.08)"
            strokeWidth={i === 0 ? 1.2 : 0.6}
            strokeDasharray={i === 0 ? 'none' : '3 6'}
          />
        ))}

        {/* Crosshair lines */}
        <line x1={cx} y1={cy - outerR * 0.96} x2={cx} y2={cy + outerR * 0.96} stroke="rgba(148,163,184,0.05)" strokeWidth="0.6" />
        <line x1={cx - outerR * 0.96} y1={cy} x2={cx + outerR * 0.96} y2={cy} stroke="rgba(148,163,184,0.05)" strokeWidth="0.6" />

        {/* Diagonal crosshairs */}
        <line x1={cx - outerR * 0.68} y1={cy - outerR * 0.68} x2={cx + outerR * 0.68} y2={cy + outerR * 0.68} stroke="rgba(148,163,184,0.035)" strokeWidth="0.5" />
        <line x1={cx + outerR * 0.68} y1={cy - outerR * 0.68} x2={cx - outerR * 0.68} y2={cy + outerR * 0.68} stroke="rgba(148,163,184,0.035)" strokeWidth="0.5" />

        {/* Tick marks — every 30° around the outer ring */}
        {Array.from({ length: 36 }).map((_, i) => {
          const major = i % 9 === 0
          const minor = i % 3 === 0 && !major
          const angle = (i * 10 * Math.PI) / 180
          const len = major ? 10 : minor ? 6 : 3
          const r1 = outerR * 0.96
          const r2 = r1 - len
          return (
            <line
              key={i}
              x1={cx + r1 * Math.cos(angle)}
              y1={cy + r1 * Math.sin(angle)}
              x2={cx + r2 * Math.cos(angle)}
              y2={cy + r2 * Math.sin(angle)}
              stroke={major ? 'rgba(45,212,191,0.35)' : 'rgba(148,163,184,0.12)'}
              strokeWidth={major ? 1.2 : 0.6}
              strokeLinecap="round"
            />
          )
        })}

        {/* Cardinal labels */}
        {[
          { label: 'N', angle: -90 },
          { label: 'E', angle: 0 },
          { label: 'S', angle: 90 },
          { label: 'W', angle: 180 },
        ].map(({ label, angle }) => {
          const a = (angle * Math.PI) / 180
          const r = outerR * 0.96 + 12
          return (
            <text
              key={label}
              x={cx + r * Math.cos(a)}
              y={cy + r * Math.sin(a)}
              fill="rgba(148,163,184,0.2)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {label}
            </text>
          )
        })}

        {/* Segmented progress arc — outer ring */}
        {Array.from({ length: 24 }).map((_, i) => {
          const gap = 3
          const segAngle = (360 - 24 * gap) / 24
          const startAngle = i * (segAngle + gap) - 90
          const endAngle = startAngle + segAngle
          const r = outerR * 0.96 + 3
          const active = i <= (phase / SCAN_PHASES.length) * 24
          const sa = (startAngle * Math.PI) / 180
          const ea = (endAngle * Math.PI) / 180
          const x1 = cx + r * Math.cos(sa)
          const y1 = cy + r * Math.sin(sa)
          const x2 = cx + r * Math.cos(ea)
          const y2 = cy + r * Math.sin(ea)
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={active ? 'rgba(45,212,191,0.6)' : 'rgba(148,163,184,0.06)'}
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                transition: 'stroke 0.4s ease',
              }}
            />
          )
        })}
      </svg>

      {/* Rotating sweep beam — framer-motion, on top of SVG */}
      <motion.div
        className="absolute z-20 rounded-full"
        style={{
          width: outerR * 2 * 0.96,
          height: outerR * 2 * 0.96,
          top: cy - outerR * 0.96,
          left: cx - outerR * 0.96,
          background:
            'conic-gradient(from 0deg, rgba(45,212,191,0) 0deg, rgba(45,212,191,0) 290deg, rgba(45,212,191,0.08) 330deg, rgba(45,212,191,0.32) 360deg)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 18%, #000 45%)',
          maskImage: 'radial-gradient(circle, transparent 18%, #000 45%)',
        }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={reduce ? undefined : { duration: 2.8, ease: 'linear', repeat: Infinity }}
      />

      {/* Expanding ping rings */}
      {!reduce &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute z-20 rounded-full border"
            style={{
              width: 32,
              height: 32,
              top: cy - 16,
              left: cx - 16,
              borderColor: 'rgba(45,212,191,0.35)',
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 3.2], opacity: [0, 0.45, 0] }}
            transition={{ duration: 3.4, ease: 'easeOut', repeat: Infinity, delay: i * 1.13 }}
          />
        ))}

      {/* Core orb */}
      <motion.div
        className="absolute z-30 rounded-full"
        style={{
          width: 14,
          height: 14,
          top: cy - 7,
          left: cx - 7,
          background: 'radial-gradient(circle at 35% 30%, #5eead4, #2dd4bf 50%, #0d9488)',
          boxShadow: '0 0 0 1px rgba(45,212,191,0.25), 0 0 18px 4px rgba(45,212,191,0.35)',
        }}
        animate={reduce ? undefined : { scale: [1, 1.2, 1] }}
        transition={reduce ? undefined : { duration: 2, ease: 'easeInOut', repeat: Infinity }}
      />

      {/* Telemetry readout below the scanner */}
      <div className="absolute z-30 flex flex-col items-center gap-1.5" style={{ top: size + 4, left: 0, right: 0 }}>
        <motion.span
          key={phase}
          className="font-mono text-[10px] font-medium tracking-[0.16em] uppercase text-platinum-400"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35 }}
        >
          {SCAN_PHASES[phase]}
        </motion.span>
        <div className="flex gap-1">
          {SCAN_PHASES.map((_, i) => (
            <span
              key={i}
              className="h-[3px] w-3 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: i <= phase ? 'rgba(45,212,191,0.6)' : 'rgba(148,163,184,0.1)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
