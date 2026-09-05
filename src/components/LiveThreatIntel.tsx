import { useEffect, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { getBaseUrl, fmt, timeAgo, DATA_RAMP, feedPath } from '../utils'
import { COUNTRY_COORDS } from '../lib/countryCoords'

// Category → accent colour. The breakdown is always rendered in descending
// volume order, so colour comes from rank position in the single ordered
// DATA_RAMP rather than a per-category rainbow (tasteskill colour lock).
const rampAt = (i: number) => DATA_RAMP[Math.min(i, DATA_RAMP.length - 1)]

const SW = 150, SH = 46, SPAD = 6
const EASE_OUT = [0.16, 1, 0.3, 1] as const

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
      ease: EASE_OUT,
      onUpdate: v => setDisplay(fmt(Math.round(v))),
    })
    return () => controls.stop()
  }, [value, reduce])
  return <>{display}</>
}

// Real country flag (flagcdn.com); hides itself if the code has no flag.
function Flag({ cc }: { cc: string }) {
  const code = cc.toLowerCase()
  return (
    <img
      src={`https://flagcdn.com/24x18/${code}.png`}
      srcSet={`https://flagcdn.com/48x36/${code}.png 2x`}
      width={16}
      height={12}
      loading="lazy"
      decoding="async"
      alt=""
      aria-hidden="true"
      className="h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-white/15"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
    />
  )
}

/**
 * Live Threat Intel panel — real feed data only: attacker geography (geo.json),
 * category mix (stats.json) and 14-day trend (history.json). This is the HUD
 * formerly overlaid on the hero threat map; the map canvas was removed, the
 * data story stayed. Fetches on mount, renders nothing until stats arrives.
 */
export default function LiveThreatIntel() {
  const [topAttackers, setTopAttackers] = useState<{cc: string, name: string, count: number, pct: number}[]>([])
  const [stats, setStats] = useState<{ total: number; cats: Record<string, number>; feeds: number; updated: string } | null>(null)
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
      .catch(() => { /* top-attackers list stays empty */ })

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
      .catch(() => { /* panel stays hidden */ })

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

  if (!stats) return null

  return (
    <div className="relative w-full max-w-md mx-auto flex flex-col rounded-2xl border border-white/[0.07] bg-[#0a0e17]/75 backdrop-blur-2xl shadow-glass-lux">
      {/* Platinum top hairline + faint ruby corner glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-platinum-300/25 to-transparent" />
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />
      {/* HUD corner brackets */}
      <span aria-hidden className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-tl border-l border-t border-platinum-300/25" />
      <span aria-hidden className="pointer-events-none absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-tr border-r border-t border-platinum-300/25" />
      <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 h-2.5 w-2.5 rounded-bl border-b border-l border-platinum-300/25" />
      <span aria-hidden className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-br border-b border-r border-platinum-300/25" />

      {/* Header */}
      <div className="relative flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(207,23,51,0.9)]" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-platinum-200">
          Live Threat Intel
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-slate-500">
          <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          {stats.feeds} FEEDS
        </span>
      </div>

      {/* Last-24h analytics strip */}
      <div className="relative border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[28px] font-bold leading-none tracking-tight text-white tabular-nums drop-shadow-[0_2px_10px_rgba(207,23,51,0.18)]">
              <CountUp value={stats.total} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[8.5px] font-semibold uppercase tracking-[0.2em] text-platinum-400">Active Threats</span>
              {trend && (
                <span className="flex items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums text-red-400">
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 stroke-current" fill="none" strokeWidth="1.7" aria-hidden="true">
                    <path d="M5 8V2.2M2.2 5 5 2.2 7.8 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {fmt(trend.delta)}
                  <span className="ml-0.5 text-slate-600">·24h</span>
                </span>
              )}
            </div>
          </div>
          {geom && (
            <div className="relative shrink-0">
              {/* Hover tooltip: real date + total from history.json */}
              {hp && trend && hoverIdx !== null && trend.dates[hoverIdx] && (
                <div
                  className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-slate-950/95 px-2 py-1 font-mono text-[9px] tabular-nums text-slate-200 shadow-lg"
                  style={{ left: Math.min(Math.max(hp[0], 28), SW - 28) }}
                >
                  {fmt(trend.spark[hoverIdx])} · {shortDate(trend.dates[hoverIdx])}
                </div>
              )}
              <svg
                viewBox={`0 0 ${SW} ${SH}`}
                className="h-[46px] w-[150px] overflow-visible"
                role="img"
                aria-label="14-day trend of total tracked threats"
                onMouseMove={(e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  const ratio = (e.clientX - box.left) / box.width
                  setHoverIdx(Math.round(ratio * (trend!.spark.length - 1)))
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
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: EASE_OUT }}
                />
                {/* Crosshair while hovering */}
                {hp && <line x1={hp[0]} y1={hp[1]} x2={hp[0]} y2={SH} stroke="rgba(205,211,222,0.25)" strokeWidth="1" strokeDasharray="2 2" />}
                {hp && <circle cx={hp[0]} cy={hp[1]} r="2.4" fill="#f0768c" />}
                {/* Live end point with a breathing halo */}
                <motion.circle
                  cx={geom.pts[geom.pts.length - 1][0]} cy={geom.pts[geom.pts.length - 1][1]}
                  fill="#cf1733"
                  initial={{ r: 2 }}
                  animate={{ r: [2, 6, 2], opacity: [0.7, 0, 0.7] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                />
                <circle cx={geom.pts[geom.pts.length - 1][0]} cy={geom.pts[geom.pts.length - 1][1]} r="2" fill="#f0768c" />
              </svg>
              <span className="mt-1 block text-right text-[8px] font-medium uppercase tracking-[0.18em] text-slate-600">
                {trend!.dates[0] ? `${shortDate(trend!.dates[0])} · ${shortDate(trend!.dates[trend!.dates.length - 1])}` : '14-day trend'}
              </span>
            </div>
          )}
        </div>

        {/* Attack-type breakdown bar + legend */}
        {breakdown && (
          <>
            <div className="mt-3.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/[0.05]">
              {breakdown.entries.map(([cat, n], i) => (
                <motion.span
                  key={cat}
                  title={`${cat} · ${((n / breakdown.sum) * 100).toFixed(1)}%`}
                  className="h-full origin-left"
                  style={{ flexBasis: `${(n / breakdown.sum) * 100}%`, backgroundColor: rampAt(i) }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: 0.15 + i * 0.05, ease: EASE_OUT }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {breakdown.entries.slice(0, 3).map(([cat, n], i) => (
                <span key={cat} className="flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rampAt(i), boxShadow: `0 0 6px ${rampAt(i)}66` }} />
                  {cat}
                  <span className="tabular-nums text-slate-500">{((n / breakdown.sum) * 100).toFixed(0)}%</span>
                </span>
              ))}
              {breakdown.entries.length > 3 && (
                <span className="text-[9px] font-medium text-slate-600">+{breakdown.entries.length - 3} more</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Top Attackers sub-header */}
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.22em] text-platinum-400">Top Attackers</span>
        {stats.updated && (
          <span className="font-mono text-[9px] tabular-nums text-slate-600">{timeAgo(stats.updated)}</span>
        )}
      </div>

      {/* Top Attackers List */}
      <div className="relative overflow-hidden px-4 pb-6 pt-2">
        {topAttackers.length === 0 && (
          <div className="py-2 text-[11px] text-slate-600">Loading top attackers…</div>
        )}
        <div className="flex flex-col space-y-1.5">
          {topAttackers.map((a, i) => (
            <motion.div
              key={a.cc}
              className="group -mx-1.5 flex flex-col gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-white/[0.03]"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.35 + i * 0.07, ease: EASE_OUT }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 font-mono text-[9px] tabular-nums text-platinum-600">{String(i + 1).padStart(2, '0')}</span>
                  <Flag cc={a.cc} />
                  <span className="text-[11px] font-medium text-slate-200 transition-colors group-hover:text-white">{a.name}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[9px] tabular-nums text-slate-600">{fmt(a.count)}</span>
                  <span className={`font-mono text-[11px] font-semibold tabular-nums ${i === 0 ? 'text-slate-100' : 'text-slate-400'}`}>{Math.round(a.pct)} %</span>
                </div>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/[0.05]">
                <motion.div
                  className="h-full origin-left rounded-full bg-gradient-to-r from-red-700 via-red-500 to-[#e2566c] shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: 0.45 + i * 0.07, ease: EASE_OUT }}
                  style={{ width: `${Math.max(2, a.pct)}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
