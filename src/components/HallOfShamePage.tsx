import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { getBaseUrl, fmt } from '@/utils'

type Entry = {
  ip: string
  feeds: number
  score: 'HIGH' | 'MEDIUM' | 'LOW' | string
  tags: string[]
  country: string
  first_seen: string
  last_seen: string
}

const isStale = (e: Entry) => e.tags.includes('Stale')
const cleanTags = (e: Entry) => e.tags.filter((t) => t !== 'Stale')

export default function HallOfShamePage() {
  useSEO({
    title: 'Hall of Shame | Threatbase',
    description: 'The 100 worst malicious IPs on the Threatbase feed, ranked by how many independent threat sources flagged them.',
    path: '/hall-of-shame',
  })

  const reduce = useReducedMotion()
  const [ips, setIps] = useState<Entry[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(getBaseUrl() + 'top_ips.json?_=' + Date.now()).then((r) => r.json()),
      fetch(getBaseUrl() + 'stats.json?_=' + Date.now()).then((r) => r.json()).catch(() => null),
    ])
      .then(([top, stats]) => {
        if (cancelled) return
        setIps(top?.ips ?? [])
        setTotal(stats?.ips ?? null)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true }
  }, [])

  const show = (ips ?? []).slice(0, 100)
  const [podium, rest] = [show.slice(0, 3), show.slice(3)]

  return (
    <IsoPageShell color="207, 23, 51">
      {/* Header */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto text-center mb-16"
      >
        <div className="eyebrow mb-6">Hall of Shame</div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white mb-6">
          The worst <span className="text-liquid-red">100 IPs</span> on Earth.
        </h1>
        <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
          Ranked by how many independent threat sources flagged them.
          {total ? ` Drawn from ${fmt(total)} tracked indicators.` : ''}
        </p>
      </motion.div>

      {failed ? (
        <div className="max-w-md mx-auto text-center border border-red-500/20 rounded-2xl bg-red-950/20 px-8 py-10">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-red-400 mb-3">Feed unavailable</p>
          <p className="text-slate-300 mb-1">Couldn&apos;t load the ranking.</p>
          <p className="text-sm text-slate-500">The feed may be mid-update. Reload in a minute.</p>
        </div>
      ) : ips === null ? (
        /* Skeleton matching the final shape */
        <div className="w-full max-w-4xl mx-auto space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : show.length === 0 ? (
        <div className="max-w-md mx-auto text-center border border-white/[0.08] rounded-2xl bg-white/[0.02] px-8 py-10">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">Awaiting first publish</p>
          <p className="text-slate-300">The ranking hasn&apos;t been published yet.</p>
          <p className="text-sm text-slate-500 mt-1">It lands with the next feed update.</p>
        </div>
      ) : (
        <div className="w-full max-w-4xl mx-auto">
          {/* Podium: #1 dominant, #2/#3 stacked. Uneven cells, not three equal cards. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-14"
          >
            <Link to={`/?search=${podium[0].ip}`} className="group md:col-span-3 relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/60 via-slate-950/80 to-slate-950/90 p-8 transition-colors hover:border-red-500/50">
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-red-400 mb-6">Most wanted</div>
              <div className="font-mono text-3xl md:text-4xl text-white font-bold tracking-tight break-all mb-4 group-hover:text-red-100 transition-colors">
                {podium[0].ip}
              </div>
              <RankMeta e={podium[0]} />
            </Link>
            <div className="md:col-span-2 grid grid-rows-2 gap-4">
              {podium.slice(1, 3).map((e, i) => (
                <Link key={e.ip} to={`/?search=${e.ip}`} className="group glass-card glass-hover rounded-2xl p-6 flex flex-col justify-between">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">Rank {i + 2}</span>
                  </div>
                  <div>
                    <div className="font-mono text-lg md:text-xl text-white font-semibold tracking-tight break-all mb-2 group-hover:text-red-100 transition-colors">{e.ip}</div>
                    <RankMeta e={e} compact />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Ranks 4-100: dense ledger, split into two columns on desktop so it
              reads as a record, not a wall of bullets. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="glass-card px-5 md:px-8 py-2"
          >
            <ol className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10 list-none">
              {rest.map((e, i) => (
                <li key={e.ip}>
                  <Link
                    to={`/?search=${e.ip}`}
                    className="group flex items-center gap-4 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-mono text-xs text-slate-600 w-7 shrink-0 tabular-nums">{i + 4}</span>
                    <span className="font-mono text-sm text-slate-200 group-hover:text-red-200 transition-colors tracking-tight w-[135px] shrink-0">{e.ip}</span>
                    <span className="hidden sm:block font-mono text-[11px] text-slate-500 w-7 shrink-0">{e.country || '--'}</span>
                    <span className="flex-1 min-w-0 truncate text-[11px] uppercase tracking-wider text-slate-500">
                      {cleanTags(e).slice(0, 2).join(' / ') || 'Mixed'}
                    </span>
                    {isStale(e) && <span className="hidden md:inline font-mono text-[10px] uppercase text-slate-600 border border-white/10 rounded-full px-2 py-0.5 shrink-0">stale</span>}
                    <span className="font-mono text-xs text-red-400/90 tabular-nums shrink-0">{e.feeds}<span className="text-slate-600 lowercase font-sans"> feeds</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          </motion.div>

          <p className="mt-8 text-center text-sm text-slate-500">
            Click any row to run a full scan. Data updates with the feed.
          </p>
        </div>
      )}
    </IsoPageShell>
  )
}

function RankMeta({ e, compact }: { e: Entry; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs ${compact ? '' : 'text-sm'}`}>
      <span className="font-mono text-red-400 tabular-nums">{e.feeds} feeds</span>
      <span className="font-mono uppercase tracking-wider text-red-300/80">{e.score} risk</span>
      {e.country && <span className="font-mono uppercase text-slate-400">{e.country}</span>}
      <span className="text-slate-400">{cleanTags(e).slice(0, 3).join(' / ') || 'Mixed'}</span>
      <span className="font-mono text-slate-500">last seen {e.last_seen}</span>
    </div>
  )
}
