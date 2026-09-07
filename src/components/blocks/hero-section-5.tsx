import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Search } from 'lucide-react'
import { EASE_EXPO } from '../motion/primitives'

/** Per-word mask reveal: words rise out of an overflow-hidden line box. */
function RevealWords({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.09em] -mb-[0.09em] align-bottom">
          <motion.span
            className="inline-block will-change-transform"
            initial={{ y: '112%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.75, delay: delay + i * 0.07, ease: EASE_EXPO }}
          >
            {w}{i < text.split(' ').length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

// RFC 5737 TEST-NET addresses and .test domain: reserved for examples, so
// these chips can never resolve to a real-world indicator. The hash is a
// clearly-fake 64-hex SHA-256-shaped string (label truncated for the pill).
const EXAMPLES: { value: string; label: string }[] = [
  { value: '203.0.113.45', label: '203.0.113.45' },
  { value: '198.51.100.77', label: '198.51.100.77' },
  { value: 'bad-example.test', label: 'bad-example.test' },
  {
    value: 'd4e8fc0a91b7e2f3c5d6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192',
    label: 'd4e8fc0a…e6f708192',
  },
]

/**
 * Home is a pure IOC-hunting console: the oversized scan bar is the single
 * protagonist, with "Try:" example chips beneath it. No map (that lives on
 * /threatfeed now). The result template (ReportScanner) renders directly
 * below and is scrolled into view by App's performScan.
 */
export function HeroSection({ scanInput, setScanInput, handleScan }: any) {
  // Scroll-linked parallax: the console drifts up and away as the report
  // scrolls in over it: depth instead of a hard section cut.
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -70])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])

  return (
    <div ref={heroRef} className="relative overflow-hidden w-full min-h-[100dvh] bg-app flex items-center justify-center">
      <motion.section
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 w-full pt-24 pb-20 lg:pb-28"
      >
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
          <h1 className="text-balance font-display text-4xl leading-[1.06] sm:text-5xl md:text-6xl font-bold tracking-tight text-white">
            <RevealWords text="Hunt" delay={0.15} />{' '}
            <span className="text-red-500">
              <RevealWords text="IOC." delay={0.3} />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: EASE_EXPO }}
            className="mt-4 text-sm sm:text-base text-slate-400"
          >
            Search any IP, domain, URL, or hash against the live feed.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: EASE_EXPO }}
            className="mt-10 w-full max-w-2xl"
          >
            <div className="relative w-full flex items-center group/search">
              {/* Ruby glow behind the bar on focus */}
              <div className="absolute -inset-3 rounded-[2rem] bg-red-500/10 blur-2xl opacity-0 group-focus-within/search:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={20} />
              <input
                type="text"
                aria-label="Hunt an IP, domain, URL, or hash"
                placeholder="Enter IP, domain, URL, or hash…"
                className="hero-scan-input relative h-14 md:h-16 w-full rounded-full border border-white/10 bg-slate-950/70 backdrop-blur-xl pl-12 md:pl-14 pr-28 md:pr-32 text-base text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-red-500/50 focus-visible:ring-2 focus-visible:ring-red-500/30 transition-all shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              />
              {/* Scan-line effect */}
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none opacity-0 group-focus-within/search:opacity-100 transition-opacity">
                <div className="scan-line absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent motion-reduce:hidden" />
              </div>
              <button
                id="scan-btn"
                type="button"
                className="absolute z-10 right-2 top-2 bottom-2 inline-flex items-center justify-center rounded-full px-7 sm:px-9 bg-red-500 hover:bg-red-400 text-white text-base font-semibold shadow-glow-red transition-all duration-200 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 hover:shadow-[0_0_28px_rgba(207,23,51,0.55)]"
                onClick={() => handleScan()}
              >
                Hunt
              </button>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9, ease: EASE_EXPO }}
              className="mt-6 flex flex-wrap items-center justify-center gap-2"
            >
              <span className="text-xs font-medium tracking-wide text-slate-400 mr-1">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.value}
                  type="button"
                  title={ex.value}
                  onClick={() => {
                    setScanInput(ex.value)
                    handleScan(ex.value)
                  }}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.03] px-4 font-mono text-xs text-slate-300 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                >
                  {ex.label}
                </button>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  )
}
