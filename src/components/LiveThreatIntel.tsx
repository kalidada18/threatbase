import { useEffect, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { getBaseUrl, fmt, timeAgo, DATA_RAMP, feedPath, countryFlag } from '../utils'
import { COUNTRY_COORDS } from '../lib/countryCoords'
import { EASE_EXPO } from './motion/primitives'

// Category → accent colour. The breakdown is always rendered in descending
// volume order, so colour comes from rank position in the single ordered
// DATA_RAMP rather than a per-category rainbow (tasteskill colour lock).
const rampAt = (i: number) => DATA_RAMP[Math.min(i, DATA_RAMP.length - 1)]

const SW = 150, SH = 46, SPAD = 6

// Catmull-Rom → cubic bezier: a smooth curve through the daily points,
// plus the raw point coords the hover tooltip and crosshair need.
function sparkGeom(vals: number[]) {
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = SW / (vals.length - 1)
  const pts = vals.map((v, i): [number, number] => [i * step, SH - SPAD - ((v - min) / span) * (SH - 2 * SPAD)])
  if (pts.length < 2) return { d: '', pts }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return { d, pts }
}

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Total counts ease up from zero on mount; reduced-motion snaps to final.
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState('0')
  useEffect(() => {
    if (reduce || value <= 0) { setDisplay(fmt(value)); return }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE_EXPO,
      onUpdate: v => setDisplay(fmt(Math.round(v))),
    })
    return () => controls.stop()
  }, [value, reduce])
  return <>{display}</>
}

// Native flag emoji (regional-indicator pair) — zero network requests, unlike
// the old flagcdn.com images. Hides itself on codes without a flag.
function Flag({ cc }: { cc: string }) {
  const flag = countryFlag(cc)
  if (!flag) return null
  return <span aria-hidden="true" className="w-4 shrink-0 text-center text-[13px] leading-none">{flag}</span>
}

/**
 * Live Threat Intel panel — real feed data only: attacker geography (geo.json),
 * category mix (stats.json) and 14-day trend (history.json). This is the HUD
 * formerly overlaid on the hero threat map; the map canvas was removed, the
 * data story stayed. Fetches on mount, renders nothing until stats arrives.
 */
export default function LiveThreatIntel() {
  const reduce = useReducedMotion()
  const [topAttackers, setTopAttackers] = useState<{cc: string, name: string, count: number, pct: number}[]>([])
  const [stats, setStats] = useState<{ total: number; cats: Record<string, number>; feeds: number; updated: string } | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [geoFailed, setGeoFailed] = useState(false)
  const [trend, setTrend] = useState<{ delta: number; pct: number; dates: string[]; spark: number[] } | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(getBaseUrl() + feedPath('geo.json') + '?_=' + Date.now())
      .then(r => r.json())
      .then((geo: { countries?: Record<string, number> }) => {
        if (cancelled || !geo?.countries) return
        const attackersList: {cc: string, count: number}[] = []
        let total = 0
        for (const [cc, count] of Object.entries(geo.countries) as [string, number][]) {
          if (!COUNTRY_COORDS[cc] || count <= 0) continue
          total += count
          attackersList.push({ cc, count })
        }
        if (total > 0) {
          attackersList.sort((a, b) => b.count - a.count)
          setTopAttackers(attackersList.slice(0, 5).map(a => ({
            cc: a.cc,
            name: COUNTRY_COORDS[a.cc]?.name || a.cc,
            count: a.count,
            pct: (a.count / total) * 100
          })))
        }
      })
      .catch(() => { if (!cancelled) setGeoFailed(true) })

    fetch(getBaseUrl() + feedPath('stats.json') + '?_=' + Date.now())
      .then(r => r.json())
      .then((data: { category_counts?: Record<string, number>; total_unique_ips?: number; active_feeds?: number; last_updated?: string }) => {
        if (cancelled || !data?.category_counts) return
        const catTotal = Object.values(data.category_counts).reduce((s, n) => s + (n > 0 ? n : 0), 0)
        setStats({
          total: data.total_unique_ips ?? catTotal,
          cats: data.category_counts,
          feeds: data.active_feeds ?? 0,
          updated: data.last_updated ?? '',
        })
      })
      .catch(() => { if (!cancelled) setStatsFailed(true) })

    // Daily history → real "last 24h" delta + 14-day trend with dates.
    fetch(getBaseUrl() + feedPath('history.json') + '?_=' + Date.now())
      .then(r => r.json())
      .then((hist: Array<{ date?: string; total_unique_ips?: number }>) => {
        if (cancelled || !Array.isArray(hist)) return
        const days = hist.filter(h => (h.total_unique_ips ?? 0) > 0).slice(-14)
        if (days.length < 2) return
        const totals = days.map(d => d.total_unique_ips as number)
        const delta = totals[totals.length - 1] - totals[totals.length - 2]
        const pct = totals[totals.length - 2] > 0 ? (delta / totals[totals.length - 2]) * 100 : 0
        setTrend({ delta, pct, dates: days.map(d => d.date ?? ''), spark: totals })
      })
      .catch(() => { /* no trend strip */ })

    return () => { cancelled = true }
  }, [])

  // Attack-type breakdown (real category counts), sorted desc.
  const breakdown = stats
    ? (() => {
      const entries = Object.entries(stats.cats)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
      const sum = entries.reduce((s, [, n]) => s + n, 0) || 1
      return { entries, sum }
    })()
    : null

  const geom = trend && trend.spark.length > 1 ? sparkGeom(trend.spark) : null
  const hp = geom && hoverIdx !== null && hoverIdx < geom.pts.length ? geom.pts[hoverIdx] : null

  // stats still loading → render nothing (no flash); fetch failed → say so,
  // instead of silently removing the panel forever.
  if (statsFailed)
    return (
      <div className="relative w-full max-w-md mx-auto rounded-2xl border border-white/[0.07] bg-[#0a0e17]/75 backdrop-blur-2xl px-4 py-3 text-[11px] font-medium text-slate-400">
        Intel feed unavailable. Data reappears on the next successful refresh.
      </div>
    )
  if (!stats) return null

  return (
    // p-px lit-edge frame: one continuous ruby→platinum hairline replaces the
    // flat border (judge-panel graft); inner card keeps the locked 15px radius.
    <div className="relative w-full max-w-md mx-auto rounded-2xl bg-gradient-to-br from-red-500/40 via-white/[0.08] to-platinum-300/20 p-px">
      <div className="relative flex flex-col rounded-[15px] bg-[#0a0e17]/75 backdrop-blur-2xl shadow-glass-lux overflow-hidden">
        {/* Card depth stack: radial ruby/platinum glows, masked scanlines and
            one slow sweep — all decorative layers, content children are relative. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_80%_at_50%_-12%,rgba(207,23,51,0.13),transparent_54%),radial-gradient(80%_55%_at_100%_0%,rgba(174,182,196,0.07),transparent_60%),radial-gradient(120%_75%_at_50%_115%,rgba(2,5,10,0.55),transparent_62%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-[repeating-linear-gradient(0deg,rgba(205,211,222,0.03)_0px,rgba(205,211,222,0.03)_1px,transparent_1px,transparent_3px)] [mask-image:linear-gradient(180deg,#000,transparent)]" />
        <div aria-hidden className="hud-sweep motion-reduce:hidden pointer-events-none absolute inset-x-0 top-0 h-[18%] bg-gradient-to-b from-transparent via-red-500/[0.07] to-transparent blur-[2px]" />
        {/* Platinum top hairline */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-platinum-300/25 to-transparent" />
        {/* HUD corner brackets — top pair ruby-tinted, bottom platinum */}
        <span aria-hidden className="pointer-events-none absolute left-1.5 top-1.5 z-10 h-3 w-3 rounded-tl border-l border-t border-red-500/30" />
        <span aria-hidden className="pointer-events-none absolute right-1.5 top-1.5 z-10 h-3 w-3 rounded-tr border-r border-t border-red-500/30" />
        <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 h-3 w-3 rounded-bl border-b border-l border-platinum-300/35" />
        <span aria-hidden className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 h-3 w-3 rounded-br border-b border-r border-platinum-300/35" />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(207,23,51,1),0_0_22px_rgba(207,23,51,0.45)]" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.26em] text-platinum-100">
            Live Threat Intel
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-sm border border-white/[0.07] bg-white/[0.02] px-1.5 py-[3px] font-mono text-[9px] uppercase tracking-[0.14em] tabular-nums text-slate-400">
            <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            {stats.feeds} FEEDS
          </span>
        </div>

        {/* Last-24h analytics strip */}
        <div className="relative z-10 border-b border-white/[0.06] px-4 pb-4 pt-4">
          {/* Blurred full-bleed echo of the trend curve, reusing geom.d —
              makes the number band feel like it sits inside the data. */}
          {geom && (
            <svg aria-hidden viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full opacity-[0.10] blur-[1.5px]">
              <path d={geom.d} fill="none" stroke="#cf1733" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <div className="relative flex items-start justify-between gap-3">
            <div>
              {/* isolate keeps the aura's -z-10 behind the numeral only */}
              <div className="relative isolate inline-block">
                <div className="font-mono text-[40px] font-bold leading-[0.95] tracking-[-0.03em] tabular-nums text-metal">
                  <CountUp value={stats.total} />
                </div>
                <span aria-hidden className="absolute inset-x-0 top-1/3 -z-10 h-8 rounded-full bg-red-500/20 blur-2xl" />
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-platinum-500">Active Threats</span>
                {trend && (
                  <span className={`flex items-center gap-1 rounded-full border px-2 py-[3px] font-mono text-[10px] font-semibold tabular-nums ${trend.delta >= 0 ? 'border-red-500/25 bg-red-500/[0.08] text-red-400' : 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300'}`}>
                    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 stroke-current transition-transform ${trend.delta < 0 ? 'rotate-180' : ''}`} fill="none" strokeWidth="1.7" aria-hidden="true">
                      <path d="M5 8V2.2M2.2 5 5 2.2 7.8 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {fmt(trend.delta)}
                    <span className="ml-0.5 text-slate-500">·24h</span>
                  </span>
                )}
              </div>
            </div>
            {geom && (
              <div className="relative shrink-0 self-start overflow-visible rounded-md border border-white/[0.07] bg-[#0b101a]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {/* instrument-well tick grid */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[length:37.5px_23px]" />
                {/* Hover tooltip: real date + total from history.json */}
                {hp && trend && hoverIdx !== null && trend.dates[hoverIdx] && (
                  <div
                    className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-white/[0.12] bg-slate-950/95 px-2 py-1 font-mono text-[9px] tabular-nums text-slate-200 shadow-[0_0_0_1px_rgba(207,23,51,0.08),0_8px_20px_-8px_rgba(0,0,0,0.8)]"
                    style={{ left: Math.min(Math.max(hp[0], 28), SW - 28) }}
                  >
                    {fmt(trend.spark[hoverIdx])} · {shortDate(trend.dates[hoverIdx])}
                  </div>
                )}
                <svg
                  viewBox={`0 0 ${SW} ${SH}`}
                  className="relative h-[46px] w-[150px] overflow-visible"
                  role="img"
                  aria-label="14-day trend of total tracked threats"
                  onMouseMove={(e) => {
                    const box = e.currentTarget.getBoundingClientRect()
                    const ratio = (e.clientX - box.left) / box.width
                    const idx = Math.round(ratio * (trend!.spark.length - 1))
                    // Skip the state write when the rounded index is unchanged:
                    // sub-pixel moves used to re-render the whole panel per frame.
                    if (idx !== hoverIdx) setHoverIdx(idx)
                  }}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <defs>
                    <linearGradient id="tb-spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cf1733" stopOpacity="0.40" />
                      <stop offset="100%" stopColor="#cf1733" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d={`${geom.d} L${SW} ${SH} L0 ${SH} Z`}
                    fill="url(#tb-spark)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  />
                  <motion.path
                    d={geom.d}
                    fill="none"
                    stroke="#e2566c"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, ease: EASE_EXPO }}
                  />
                  {/* Crosshair while hovering */}
                  {hp && <line x1={hp[0]} y1={hp[1]} x2={hp[0]} y2={SH} stroke="rgba(205,211,222,0.25)" strokeWidth="1" strokeDasharray="2 2" />}
                  {hp && <circle cx={hp[0]} cy={hp[1]} r="2.4" fill="#f0768c" />}
                  {/* Live end point with a breathing halo. r/opacity run on a rAF
                      loop MotionConfig cannot suppress (it only gates transform),
                      so the infinite pulse is gated on useReducedMotion here; the
                      static circle below covers the reduced case. */}
                  {!reduce && (
                    <motion.circle
                      cx={geom.pts[geom.pts.length - 1][0]} cy={geom.pts[geom.pts.length - 1][1]}
                      fill="#cf1733"
                      initial={{ r: 2 }}
                      animate={{ r: [2, 6, 2], opacity: [0.7, 0, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                    />
                  )}
                  <circle cx={geom.pts[geom.pts.length - 1][0]} cy={geom.pts[geom.pts.length - 1][1]} r="2" fill="#f0768c" />
                </svg>
                <span className="mt-0.5 block pr-1 text-right text-[7.5px] font-medium uppercase tracking-[0.2em] text-slate-500">
                  {trend!.dates[0] ? `${shortDate(trend!.dates[0])} · ${shortDate(trend!.dates[trend!.dates.length - 1])}` : '14-day trend'}
                </span>
              </div>
            )}
          </div>

          {/* Attack-type breakdown: segmented instrument strip on a metallic
              track + calibrated tick scale, replacing the thin rainbow pill. */}
          {breakdown && (
            <>
              <div className="relative mt-4 rounded-[3px] bg-white/[0.035] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-[2px]">
                  {breakdown.entries.map(([cat, n], i) => (
                    <motion.span
                      key={cat}
                      title={`${cat} · ${((n / breakdown.sum) * 100).toFixed(1)}%`}
                      className="h-full origin-left"
                      style={{ flexBasis: `${(n / breakdown.sum) * 100}%`, backgroundColor: rampAt(i), ...(i === 0 ? { boxShadow: '0 0 10px rgba(207,23,51,0.5)' } : {}) }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.7, delay: 0.15 + i * 0.05, ease: EASE_EXPO }}
                    />
                  ))}
                </div>
                <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[3px] bg-gradient-to-b from-white/[0.06] to-transparent [mask-image:linear-gradient(180deg,#000_15%,transparent_60%)]" />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[7.5px] tabular-nums text-slate-500">
                <span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {breakdown.entries.slice(0, 3).map(([cat, n], i) => (
                  <span key={cat} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rampAt(i), boxShadow: `0 0 6px ${rampAt(i)}66` }} />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">{cat}</span>
                    <span className="font-mono text-[9px] font-semibold tabular-nums text-platinum-300">{((n / breakdown.sum) * 100).toFixed(0)}%</span>
                  </span>
                ))}
                {breakdown.entries.length > 3 && (
                  <span className="font-mono text-[9px] text-slate-500">+{breakdown.entries.length - 3} more</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Top Attackers sub-header */}
        <div className="relative z-10 flex items-center justify-between px-4 pb-2 pt-3.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-platinum-500">Top Attackers</span>
          {stats.updated && (
            <span className="font-mono text-[9px] tabular-nums text-slate-500">UPDATED {timeAgo(stats.updated)}</span>
          )}
        </div>

        {/* Top Attackers List */}
        <div className="relative z-10 overflow-hidden px-4 pb-6 pt-2">
          {topAttackers.length === 0 && (
            <div className="relative z-10 py-2 text-[11px] text-slate-400">{geoFailed ? 'Attacker data unavailable.' : 'Loading top attackers…'}</div>
          )}
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {topAttackers.map((a, i) => (
              <motion.div
                key={a.cc}
                className="group -mx-2 flex flex-col gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.035]"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.35 + i * 0.07, ease: EASE_EXPO }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[8px] tabular-nums ${i === 0 ? 'border-red-500/30 bg-red-500/[0.06] text-red-400 shadow-[0_0_8px_rgba(207,23,51,0.25)]' : 'border-white/[0.08] bg-white/[0.02] text-platinum-500'}`}>{String(i + 1).padStart(2, '0')}</span>
                    <Flag cc={a.cc} />
                    <span className="text-[11.5px] font-semibold tracking-[-0.01em] text-slate-200 transition-colors group-hover:text-white">{a.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[13px] font-semibold leading-none tabular-nums text-platinum-100">
                      {Math.round(a.pct)}<span className="text-[9px] font-normal text-slate-500"> %</span>
                    </div>
                    <div className="mt-1 font-mono text-[8.5px] tabular-nums text-slate-500">{fmt(a.count)}</div>
                  </div>
                </div>
                <div className="h-[3px] w-full overflow-hidden rounded-[1px] bg-white/[0.04]">
                  <motion.div
                    className={`h-full origin-left rounded-[1px] bg-gradient-to-r from-red-700 via-red-500 to-[#e2566c] ${i === 0 ? 'shadow-[0_0_8px_rgba(239,68,68,0.6)]' : ''}`}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.7, delay: 0.45 + i * 0.07, ease: EASE_EXPO }}
                    style={{ width: `${Math.max(2, a.pct)}%`, opacity: Math.max(0.55, 1 - i * 0.15) }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
