import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { getBaseUrl } from '@/utils'

type Campaign = { title: string; url: string; modified: string; last_24h: boolean }
type Actor = {
  name: string
  aka: string[]
  sponsor: string
  pulses_24h: number
  pulses_7d: number
  campaigns: Campaign[]
}

export default function TopAptPage() {
  useSEO({
    title: 'Top APT Attackers | Threatbase',
    description: 'The most active APT groups right now, ranked by campaign reports published in the last 24 hours or 7 days, with sources.',
    path: '/top-apt',
  })

  const reduce = useReducedMotion()
  const [actors, setActors] = useState<Actor[] | null>(null)
  const [updated, setUpdated] = useState('')
  const [failed, setFailed] = useState(false)
  const [window_, setWindow] = useState<'24h' | '7d'>('24h')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(getBaseUrl() + 'top_apt.json?_=' + Date.now())
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setActors(d?.actors ?? [])
        setUpdated(d?.generated_at ?? '')
      })
      .catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true }
  }, [])

  const count = (a: Actor) => (window_ === '24h' ? a.pulses_24h : a.pulses_7d)
  const show = useMemo(() => {
    const key = window_ === '24h' ? 'pulses_24h' : 'pulses_7d'
    const other = window_ === '24h' ? 'pulses_7d' : 'pulses_24h'
    return (actors ?? [])
      .filter((a) => a[key] > 0)
      .sort((a, b) => b[key] - a[key] || b[other] - a[other])
  }, [actors, window_])
  const max = show.length ? count(show[0]) : 1
  const totalReports = (actors ?? []).reduce((s, a) => s + count(a), 0)
  const first = show[0]

  return (
    <IsoPageShell color="207, 23, 51">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto text-center mb-10"
      >
        <div className="eyebrow mb-6">APT Leaderboard</div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white mb-6">
          Who is <span className="text-liquid-red">hunting</span> right now.
        </h1>
        <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed mb-8">
          Advanced threat groups ranked by fresh campaign reports on{' '}
          <a href="https://otx.alienvault.com" target="_blank" rel="noopener noreferrer" className="text-slate-200 underline decoration-white/20 hover:decoration-white/60">AlienVault OTX</a>.
          Click a group to see the campaigns attributed to it.
        </p>

        {/* Live stat strip */}
        {actors && (
          <div className="inline-flex items-center gap-6 md:gap-8 font-mono text-xs text-slate-500">
            <span><span className="text-white text-sm tabular-nums mr-1.5">{show.length}</span>active {show.length === 1 ? 'group' : 'groups'}</span>
            <span className="w-px h-4 bg-white/10" />
            <span><span className="text-white text-sm tabular-nums mr-1.5">{totalReports}</span>campaign reports / {window_}</span>
            {updated && (
              <>
                <span className="w-px h-4 bg-white/10" />
                <span className="hidden sm:inline">updated {new Date(updated).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </>
            )}
          </div>
        )}
      </motion.div>

      {/* 24h / 7d segmented toggle */}
      <div className="flex justify-center mb-12">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(['24h', '7d'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-1.5 rounded-full transition-all ${
                window_ === w
                  ? 'bg-red-500/15 text-red-200 border border-red-500/40 shadow-[0_0_18px_-6px_rgba(207,23,51,0.6)]'
                  : 'border border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              last {w}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <div className="max-w-md mx-auto text-center border border-red-500/20 rounded-2xl bg-red-950/20 px-8 py-10">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-red-400 mb-3">Feed unavailable</p>
          <p className="text-slate-300 mb-1">Couldn&apos;t load the leaderboard.</p>
          <p className="text-sm text-slate-500">The feed may be mid-update. Reload in a minute.</p>
        </div>
      ) : actors === null ? (
        <div className="w-full max-w-4xl mx-auto space-y-3">
          <div className="h-64 rounded-2xl bg-white/[0.04] animate-pulse mb-4" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : show.length === 0 ? (
        <div className="max-w-md mx-auto text-center border border-white/[0.08] rounded-2xl bg-white/[0.02] px-8 py-10">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">Quiet{window_ === '24h' ? ' today' : ''}</p>
          <p className="text-slate-300">
            {window_ === '24h' ? 'No tracked APT group has a campaign report from the last 24 hours.' : 'No tracked APT group has an active campaign report.'}
          </p>
          {window_ === '24h' && (
            <button onClick={() => setWindow('7d')} className="mt-4 text-sm text-red-300 underline decoration-red-500/30 hover:decoration-red-400">
              View the 7-day window instead
            </button>
          )}
        </div>
      ) : (
        <div className="w-full max-w-4xl mx-auto">
          {/* Podium #1 */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl mb-10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-950/70 via-slate-950/90 to-slate-950" />
            <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
            <div className="relative p-8 md:p-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-start">
              <div className="min-w-0">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-red-400 mb-5">
                  Most active · this {window_}
                </div>
                <h2 className="font-extrabold tracking-tighter text-white text-4xl md:text-5xl mb-3 break-words">{first.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-red-200/90 border border-red-500/30 bg-red-500/10 rounded-full px-3 py-1">
                    {first.sponsor}
                  </span>
                  {first.aka.slice(0, 4).map((a) => (
                    <span key={a} className="font-mono text-[11px] text-slate-400 border border-white/10 rounded-full px-3 py-1">{a}</span>
                  ))}
                </div>
                <ul className="space-y-2.5">
                  {first.campaigns.slice(0, 5).map((c) => (
                    <li key={c.url} className="flex items-baseline gap-3 min-w-0">
                      <span className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${c.last_24h ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]' : 'bg-slate-600'}`} />
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-sm text-slate-300 hover:text-red-100 transition-colors hover:underline decoration-red-500/30 truncate">
                        {c.title}
                      </a>
                      <span className="font-mono text-[10px] text-slate-600 shrink-0 tabular-nums">{c.modified.slice(5, 10)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex md:flex-col gap-8 md:gap-6 md:text-right">
                <div>
                  <div className="font-mono text-5xl md:text-6xl font-bold text-white tabular-nums leading-none">{first.pulses_24h}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-2">24h reports</div>
                </div>
                <div>
                  <div className="font-mono text-3xl text-red-300/90 tabular-nums leading-none">{first.pulses_7d}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-2">7d reports</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* The board */}
          <motion.ol
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="glass-card px-5 md:px-8 py-2 list-none"
          >
            {show.slice(1).map((a, i) => {
              const isOpen = open === a.name
              const n = count(a)
              return (
                <li key={a.name} className="border-b border-white/[0.04] last:border-b-0">
                  <button
                    onClick={() => setOpen(isOpen ? null : a.name)}
                    aria-expanded={isOpen}
                    className="group w-full flex items-center gap-4 py-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className={`font-mono text-xs w-7 shrink-0 tabular-nums ${i < 2 ? 'text-red-400/80' : 'text-slate-600'}`}>{i + 2}</span>
                    <span className="font-mono text-sm text-slate-100 group-hover:text-red-200 transition-colors tracking-tight w-40 shrink-0 truncate">{a.name}</span>
                    <span className="hidden md:block font-mono text-[11px] uppercase text-slate-500 w-36 shrink-0 truncate">{a.sponsor}</span>
                    {/* activity bar */}
                    <span className="flex-1 min-w-0 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
                      <span className="block h-full rounded-full bg-gradient-to-r from-red-600/80 to-red-400/60 transition-all duration-500" style={{ width: `${Math.max(8, (n / max) * 100)}%` }} />
                    </span>
                    {a.pulses_24h > 0 && window_ !== '24h' && (
                      <span className="hidden sm:inline font-mono text-[10px] uppercase text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 shrink-0">24h +{a.pulses_24h}</span>
                    )}
                    <span className="font-mono text-xs text-red-400/90 tabular-nums shrink-0 w-24 text-right">
                      {n}<span className="text-slate-600 lowercase font-sans"> reports</span>
                    </span>
                    <span className={`font-mono text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {isOpen && (
                    <motion.ul
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden pb-4"
                    >
                      <li className="list-none pl-11 pr-4 space-y-0.5">
                        <ul className="border-l border-red-500/20 pl-5 space-y-2.5 -ml-px">
                          <li className="flex items-baseline gap-3 text-sm">
                            <span className="font-mono text-[10px] text-slate-600 shrink-0 tabular-nums w-10">{a.campaigns[0]?.modified.slice(5, 10)}</span>
                            <span className="text-slate-400 text-xs">aka {a.aka.join(', ') || '—'} · {a.sponsor}</span>
                          </li>
                          {a.campaigns.map((c) => (
                            <li key={c.url} className="flex items-baseline gap-3 text-sm">
                              <span className="font-mono text-[10px] text-slate-600 shrink-0 tabular-nums w-10">{c.modified.slice(5, 10)}</span>
                              <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-slate-300 hover:text-red-200 hover:underline decoration-red-500/30 transition-colors">
                                {c.title}
                              </a>
                              {c.last_24h && <span className="font-mono text-[10px] uppercase text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 shrink-0">new</span>}
                            </li>
                          ))}
                        </ul>
                      </li>
                    </motion.ul>
                  )}
                </li>
              )
            })}
          </motion.ol>

          <p className="mt-8 text-center text-sm text-slate-500">
            Campaign reports are vendor &amp; community intelligence — every row links to its source.
          </p>
        </div>
      )}
    </IsoPageShell>
  )
}
