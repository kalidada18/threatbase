import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { getBaseUrl, feedPath } from '@/utils'

type Campaign = { title: string; url: string; modified: string; last_24h: boolean }
type Actor = {
  name: string
  aka: string[]
  sponsor: string
  pulses_24h: number
  pulses_7d: number
  malware?: string[]
  targets?: string[]
  campaigns: Campaign[]
}

/** "2026-09-02T14:05:00" -> "2d ago" (clamped, no future drift surprises) */
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000))
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / (24 * 60))}d ago`
}

const Chip = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'red' }) => (
  <span
    className={`font-mono text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 border ${
      tone === 'red'
        ? 'text-red-200/90 border-red-500/30 bg-red-500/10'
        : 'text-slate-400 border-white/10 bg-white/[0.03]'
    }`}
  >
    {children}
  </span>
)

function StatBlock({ value, label, hero = false }: { value: number; label: string; hero?: boolean }) {
  return (
    <div>
      <div className={`font-mono font-bold text-white tabular-nums leading-none ${hero ? 'text-5xl md:text-6xl' : 'text-2xl'}`}>
        {value}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-2">{label}</div>
    </div>
  )
}

function ActivityBar({ pct }: { pct: number }) {
  return (
    <span className="block h-[3px] rounded-full bg-gradient-to-r from-red-600/80 to-red-400/50 transition-all duration-700" style={{ width: `${Math.max(6, pct)}%` }} />
  )
}

export default function TopAptPage() {
  useSEO({
    title: 'Top APT Attackers | Threatbase',
    description: 'The most active advanced threat groups right now, ranked by fresh campaign intelligence from the last 24 hours or 7 days.',
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
    fetch(getBaseUrl() + feedPath('top_apt.json') + '?_=' + Date.now())
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
  const rest = show.slice(3)
  const activeKey = window_ === '24h' ? 'pulses_24h' : 'pulses_7d'

  return (
    <IsoPageShell color="207, 23, 51">
      {/* Header */}
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
          Advanced threat groups ranked by fresh campaign intelligence, refreshed with every feed run.
        </p>
        {actors && show.length > 0 && (
          <div className="inline-flex items-center gap-5 md:gap-7 font-mono text-xs text-slate-500">
            <span><span className="text-white text-sm tabular-nums mr-1.5">{show.length}</span>active {show.length === 1 ? 'group' : 'groups'}</span>
            <span className="w-px h-4 bg-white/10" />
            <span><span className="text-white text-sm tabular-nums mr-1.5">{totalReports}</span>reports / {window_}</span>
            {updated && (
              <>
                <span className="w-px h-4 bg-white/10" />
                <span className="hidden sm:inline">refreshed {ago(updated)}</span>
              </>
            )}
          </div>
        )}
      </motion.div>

      {/* 24h / 7d segmented toggle */}
      <div className="flex justify-center mb-12">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Activity window">
          {(['24h', '7d'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              aria-pressed={window_ === w}
              className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-1.5 rounded-full transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-400 ${
                window_ === w
                  ? 'bg-red-500/15 text-red-200 border border-red-500/40'
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
        <div className="w-full max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
            <div className="md:col-span-7 h-72 rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="md:col-span-5 grid grid-rows-2 gap-4">
              <div className="h-full rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: '80ms' }} />
              <div className="h-full rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: '160ms' }} />
            </div>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
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
        <div className="w-full max-w-5xl mx-auto">
          {/* Top 3: one dominant tile, two stacked. Uneven by design. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4"
          >
            {/* #1 */}
            <div className="relative overflow-hidden rounded-2xl md:col-span-7 border border-red-500/25">
              <div className="absolute inset-0 bg-gradient-to-br from-red-950/60 via-slate-950/95 to-slate-950" />
              <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-red-500/[0.07] blur-3xl pointer-events-none" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
              <div className="relative p-7 md:p-9">
                <span className="absolute top-6 right-7 font-mono text-6xl font-extrabold text-white/[0.06] leading-none select-none pointer-events-none" aria-hidden>01</span>
                <h2 className="font-extrabold tracking-tighter text-white text-3xl md:text-5xl mb-3 break-words pr-16">{first.name}</h2>
                <div className="flex flex-wrap items-center gap-1.5 mb-7">
                  <Chip tone="red">{first.sponsor}</Chip>
                  {first.aka.slice(0, 3).map((a) => <Chip key={a}>{a}</Chip>)}
                </div>
                <div className="flex gap-8 md:gap-10 mb-7">
                  <StatBlock value={first.pulses_24h} label="24h reports" hero />
                  <StatBlock value={first.pulses_7d} label="7d reports" />
                </div>
                <ul className="space-y-2.5">
                  {first.campaigns.slice(0, 4).map((c) => (
                    <li key={c.url}>
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="group flex items-baseline gap-3 min-w-0 text-sm text-slate-300 hover:text-red-100 transition-colors">
                        <span className={`mt-1 shrink-0 w-1 h-1 rounded-full ${c.last_24h ? 'bg-red-400' : 'bg-slate-600'}`} aria-hidden />
                        <span className="min-w-0 truncate group-hover:underline decoration-red-500/30 underline-offset-4">{c.title}</span>
                        <span className="font-mono text-[10px] text-slate-600 shrink-0 tabular-nums ml-auto">{ago(c.modified)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {(first.malware?.length || first.targets?.length) ? (
                  <div className="mt-7 pt-5 border-t border-white/[0.06] flex flex-wrap gap-1.5">
                    {(first.malware ?? []).map((m) => <Chip key={m}>{m}</Chip>)}
                    {(first.targets ?? []).map((t) => <Chip key={t}>{t}</Chip>)}
                  </div>
                ) : null}
              </div>
            </div>

            {/* #2 / #3 */}
            <div className="md:col-span-5 grid grid-rows-2 gap-4">
              {show.slice(1, 3).map((a, i) => (
                <div key={a.name} className="relative overflow-hidden rounded-2xl glass-card p-6 flex flex-col justify-between min-h-[150px]">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">Rank {i === 0 ? '02' : '03'}</span>
                    <span className="font-mono text-xs text-red-400 tabular-nums">{a[activeKey]} reports</span>
                  </div>
                  <div>
                    <div className="font-mono text-xl text-white font-semibold tracking-tight mb-1">{a.name}</div>
                    <div className="font-mono text-[11px] uppercase text-slate-500 mb-3">{a.sponsor}</div>
                    <ActivityBar pct={(count(a) / max) * 100} />
                  </div>
                </div>
              ))}
              {show.length === 2 && <div className="hidden md:block" />}
            </div>
          </motion.div>

          {/* The board: ranks 04+ */}
          {rest.length > 0 && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5 }}
              className="glass-card px-5 md:px-7 py-2"
            >
              <ol className="list-none">
                {rest.map((a, i) => {
                  const isOpen = open === a.name
                  const n = count(a)
                  return (
                    <li key={a.name} className="border-b border-white/[0.04] last:border-b-0">
                      <button
                        onClick={() => setOpen(isOpen ? null : a.name)}
                        aria-expanded={isOpen}
                        className="group w-full flex items-center gap-4 py-4 text-left hover:bg-white/[0.02] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-400"
                      >
                        <span className={`font-mono text-xs w-7 shrink-0 tabular-nums ${i < 2 ? 'text-red-400/80' : 'text-slate-600'}`}>{i + 4}</span>
                        <span className="font-mono text-sm text-slate-100 group-hover:text-red-200 transition-colors tracking-tight w-40 shrink-0 truncate">{a.name}</span>
                        <span className="hidden md:block font-mono text-[11px] uppercase text-slate-500 w-36 shrink-0 truncate">{a.sponsor}</span>
                        <span className="hidden lg:block flex-1 min-w-0 truncate font-mono text-[10px] uppercase text-slate-600">
                          {(a.malware ?? []).slice(0, 2).join(' ') || (a.targets ?? []).slice(0, 2).join(' ')}
                        </span>
                        <span className="flex-1 lg:max-w-[180px] min-w-0 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
                          <ActivityBar pct={(n / max) * 100} />
                        </span>
                        {a.pulses_24h > 0 && window_ !== '24h' && (
                          <span className="hidden sm:inline font-mono text-[10px] uppercase text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 shrink-0">+{a.pulses_24h} today</span>
                        )}
                        <span className="font-mono text-xs text-red-400/90 tabular-nums shrink-0 w-24 text-right">
                          {n}<span className="text-slate-600 lowercase font-sans"> reports</span>
                        </span>
                        <span className={`font-mono text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} aria-hidden>›</span>
                      </button>
                      {isOpen && (
                        <motion.div
                          initial={reduce ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="pb-6 pl-11 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
                            <ul className="space-y-2.5 lg:border-r lg:border-white/[0.06] lg:pr-6 list-none">
                              {a.campaigns.map((c) => (
                                <li key={c.url} className="flex items-baseline gap-3 text-sm">
                                  <span className={`mt-1 shrink-0 w-1 h-1 rounded-full ${c.last_24h ? 'bg-red-400' : 'bg-slate-600'}`} aria-hidden />
                                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-slate-300 hover:text-red-200 hover:underline decoration-red-500/30 underline-offset-4 transition-colors">
                                    {c.title}
                                  </a>
                                  <span className="font-mono text-[10px] text-slate-600 shrink-0 tabular-nums ml-auto">{ago(c.modified)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="space-y-4 text-sm">
                              {a.aka.length > 0 && (
                                <div>
                                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Also known as</div>
                                  <div className="flex flex-wrap gap-1.5">{a.aka.map((x) => <Chip key={x}>{x}</Chip>)}</div>
                                </div>
                              )}
                              {(a.malware ?? []).length > 0 && (
                                <div>
                                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Tooling</div>
                                  <div className="flex flex-wrap gap-1.5">{a.malware!.map((x) => <Chip key={x}>{x}</Chip>)}</div>
                                </div>
                              )}
                              {(a.targets ?? []).length > 0 && (
                                <div>
                                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Targets</div>
                                  <div className="flex flex-wrap gap-1.5">{a.targets!.map((x) => <Chip key={x}>{x}</Chip>)}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </motion.div>
          )}

          <p className="mt-8 text-center text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
            Every campaign links to its public source report. Activity reflects vendor and community
            intelligence, not Threatbase attribution.
          </p>
        </div>
      )}
    </IsoPageShell>
  )
}
