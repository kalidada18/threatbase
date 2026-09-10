import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import { Search } from 'lucide-react'
import { EASE_EXPO } from '../motion/primitives'
import { classifyIndicator, refangIndicator } from '../../scanner'

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

// Chips are REAL feed indicators (top-coverage IPs from ioc/ip/top_ips.json,
// one hash from ioc/hash) so a first click returns the red verdict — the
// product's persuasive output, not its weakest one. 8.8.8.8 is deliberately
// kept: one known-clean scan proves the engine discriminates, which is what
// analysts check first. Staleness ceiling: these are baked; if the feed ever
// prunes one the chip turns clean — refresh alongside the feed-count PR cycle.
const EXAMPLES: { value: string; label: string }[] = [
  { value: '103.78.2.252', label: '103.78.2.252' },
  { value: '107.150.97.10', label: '107.150.97.10' },
  { value: '00000077553a5b27a610ac98f29563bbd6e0decc020c2d49e4fa0d89197e7fd8', label: '00000077553a5b27' },
  { value: '8.8.8.8', label: '8.8.8.8' },
]

// Recent hunts: console memory for the returning analyst. Written by App's
// performScan to localStorage (tb:recent) and announced via this event.
export const RECENT_EVENT = 'tb:recent'
type RecentHunt = { value: string; type: string; malicious: boolean }
const readRecent = (): RecentHunt[] => {
  try { return JSON.parse(localStorage.getItem('tb:recent') || '[]') } catch { return [] }
}

// classifyIndicator's prose types, shortened for the in-pill badge.
const BADGE_LABEL: Record<string, string> = {
  'IP Address': 'IPv4', 'IPv6 Address': 'IPv6', 'File Hash': 'HASH', 'CIDR Block': 'CIDR',
}

/**
 * Home is a pure IOC-hunting console: the oversized scan bar is the single
 * protagonist. The bar classifies what you type live (single source of truth:
 * classifyIndicator), the Hunt button IS the in-flight progress indicator,
 * and `/` / Esc / ArrowUp drive the keyboard. Example chips return real
 * verdicts; recent hunts persist for the returning analyst.
 * The result template (ReportScanner) renders directly below and is scrolled
 * into view by App's performScan.
 */
export function HeroSection({ scanInput, setScanInput, handleScan, isScanning, scanResult }: any) {
  // Scroll-linked parallax: the console drifts up and away as the report
  // scrolls in over it: depth instead of a hard section cut.
  const heroRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -70])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const reducedMotion = useReducedMotion()

  // Sonar arrival beat: ScanPulse draws the rings going OUT while scanning;
  // this is the echo coming BACK — one shot off the Hunt button the moment a
  // verdict lands, tinted by the verdict itself. No scan, no ping: every
  // pulse on this page corresponds to a real event.
  const [pulse, setPulse] = useState<{ kind: 'dirty' | 'clean'; key: number } | null>(null)
  const prevResult = useRef(scanResult)
  useEffect(() => {
    const was = prevResult.current
    prevResult.current = scanResult
    if (!was && scanResult && scanResult.type !== 'invalid') {
      setPulse((p) => ({ kind: scanResult.isMalicious ? 'dirty' : 'clean', key: (p?.key || 0) + 1 }))
    }
  }, [scanResult])
  // Reduced motion: the ring doesn't expand, so it would never self-clear —
  // hold the button border tint briefly instead.
  useEffect(() => {
    if (pulse && reducedMotion) {
      const t = setTimeout(() => setPulse((p) => (p?.key === pulse.key ? null : p)), 900)
      return () => clearTimeout(t)
    }
  }, [pulse, reducedMotion])

  // First visit of the session: surface YOUR public IP (/api/whoami echoes
  // CF-Connecting-IP back to you and you alone) as a dim placeholder, NOT a
  // typed value — it reads as quiet helper text, can't be backspaced, and
  // disappears the moment you type. An empty Hunt/Enter still scans it.
  const [hintIp, setHintIp] = useState('')
  useEffect(() => {
    if (sessionStorage.getItem('tb:ip_prefill')) return
    sessionStorage.setItem('tb:ip_prefill', '1')
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}api/whoami`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => { if (!cancelled && d?.ip) setHintIp(d.ip) })
      .catch(() => { /* offline / dev without functions: normal placeholder remains */ })
    return () => { cancelled = true }
  }, [])

  const [recent, setRecent] = useState<RecentHunt[]>(readRecent)
  useEffect(() => {
    const sync = () => setRecent(readRecent())
    window.addEventListener(RECENT_EVENT, sync)
    return () => window.removeEventListener(RECENT_EVENT, sync)
  }, [])

  // Keyboard console: / focuses, Esc clears + blurs, ArrowUp (empty input)
  // walks recent hunts. No command palette — / already does its job here.
  const recentIdx = useRef(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
      const inSearch = document.activeElement === inputRef.current
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (e.key === 'Escape' && inSearch) {
        setScanInput('')
        inputRef.current?.blur()
      } else if (e.key === 'ArrowUp' && inSearch && recent.length) {
        if (!scanInput) { e.preventDefault(); setScanInput(recent[recentIdx.current % recent.length].value); recentIdx.current += 1 }
        else if (scanInput === recent[(recentIdx.current - 1 + recent.length) % recent.length]?.value) {
          e.preventDefault(); setScanInput(recent[recentIdx.current % recent.length].value); recentIdx.current += 1
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recent, scanInput, setScanInput])

  // Live classification — pure + cheap, reuses the scanner's own parser.
  const raw = scanInput.trim()
  const cls = raw ? classifyIndicator(raw) : null
  const invalid = !!cls && cls.type === 'invalid'
  const defanged = !!cls && !invalid && refangIndicator(raw) !== raw
  const badge = invalid ? 'INVALID' : defanged ? 'DEFANGED' : (cls && (BADGE_LABEL[cls.type] || cls.type.toUpperCase()))

  return (
    <div ref={heroRef} className="relative overflow-hidden w-full min-h-[100dvh] bg-app flex items-center justify-center">
      <motion.section
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 w-full pt-24 pb-20 lg:pb-28"
      >
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 text-center">
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
            <span className="ml-2 hidden sm:inline text-slate-600" aria-hidden>Press <kbd className="font-mono border border-white/10 rounded px-1 text-[11px]">/</kbd> to search</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: EASE_EXPO }}
            className="mt-10 w-full max-w-3xl"
          >
            <div className="relative w-full flex items-center group/search">
              {/* Ruby glow behind the bar on focus */}
              <div className="absolute -inset-3 rounded-[2rem] bg-red-500/10 blur-2xl opacity-0 group-focus-within/search:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={20} />
              {/* Input right padding reserves the Hunt button AND the type badge
                  that sits at right-[8.75rem]/[9.75rem]: it must stay >= that
                  offset plus the widest badge ("DEFANGED", ~5.5rem), or a long
                  hash scrolls underneath the badge instead of clipping first. */}
              <input
                ref={inputRef}
                type="text"
                aria-label="Hunt an IP, domain, URL, or hash"
                placeholder={hintIp ? `Your IP: ${hintIp}` : 'Enter IP, domain, URL, or hash…'}
                className={`hero-scan-input relative h-14 md:h-16 w-full rounded-full border bg-slate-950/70 backdrop-blur-xl pl-12 md:pl-14 pr-[11rem] sm:pr-[14.5rem] md:pr-[15.5rem] text-base text-white placeholder:text-slate-500 focus-visible:outline-none transition-all shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] ${
                  invalid
                    ? 'border-red-500/60 focus-visible:border-red-500/60 focus-visible:ring-2 focus-visible:ring-red-500/30'
                    : 'border-white/10 focus-visible:border-red-500/50 focus-visible:ring-2 focus-visible:ring-red-500/30'
                }`}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput.trim() ? undefined : hintIp || undefined)}
              />
              {/* Live type badge — the console repeats back what it understood. */}
              <AnimatePresence mode="popLayout" initial={false}>
                {badge && (
                  <motion.span
                    key={badge}
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: EASE_EXPO }}
                    className={`absolute right-[5.5rem] sm:right-[8.75rem] md:right-[9.75rem] z-10 font-mono text-[10px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-md border pointer-events-none whitespace-nowrap ${
                      invalid ? 'text-red-400 border-red-500/30 bg-red-500/10'
                        : defanged ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                        : 'text-slate-300 border-white/10 bg-white/[0.05]'
                    }`}
                  >
                    {badge}
                  </motion.span>
                )}
              </AnimatePresence>
              {/* Scan-line effect */}
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none opacity-0 group-focus-within/search:opacity-100 transition-opacity">
                <div className="scan-line absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent motion-reduce:hidden" />
              </div>
              {/* Arrival ring — one shot, verdict-tinted. Reduced-motion users
                  get the border flash on the button instead (see below). */}
              <AnimatePresence>
                {pulse && !reducedMotion && (
                  <motion.span
                    key={pulse.key}
                    aria-hidden
                    initial={{ opacity: 0.8, scale: 0.85 }}
                    animate={{ opacity: 0, scale: 1.9 }}
                    transition={{ duration: 0.7, ease: EASE_EXPO }}
                    onAnimationComplete={() => setPulse((p) => (p?.key === pulse.key ? null : p))}
                    style={{ transformOrigin: 'calc(100% - 3.5rem) 50%' }}
                    className={`pointer-events-none absolute right-2 top-2 bottom-2 w-[8.5rem] rounded-full border-2 ${
                      pulse.kind === 'dirty' ? 'border-red-500/70' : 'border-white/25'
                    }`}
                  />
                )}
              </AnimatePresence>
              <button
                id="scan-btn"
                type="button"
                disabled={isScanning}
                aria-busy={!!isScanning}
                className={`absolute z-10 right-2 top-2 bottom-2 inline-flex items-center justify-center overflow-hidden rounded-full px-4 sm:px-9 bg-red-500 hover:bg-red-400 text-white text-base font-semibold shadow-glow-red transition-all duration-200 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 hover:shadow-[0_0_28px_rgba(207,23,51,0.55)] disabled:cursor-default disabled:hover:bg-red-500 ${
                  pulse && reducedMotion ? (pulse.kind === 'dirty' ? 'ring-2 ring-red-500/70' : 'ring-2 ring-white/30') : ''
                }`}
                onClick={() => handleScan(scanInput.trim() ? undefined : hintIp || undefined)}
              >
                {/* The button IS the progress bar: while in flight, a sweep of
                    the hero's own scan-line plays inside it (one shot, looping
                    while isScanning). No separate spinner, no cooldown toast. */}
                <AnimatePresence mode="wait" initial={false}>
                  {isScanning ? (
                    <motion.span
                      key="hunting"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: EASE_EXPO }}
                      className="relative"
                    >
                      Hunting…
                    </motion.span>
                  ) : (
                    <motion.span
                      key="hunt"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: EASE_EXPO }}
                    >
                      Hunt
                    </motion.span>
                  )}
                </AnimatePresence>
                {isScanning && (
                  <span className="absolute inset-0 pointer-events-none motion-reduce:hidden" aria-hidden>
                    <span className="scan-line absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                  </span>
                )}
              </button>
            </div>

            {recent.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                <span className="text-xs font-medium tracking-wide text-slate-500 mr-1">Recent:</span>
                {recent.map((r) => (
                  <span key={r.value} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.08]">
                    <button
                      type="button"
                      title={`${r.value} — ${r.malicious ? 'threat found' : 'clean'}`}
                      onClick={() => { setScanInput(r.value); handleScan(r.value) }}
                      className="inline-flex min-h-11 items-center gap-1.5 pl-3 pr-1 font-mono text-xs text-slate-300 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 rounded-full"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.malicious ? 'bg-red-500' : 'bg-emerald-500'}`} aria-hidden />
                      {r.value.length > 24 ? r.value.slice(0, 14) : r.value}
                    </button>
                    <button
                      type="button"
                      aria-label={`Forget ${r.value} from recent hunts`}
                      onClick={() => {
                        try { localStorage.setItem('tb:recent', JSON.stringify(readRecent().filter((x) => x.value !== r.value))) } catch {}
                        window.dispatchEvent(new Event(RECENT_EVENT))
                      }}
                      className="pr-2.5 text-slate-600 hover:text-slate-300 cursor-pointer focus-visible:outline-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9, ease: EASE_EXPO }}
              className="mt-3 flex flex-wrap items-center justify-start gap-2"
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
