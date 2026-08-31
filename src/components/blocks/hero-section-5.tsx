import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import ThreatMap from '../ThreatMap'
import { ChevronRight, Search } from 'lucide-react'
import { Magnetic } from '../motion/Magnetic'
import { EASE_EXPO } from '../motion/primitives'

/** Per-word mask reveal — words rise out of an overflow-hidden line box. */
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
            {w}{i < text.split(' ').length - 1 ? '\u00A0' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

export function HeroSection({ scanInput, setScanInput, handleScan }: any) {
  // Scroll-linked parallax: the copy drifts up and away as you scroll past
  // the hero — depth instead of a hard section cut.
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -70])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])

  return (
    <div ref={heroRef} className="relative overflow-hidden w-full min-h-[100dvh] bg-app flex items-center">
      <ThreatMap />
      <div className="absolute inset-0 bg-gradient-to-b from-[#080b12]/10 via-[#080b12]/30 to-[#080b12] pointer-events-none z-0" />

      {/* pointer-events-none lets drag/hover pass through to the map
          canvas behind it; interactive controls below re-enable events. */}
      <motion.section
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 w-full pt-24 pb-20 lg:pb-28 pointer-events-none"
      >
        <div className="relative mx-auto flex max-w-7xl flex-col px-6 lg:px-12">
          {/* Fully left-aligned — DESIGN_VARIANCE=8 means no centering */}
          <div className="max-w-2xl lg:max-w-3xl text-left">
            <h1 className="text-balance font-display text-[2.6rem] leading-[1.04] sm:text-5xl md:text-6xl xl:text-7xl font-bold tracking-tight text-white">
              <RevealWords text="Built for defenders." delay={0.15} />
              <span className="block text-red-500">
                <RevealWords text="Powered by open intelligence." delay={0.45} />
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.75, ease: EASE_EXPO }}
              className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-slate-300/90"
            >
              Scan IPs, domains, and hashes against millions of live IOCs. Deploy blocklists instantly.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.9, ease: EASE_EXPO }}
              className="mt-9 flex flex-col items-start gap-3.5 sm:flex-row w-full"
            >
              <div className="relative w-full max-w-md flex items-center group/search pointer-events-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={18} />
                <input
                  type="text"
                  aria-label="Scan an IP, domain, URL, or hash"
                  placeholder="Scan IP, domain, URL, or hash…"
                  className="hero-scan-input h-14 w-full rounded-full border border-white/10 bg-slate-950/70 backdrop-blur-xl pl-12 pr-[6.5rem] text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-red-500/50 focus-visible:ring-2 focus-visible:ring-red-500/30 transition-all shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]"
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
                  className="absolute right-1.5 top-1.5 bottom-1.5 inline-flex items-center justify-center rounded-full px-6 sm:px-7 bg-red-500 hover:bg-red-400 text-white text-sm font-semibold shadow-glow-red transition-all duration-200 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 hover:shadow-[0_0_28px_rgba(207,23,51,0.55)]"
                  onClick={handleScan}
                >
                  Scan
                </button>
              </div>
              <Magnetic strength={0.25} className="pointer-events-auto">
                <a
                  href="#feeds"
                  className="inline-flex h-14 items-center justify-center rounded-full px-7 text-sm font-semibold border border-white/10 bg-white/[0.04] backdrop-blur-md text-slate-200 hover:bg-white/[0.08] hover:text-white hover:border-white/20 transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Browse feeds
                  <ChevronRight size={16} className="ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
              </Magnetic>
            </motion.div>
          </div>
        </div>
      </motion.section>
    </div>
  )
}
