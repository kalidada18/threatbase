import { useState, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import supabaseClient from '../supabaseClient'
import { fmt, DEFAULT_AVATAR } from '../utils'
import { useCountUp } from '../lib/useCountUp'

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
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
}

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 28 },
  },
}

/** Per-row count-up for the reports score (needs its own component to own the hook). */
function RowScore({ count, active }: { count: number; active: boolean }) {
  const value = useCountUp(active ? count : null, 1400)
  return (
    <div className="font-mono text-lg sm:text-xl font-semibold leading-none tracking-tight text-white tabular-nums">
      {fmt(value)}
    </div>
  )
}

// Flat editorial rows: hairline rules double as relative-share bars, ranks are
// mono digits, no medals/glow treatment. One accent (ruby) fills the leader's
// share line; everyone else reads against it.
function Row({ leader, index, max }: { leader: any; index: number; max: number }) {
  const rank = getRankInfo(leader.reports_count)
  // Use data-driven role check instead of hardcoded usernames.
  // The top_contributors view should expose an is_admin/role column.
  const isAdmin = leader.is_admin === true || leader.role === 'admin'
  const share = max > 0 ? Math.max(2, Math.round((leader.reports_count / max) * 100)) : 0

  return (
    <motion.li
      variants={rowVariants}
      className="group relative"
    >
      <div className="grid grid-cols-[1.75rem_2.25rem_1fr_auto] sm:grid-cols-[2.25rem_2.5rem_1fr_auto] items-center gap-3 sm:gap-4 px-2 sm:px-4 py-4 transition-colors duration-200 hover:bg-white/[0.02]">
        {/* Rank: quiet mono digits, leader promoted to white */}
        <span className={`font-mono text-xs font-medium tabular-nums ${index === 0 ? 'text-white' : 'text-slate-600'}`}>
          {String(index + 1).padStart(2, '0')}
        </span>

        <img
          src={leader.avatar_url || DEFAULT_AVATAR}
          alt=""
          className="h-9 w-9 flex-shrink-0 rounded-full border border-white/[0.08] bg-black/20 object-cover"
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="truncate text-[15px] font-semibold leading-none tracking-tight text-white/85 transition-colors duration-200 group-hover:text-white">
              @{leader.reporter_alias}
            </h4>
            {isAdmin && (
              <span className="flex flex-shrink-0 items-center gap-1">
                <img src={`${import.meta.env.BASE_URL}img/admin.png`} title="Admin" alt="Admin" className="h-5 w-5 object-contain" />
                <img src={`${import.meta.env.BASE_URL}img/hunter.png`} title="Hunter" alt="Hunter" className="h-5 w-5 object-contain" />
              </span>
            )}
          </div>
          {rank && (
            <span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider ${rank.badge}`}>
              {rank.name}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end justify-center pl-1 text-right">
          <RowScore count={leader.reports_count} active={true} />
          <div className="mt-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap">
            Intel Reports
          </div>
        </div>
      </div>

      {/* Hairline rule that is also the relative-share bar vs. the leader */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.05]">
        <div
          className={`h-full transition-[width] duration-700 ease-out ${index === 0 ? 'bg-red-500/50' : 'bg-slate-600/50'}`}
          style={{ width: `${share}%` }}
        />
      </div>
    </motion.li>
  )
}

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function loadLeaders() {
      if (!supabaseClient) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        // We assume a view 'top_contributors' exists in Supabase
        const { data, error: queryError } = await supabaseClient
          .from('top_contributors')
          .select('*')
          .order('reports_count', { ascending: false })
          .limit(10)

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
    // Refresh leaderboard every 30 seconds
    const interval = setInterval(loadLeaders, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && leaders.length === 0) {
    // Skeletons matching the final row shape (rank, avatar, name, score).
    return (
      <div className="w-full">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid grid-cols-[1.75rem_2.25rem_1fr_auto] sm:grid-cols-[2.25rem_2.5rem_1fr_auto] items-center gap-3 sm:gap-4 border-b border-white/[0.04] px-2 sm:px-4 py-4">
            <div className="h-3 w-5 animate-pulse rounded bg-white/[0.05]" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.05]" />
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.04]" />
            </div>
            <div className="h-4 w-10 animate-pulse rounded bg-white/[0.05]" />
          </div>
        ))}
      </div>
    )
  }

  if (error && leaders.length === 0) {
    return (
      <div className="mx-4 my-8 rounded-2xl border border-red-500/20 bg-red-950/20 px-8 py-10 text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-red-400">Feed unavailable</p>
        <p className="mb-1 text-slate-300">Couldn&apos;t load the leaderboard.</p>
        <p className="text-sm text-slate-500">The database may be mid-update. Reload in a minute.</p>
      </div>
    )
  }

  if (leaders.length === 0) {
    return (
      <div className="px-4 py-14 text-center text-sm text-slate-500">
        No contributors yet. Be the first to earn a rank.
      </div>
    )
  }

  const max = leaders[0]?.reports_count || 1

  return (
    <motion.ol
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full"
    >
      {leaders.map((leader, index) => (
        <Row key={leader.reporter_alias} leader={leader} index={index} max={max} />
      ))}
    </motion.ol>
  )
}
