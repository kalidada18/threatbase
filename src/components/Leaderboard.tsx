import { useState, useEffect, type ReactNode } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Crown } from 'lucide-react'
import db from '../lib/dbClient'
import { fmt } from '../utils'
import { useCountUp } from '../lib/useCountUp'
import { splitLeaderboard } from '../lib/leaderboardRanking'

// Ranks based on number of reports. Each rank exposes a single `accent` token
// so the badge border, 10%-opacity background, and text color stay in sync.
const getRankInfo = (count: number) => {
  if (count >= 500) {
    return {
      name: 'Legend',
      accent: 'white',
      badge: 'bg-white/[0.08] border-white/25 text-white',
    }
  }
  if (count >= 300) {
    return {
      name: 'Elite',
      accent: 'platinum',
      badge: 'bg-platinum-300/10 border-platinum-300/30 text-platinum-200',
    }
  }
  if (count >= 100) {
    return {
      name: 'Pro',
      accent: 'steel',
      badge: 'bg-slate-400/10 border-slate-400/25 text-slate-200',
    }
  }
  if (count >= 50) {
    return {
      name: 'Defender',
      accent: 'slate',
      badge: 'bg-slate-500/10 border-slate-500/25 text-slate-300',
    }
  }
  return null
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
}

const podiumVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.99 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 170, damping: 24 },
  },
}

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 250, damping: 27 },
  },
}

// One grid template shared by the column labels, every row, and the loading
// skeleton — they must agree or the columns shear between states.
const LEDGER_COLS =
  'grid grid-cols-[1.75rem_2.25rem_1fr_auto] sm:grid-cols-[2.25rem_2.5rem_1fr_auto] items-center gap-3 sm:gap-4 px-3 sm:px-5'

/** Real picture or nothing — never a stand-in face that misattributes an
 *  identity to an anonymous reporter. The empty span holds the grid cell so
 *  the score column stays aligned. */
function AvatarSlot({ src, className }: { src?: string | null; className: string }) {
  if (!src) return <span className={`${className} flex-shrink-0`} aria-hidden />
  return <img src={src} alt="" className={`${className} flex-shrink-0 bg-black/20 object-cover`} />
}

/** Server-side profiles.role — un-writable by authenticated users, so trusted. */
function RoleBadges({ isSuperadmin, isAdmin }: { isSuperadmin: boolean; isAdmin: boolean }) {
  if (!isSuperadmin && !isAdmin) return null
  return (
    <>
      {isSuperadmin && (
        <span className="flex-shrink-0 rounded-md border border-red-500/30 bg-red-500/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-red-400">
          Superadmin
        </span>
      )}
      {isAdmin && !isSuperadmin && (
        <span className="flex flex-shrink-0 items-center gap-1">
          <img src={`${import.meta.env.BASE_URL}img/admin.png`} title="Admin" alt="Admin" className="h-5 w-5 object-contain" />
          <img src={`${import.meta.env.BASE_URL}img/hunter.png`} title="Hunter" alt="Hunter" className="h-5 w-5 object-contain" />
        </span>
      )}
    </>
  )
}

/** Count-up needs its own component to own the hook. */
function CountUpScore({ count, className }: { count: number; className: string }) {
  const value = useCountUp(count, 1400)
  return <div className={className}>{fmt(value)}</div>
}

// The leader is promoted out of the ledger into a spotlight panel: it is the
// page's whole subject, and a list that renders rank 01 identically to rank 09
// buries it. Rows 02+ read as the ranked detail beneath it.
function Podium({ leader, runnerUp }: { leader: any; runnerUp?: any }) {
  const rank = getRankInfo(leader.reports_count)
  const isSuperadmin = leader.is_superadmin === true || leader.role === 'superadmin'
  const isAdmin = leader.is_admin === true || leader.role === 'admin'
  const margin = runnerUp ? leader.reports_count - runnerUp.reports_count : 0

  return (
    <motion.section
      variants={podiumVariants}
      initial="hidden"
      animate="show"
      aria-label="Leading contributor"
      className="relative overflow-hidden rounded-2xl border border-red-500/[0.14] bg-gradient-to-br from-red-500/[0.08] via-white/[0.02] to-transparent p-5 sm:p-7"
    >
      {/* Platinum sheen along the top edge — the light source the glass bends. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/40 to-transparent"
      />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <div className="relative flex-shrink-0">
            {leader.avatar_url && (
              <span aria-hidden className="absolute -inset-1 rounded-full bg-red-500/20 blur-md" />
            )}
            <AvatarSlot
              src={leader.avatar_url}
              className="relative h-14 w-14 rounded-full border border-white/[0.14] sm:h-16 sm:w-16"
            />
          </div>

          <div className="min-w-0">
            <span className="eyebrow">
              <Crown size={12} strokeWidth={2} />
              Leading reporter
            </span>
            <h2 className="mt-3 truncate text-xl font-bold leading-none tracking-tighter text-white sm:text-2xl">
              @{leader.reporter_alias}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleBadges isSuperadmin={isSuperadmin} isAdmin={isAdmin} />
              {rank && (
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider ${rank.badge}`}>
                  {rank.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-6 border-t border-white/[0.06] pt-5 sm:flex-col sm:items-end sm:justify-center sm:border-0 sm:pt-0 sm:text-right">
          <div>
            <CountUpScore
              count={leader.reports_count}
              className="font-mono text-3xl font-semibold leading-none tracking-tight text-white tabular-nums sm:text-4xl"
            />
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Intel reports
            </div>
          </div>
          {runnerUp && (
            <div className="font-mono text-[10px] leading-relaxed text-platinum-400">
              +{fmt(margin)} ahead of @{runnerUp.reporter_alias}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  )
}

// Ranked detail rows: mono rank digits, hairline rules that double as the
// relative-share bar against the leader. No medals, no glow tiles.
function Row({ entry, rank, share }: { entry: any; rank: number; share: number }) {
  const tier = getRankInfo(entry.reports_count)
  const isSuperadmin = entry.is_superadmin === true || entry.role === 'superadmin'
  const isAdmin = entry.is_admin === true || entry.role === 'admin'

  return (
    <motion.li variants={rowVariants} className="group relative">
      {/* Ruby edge that wipes in on hover — transform only, so no repaint. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-gradient-to-b from-red-400/70 to-red-600/0 transition-transform duration-300 group-hover:scale-y-100"
      />

      <div className={`${LEDGER_COLS} py-4 transition-colors duration-200 group-hover:bg-white/[0.025]`}>
        <span className={`font-mono text-xs font-medium tabular-nums ${rank <= 3 ? 'text-platinum-300' : 'text-slate-500'}`}>
          {String(rank).padStart(2, '0')}
        </span>

        <AvatarSlot
          src={entry.avatar_url}
          className="h-9 w-9 rounded-full border border-white/[0.08]"
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-[15px] font-semibold leading-none tracking-tight text-white/85 transition-colors duration-200 group-hover:text-white">
              @{entry.reporter_alias}
            </h4>
            <RoleBadges isSuperadmin={isSuperadmin} isAdmin={isAdmin} />
          </div>
          {tier && (
            <span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider ${tier.badge}`}>
              {tier.name}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end justify-center pl-1 text-right">
          <CountUpScore
            count={entry.reports_count}
            className="font-mono text-lg font-semibold leading-none tracking-tight text-white tabular-nums sm:text-xl"
          />
          <div className="mt-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px]">
            Intel Reports
          </div>
        </div>
      </div>

      {/* Hairline rule that is also the relative-share bar vs. the leader. */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-600/70 to-red-400/70 transition-[width] duration-700 ease-out"
          style={{ width: `${share}%` }}
        />
      </div>
    </motion.li>
  )
}

function Ledger({ children }: { children: ReactNode }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className={`${LEDGER_COLS} border-b border-white/[0.06] py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500`}>
        <span>#</span>
        <span aria-hidden />
        <span>Contributor</span>
        <span className="text-right">Reports</span>
      </div>
      {children}
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="glass-card px-8 py-12 text-center">
      {children}
    </div>
  )
}

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function loadLeaders() {
      if (!db) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        // We assume a view 'top_contributors' exists in Supabase
        const { data, error: queryError } = await db
          .from('top_contributors')
          .select('*')
          .order('reports_count', { ascending: false })
          .limit(10)
          .abortSignal(AbortSignal.timeout(12_000))

        if (queryError) throw queryError
        if (data) {
          setLeaders(data)
          setError(false)
        }
      } catch (err) {
        console.error('Failed to load leaderboard:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    loadLeaders()
    // Refresh leaderboard every 30 seconds — skip while the tab is hidden;
    // nobody is watching, and each tick is a Supabase round-trip.
    const interval = setInterval(() => { if (!document.hidden) loadLeaders() }, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && leaders.length === 0) {
    // Skeletons matching the final shape: spotlight panel, then ranked rows.
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-7">
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 flex-shrink-0 animate-pulse rounded-full bg-white/[0.05] sm:h-16 sm:w-16" />
            <div className="space-y-3">
              <div className="h-2.5 w-24 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-4 w-40 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.04]" />
            </div>
          </div>
        </div>
        <Ledger>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`${LEDGER_COLS} py-4`}>
              <div className="h-3 w-5 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.05]" />
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-white/[0.05]" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.04]" />
              </div>
              <div className="h-4 w-10 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ))}
        </Ledger>
      </div>
    )
  }

  if (error && leaders.length === 0) {
    return (
      <Notice>
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-red-400">Feed unavailable</p>
        <p className="mb-1 text-slate-300">Couldn&apos;t load the leaderboard.</p>
        <p className="text-sm text-slate-500">The database may be mid-update. Reload in a minute.</p>
      </Notice>
    )
  }

  if (leaders.length === 0) {
    return (
      <Notice>
        <p className="text-sm text-slate-500">No contributors yet. Be the first to earn a rank.</p>
      </Notice>
    )
  }

  const { leader, ranked } = splitLeaderboard(leaders)
  if (!leader) return null

  return (
    <div className="space-y-6">
      <Podium leader={leader} runnerUp={ranked[0]?.entry} />
      {ranked.length > 0 && (
        <Ledger>
          <motion.ol variants={container} initial="hidden" animate="show">
            {ranked.map(({ entry, rank, share }) => (
              <Row key={entry.reporter_alias} entry={entry} rank={rank} share={share} />
            ))}
          </motion.ol>
        </Ledger>
      )}
    </div>
  )
}
