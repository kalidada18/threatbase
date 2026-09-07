import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import { getBaseUrl, fmt, timeAgo, feedPath } from '../utils'

/**
 * Source health: reads ioc/data/feed_health.json (written by the pipeline on every
 * run) and shows which upstream feeds are still producing novel IOCs and which
 * have gone quiet. Status ladder mirrors the pipeline's own rule: 0 empty runs
 * = fresh, 1-2 = quiet, >=3 = stale (flagged in stats.stale_feeds too).
 */

type Entry = { name: string; last_data: string | null; last_new_count: number; consecutive_empty: number }

const STATUS = {
  fresh: { label: 'Fresh', color: '#34d399', cls: 'text-emerald-400', dot: 'bg-emerald-400' },
  quiet: { label: 'Quiet', color: '#fbbf24', cls: 'text-amber-400', dot: 'bg-amber-400' },
  stale: { label: 'Stale', color: '#f87171', cls: 'text-red-400', dot: 'bg-red-400' },
} as const

const statusOf = (e: Entry) => (e.consecutive_empty === 0 ? STATUS.fresh : e.consecutive_empty < 3 ? STATUS.quiet : STATUS.stale)

// Chart lives in its own lazy chunk so recharts stays out of the eager route
// bundle (Suspense boundary at the usage site, height-matched fallback).
const FeedHealthChart = lazy(() => import('./blocks/feed-health-chart'))

export default function FeedHealth() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(getBaseUrl() + feedPath('feed_health.json') + '?_=' + Date.now())
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then(d => {
        if (cancelled) return
        const rows = Object.entries(d || {}).map(([name, v]: [string, any]) => ({
          name,
          last_data: v?.last_data ?? null,
          last_new_count: Number(v?.last_new_count) || 0,
          consecutive_empty: Number(v?.consecutive_empty) || 0,
        }))
        setEntries(rows)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  const { chartData, counts, ranked } = useMemo(() => {
    const rows = entries ?? []
    const counts = {
      fresh: rows.filter(r => r.consecutive_empty === 0).length,
      quiet: rows.filter(r => r.consecutive_empty > 0 && r.consecutive_empty < 3).length,
      stale: rows.filter(r => r.consecutive_empty >= 3).length,
    }
    // Top producers of novel IOCs in the latest run; stale feeds sit at zero
    // by definition, so the bars are the "who is pulling its weight" view.
    const top = [...rows].sort((a, b) => b.last_new_count - a.last_new_count).slice(0, 12)
    const chartData = top.map(r => ({
      name: r.name.replace(/_/g, ' '),
      value: r.last_new_count,
      color: statusOf(r).color,
    }))
    // Ledger: problems first (stale, then quiet), then healthy by recency.
    const ranked = [...rows].sort((a, b) =>
      b.consecutive_empty - a.consecutive_empty ||
      String(b.last_data ?? '').localeCompare(String(a.last_data ?? ''))
    )
    return { chartData, counts, ranked }
  }, [entries])

  const loading = !entries && !failed
  const total = (entries?.length ?? 0)

  return (
    <Section id="health" containerClassName="relative z-10">
      <SectionHeading
        title="Source health"
        subtitle={`The ${total || 'upstream'} feeds we ingest from, and whether each one still produces novel IOCs. Measured on every pipeline run.`}
        className="mb-14"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Contribution chart */}
        <div className="glass-card p-6 lg:col-span-2 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h3 className="text-xl font-bold text-white tracking-tight">New IOCs in the latest run</h3>
              <div className="flex items-center gap-4 text-xs font-semibold tabular-nums">
                <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400" />{counts.fresh} fresh</span>
                <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2 w-2 rounded-full bg-amber-400" />{counts.quiet} quiet</span>
                <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2 w-2 rounded-full bg-red-400" />{counts.stale} stale</span>
              </div>
            </div>
            {loading ? (
              <div className="h-72 animate-pulse rounded-xl bg-white/[0.04]" role="status" aria-label="Loading feed health data" />
            ) : failed ? (
              <p className="h-72 flex items-center justify-center text-sm font-medium text-slate-300 max-w-md mx-auto text-center">
                Feed health data is unavailable right now. It appears after the next pipeline run.
              </p>
            ) : chartData.length === 0 ? (
              <p className="h-72 flex items-center justify-center text-sm font-medium text-slate-400 max-w-md mx-auto text-center">
                No feeds produced novel IOCs in the latest run.
              </p>
            ) : (
              <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-white/[0.04]" aria-hidden="true" />}>
                <FeedHealthChart data={chartData} />
              </Suspense>
            )}
          </div>
        </div>

        {/* Ledger: all sources, problems first */}
        <div className="glass-card p-6 relative overflow-hidden flex flex-col">
          <h3 className="text-xl font-bold text-white tracking-tight mb-4">All sources</h3>
          {loading ? (
            <div className="space-y-2.5" role="status" aria-label="Loading sources">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-9 rounded-lg bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : failed || !entries ? (
            <p className="text-sm font-medium text-slate-300">Unavailable right now.</p>
          ) : (
            <div className="-mx-2 max-h-[288px] overflow-y-auto px-2">
              <ul className="divide-y divide-white/[0.05]">
                {ranked.map(e => {
                  const s = statusOf(e)
                  return (
                    <li key={e.name} className="flex items-center gap-3 py-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300" title={e.name.replace(/_/g, ' ')}>
                        {e.name.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
                        <span className="block text-[10px] font-medium text-slate-400 tabular-nums">
                          {e.last_data ? `+${fmt(e.last_new_count)} · ${timeAgo(e.last_data + 'T00:00:00Z')}` : 'no novel data'}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
