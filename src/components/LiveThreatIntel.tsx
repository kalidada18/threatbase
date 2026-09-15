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
 * Live Threat Intel — a wide instrument band, not a portrait HUD card: totals
 * and trend on the left, attacker geography on the right, real data only
 * (geo.json, stats.json, history.json). Quiet surface: one hairline border,
 * one accent, no glows, brackets, sweeps or scanlines.
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
      <div className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-[12px] text-slate-500">
        Intel feed unavailable. Data reappears on the next successful refresh.
      </div>
    )
  if (!stats) return null

  return (
    <div className="w-full rounded-xl border border-white/[0.07] bg-[#0a0e17]/60">
      {/* Header: one line, one live dot, feeds count right-aligned. */}
      <div className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3 sm:px-7">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-200">
          Live threat intel
        </h2>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-slate-500">
          {stats.feeds} feeds
          {stats.updated && <span className="hidden sm:inline"> · updated {timeAgo(stats.updated)}</span>}
        </span>
      </div>

      <div className="grid gap-x-10 gap-y-8 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:py-7">
        {/* Left: totals, trend, mix */}
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-3xl font-semibold leading-none tracking-tight text-white tabular-nums sm:text-4xl">
                <CountUp value={stats.total} />
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">active threats</div>
            </div>
            {trend && (
              <span className={`-mb-1 font-mono text-[12px] tabular-nums ${trend.delta >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {trend.delta >= 0 ? '+' : '−'}{fmt(Math.abs(trend.delta))}
                <span className="text-slate-600"> /24h</span>
              </span>
            )}
          </div>

          {geom && (
            <div className="relative mt-5">
              {hp && trend && hoverIdx !== null && trend.dates[hoverIdx] && (
                <div
                  className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-white/[0.10] bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-300"
                  style={{ left: Math.min(Math.max(hp[0], 30), SW - 30) }}
                >
                  {fmt(trend.spark[hoverIdx])} · {shortDate(trend.dates[hoverIdx])}
                </div>
              )}
              <svg
                viewBox={`0 0 ${SW} ${SH}`}
                className="h-[52px] w-full overflow-visible"
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
                    <stop offset="0%" stopColor="#cf1733" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#cf1733" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${geom.d} L${SW} ${SH} L0 ${SH} Z`} fill="url(#tb-spark)" />
                <motion.path
                  d={geom.d}
                  fill="none"
                  stroke="#cf1733"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: EASE_EXPO }}
                />
                {hp && <line x1={hp[0]} y1={0} x2={hp[0]} y2={SH} stroke="rgba(148,163,184,0.25)" strokeWidth="0.75" strokeDasharray="2 2" />}
                {hp && <circle cx={hp[0]} cy={hp[1]} r="2" fill="#f0768c" />}
                <circle cx={geom.pts[geom.pts.length - 1][0]} cy={geom.pts[geom.pts.length - 1][1]} r="2" fill="#cf1733" />
              </svg>
              <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-slate-600">
                <span>{trend!.dates[0] ? shortDate(trend!.dates[0]) : ''}</span>
                <span>{trend!.dates[trend!.dates.length - 1] ? shortDate(trend!.dates[trend!.dates.length - 1]) : ''}</span>
              </div>
            </div>
          )}

          {breakdown && (
            <div className="mt-6">
              <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-white/[0.05]">
                {breakdown.entries.map(([cat, n], i) => (
                  <span
                    key={cat}
                    title={`${cat} · ${((n / breakdown.sum) * 100).toFixed(1)}%`}
                    className="h-full"
                    style={{ width: `${(n / breakdown.sum) * 100}%`, backgroundColor: rampAt(i) }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {breakdown.entries.slice(0, 4).map(([cat, n], i) => (
                  <span key={cat} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rampAt(i) }} aria-hidden />
                    {cat}
                    <span className="font-mono text-[11px] tabular-nums text-slate-500">{((n / breakdown.sum) * 100).toFixed(0)}%</span>
                  </span>
                ))}
                {breakdown.entries.length > 4 && (
                  <span className="font-mono text-[11px] text-slate-600">+{breakdown.entries.length - 4} more</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: attacker geography, as a tight table */}
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Top origins</h3>
          {topAttackers.length === 0 ? (
            <div className="py-6 text-[12px] text-slate-500">{geoFailed ? 'Attacker data unavailable.' : 'Loading…'}</div>
          ) : (
            <ul className="mt-3">
              {topAttackers.map((a) => (
                <li key={a.cc} className="grid grid-cols-[1.5rem_minmax(0,1fr)_4rem_5rem] items-center gap-3 border-b border-white/[0.04] py-2.5 last:border-0">
                  <Flag cc={a.cc} />
                  <span className="truncate text-[13px] text-slate-200">{a.name}</span>
                  <span className="text-right">
                    <span className="font-mono text-[13px] tabular-nums text-slate-200">{Math.round(a.pct)}%</span>
                    <span className="block font-mono text-[10px] tabular-nums text-slate-600">{fmt(a.count)}</span>
                  </span>
                  <span className="h-px w-full bg-white/[0.05]" aria-hidden>
                    <span className="block h-full bg-red-500/70" style={{ width: `${Math.max(2, a.pct)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
