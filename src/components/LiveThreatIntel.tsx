import React, { useEffect, useState } from 'react'
import { getBaseUrl, fmt, timeAgo, DATA_RAMP } from '../utils'
import { COUNTRY_COORDS } from '../lib/countryCoords'

// Category → accent colour. The breakdown is always rendered in descending
// volume order, so colour comes from rank position in the single ordered
// DATA_RAMP rather than a per-category rainbow (tasteskill colour lock).
const rampAt = (i: number) => DATA_RAMP[Math.min(i, DATA_RAMP.length - 1)]

// Build an SVG path string for the trend sparkline.
function sparkLine(vals: number[], w: number, h: number) {
  if (vals.length < 2) return ''
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = w / (vals.length - 1)
  return vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ')
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
  const [trend, setTrend] = useState<{ delta: number; pct: number; spark: number[] } | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(getBaseUrl() + 'geo.json?_=' + Date.now())
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

    fetch(getBaseUrl() + 'stats.json?_=' + Date.now())
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

    // Daily history → real "last 24h" delta + 14-day trend sparkline.
    fetch(getBaseUrl() + 'history.json?_=' + Date.now())
      .then(r => r.json())
      .then((hist: Array<{ total_unique_ips?: number }>) => {
        if (cancelled || !Array.isArray(hist)) return
        const totals = hist.map(h => h.total_unique_ips ?? 0).filter(n => n > 0)
        if (totals.length < 2) return
        const today = totals[totals.length - 1]
        const prev = totals[totals.length - 2]
        const delta = today - prev
        const pct = prev > 0 ? (delta / prev) * 100 : 0
        setTrend({ delta, pct, spark: totals.slice(-14) })
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

  // Sparkline geometry for the trend chart.
  const SW = 104, SH = 30
  const sparkD = trend ? sparkLine(trend.spark, SW, SH) : ''
  const sparkLastY = trend && trend.spark.length > 1
    ? (() => {
      const v = trend.spark
      const min = Math.min(...v), max = Math.max(...v)
      const span = max - min || 1
      return SH - ((v[v.length - 1] - min) / span) * SH
    })()
    : 0

  if (!stats) return null

  return (
    <div className="relative w-full max-w-md mx-auto flex flex-col rounded-2xl border border-white/[0.07] bg-[#0a0e17]/75 backdrop-blur-2xl shadow-glass-lux">
      {/* Platinum top hairline + faint ruby corner glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-platinum-300/25 to-transparent" />
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />

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
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[28px] font-bold leading-none tracking-tight text-white tabular-nums drop-shadow-[0_2px_10px_rgba(207,23,51,0.18)]">
              {fmt(stats.total)}
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
          {trend && sparkD && (
            <div className="flex flex-col items-end">
              <svg viewBox={`0 0 ${SW} ${SH}`} className="h-[30px] w-[104px] overflow-visible" aria-hidden="true">
                <defs>
                  <linearGradient id="tb-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#cf1733" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#cf1733" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${sparkD} L${SW} ${SH} L0 ${SH} Z`} fill="url(#tb-spark)" />
                <path d={sparkD} fill="none" stroke="#e2566c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={SW} cy={sparkLastY} r="2.2" fill="#f0768c" />
              </svg>
              <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.18em] text-slate-600">14-day trend</span>
            </div>
          )}
        </div>

        {/* Attack-type breakdown bar + legend */}
        {breakdown && (
          <>
            <div className="mt-3.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/[0.05]">
              {breakdown.entries.map(([cat, n], i) => (
                <span
                  key={cat}
                  title={`${cat} · ${((n / breakdown.sum) * 100).toFixed(1)}%`}
                  style={{ width: `${(n / breakdown.sum) * 100}%`, backgroundColor: rampAt(i) }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {breakdown.entries.slice(0, 3).map(([cat, n], i) => (
                <span key={cat} className="flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rampAt(i) }} />
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
        <div className="flex flex-col space-y-3.5">
          {topAttackers.map((a) => (
            <div key={a.cc} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flag cc={a.cc} />
                  <span className="text-[11px] font-medium text-slate-200">{a.name}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-slate-400">{Math.round(a.pct)} %</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/[0.05]">
                <div className="h-full bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] transition-all duration-1000" style={{ width: `${Math.max(2, a.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
