import { useState, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Diamond, Star, Shield, Trophy, Medal } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, getAvatarForName } from '../utils'
import { useCountUp } from '../lib/useCountUp'

// Ranks based on number of reports. Each rank exposes a single `accent` token
// so the badge border, 10%-opacity background, and text color stay in sync.
const getRankInfo = (count: number) => {
  if (count >= 500) {
    return {
      name: 'Legend',
      accent: 'gold',
      badge: 'bg-amber-400/10 border-amber-300/30 text-amber-200 group-hover:bg-amber-400/[0.16] group-hover:border-amber-300/50',
      icon: <Trophy size={11} strokeWidth={2.5} />,
    }
  }
  if (count >= 300) {
    return {
      name: 'Elite',
      accent: 'platinum',
      badge: 'bg-platinum-300/10 border-platinum-300/30 text-platinum-200 group-hover:bg-platinum-300/[0.16] group-hover:border-platinum-200/50',
      icon: <Diamond size={11} strokeWidth={2.5} />,
    }
  }
  if (count >= 100) {
    return {
      name: 'Pro',
      accent: 'steel',
      badge: 'bg-slate-400/10 border-slate-400/25 text-slate-200 group-hover:bg-slate-400/[0.16] group-hover:border-slate-300/45',
      icon: <Star size={11} strokeWidth={2.5} />,
    }
  }
  if (count >= 50) {
    return {
      name: 'Defender',
      accent: 'slate',
      badge: 'bg-slate-500/10 border-slate-500/25 text-slate-300 group-hover:bg-slate-500/[0.16] group-hover:border-slate-400/40',
      icon: <Shield size={11} strokeWidth={2.5} />,
    }
  }
  return null
}

// Top-3 ambient treatment: a soft ring + colored radial glow bleeding in from
// the left edge of the row. Anything past 3rd place is visually neutral.
const podiumStyle = (index: number) => {
  switch (index) {
    case 0:
      return {
        row: 'ring-1 ring-inset ring-amber-400/20 hover:ring-amber-300/30',
        glow: 'bg-[radial-gradient(120%_140%_at_0%_50%,rgba(245,158,11,0.10),transparent_60%)]',
      }
    case 1:
      return {
        row: 'ring-1 ring-inset ring-slate-300/15 hover:ring-slate-200/25',
        glow: 'bg-[radial-gradient(120%_140%_at_0%_50%,rgba(203,213,225,0.08),transparent_60%)]',
      }
    case 2:
      return {
        row: 'ring-1 ring-inset ring-orange-500/15 hover:ring-orange-400/25',
        glow: 'bg-[radial-gradient(120%_140%_at_0%_50%,rgba(234,88,12,0.08),transparent_60%)]',
      }
    default:
      return {
        row: 'ring-1 ring-inset ring-white/[0.04] hover:ring-white/10',
        glow: 'bg-transparent',
      }
  }
}

const MEDALS = ['1streward.png', '2ndmedal.png', '3rdmedal.png']

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 26 },
  },
}

/** Per-row count-up for the reports score (needs its own component to own the hook). */
function RowScore({ count, active }: { count: number; active: boolean }) {
  const value = useCountUp(active ? count : null, 1400)
  return (
    <div className="font-elegant text-lg sm:text-xl font-bold leading-none tracking-tight text-white tabular-nums">
      {fmt(value)}
    </div>
  )
}

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLeaders() {
      if (!supabaseClient) return
      setLoading(true)
      try {
        // We assume a view 'top_contributors' exists in Supabase
        const { data, error } = await supabaseClient
          .from('top_contributors')
          .select('*')
          .order('reports_count', { ascending: false })
          .limit(10)

        if (error) throw error
        if (data) setLeaders(data)
      } catch (err) {
        console.error('Failed to load leaderboard:', err)
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
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (leaders.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <Medal size={48} className="mx-auto mb-4 opacity-30" />
        <p>No contributors yet. Be the first to earn a rank!</p>
      </div>
    )
  }

  return (
    <motion.ol
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-2"
    >
      {leaders.map((leader, index) => {
        const rank = getRankInfo(leader.reports_count)
        const podium = podiumStyle(index)
        // Use data-driven role check instead of hardcoded usernames.
        // The top_contributors view should expose an is_admin/role column.
        const isAdmin = leader.is_admin === true || leader.role === 'admin'

        return (
          <motion.li
            key={leader.reporter_alias}
            variants={rowVariants}
            className={`group relative overflow-hidden rounded-xl transition-all duration-300 ease-out
              bg-white/[0.015] hover:bg-white/[0.04] hover:translate-x-1 ${podium.row}`}
          >
            {/* podium ambient glow */}
            <div className={`pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-500 group-hover:opacity-100 ${podium.glow}`} />

            <div className="relative z-10 grid grid-cols-[2.75rem_1fr_auto] sm:grid-cols-[3rem_1fr_auto] items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3.5">
              {/* Rank / medal — top-3 get a shine sweep across the medal on hover */}
              <div className="flex items-center justify-center">
                {index < 3 ? (
                  <span className="relative inline-block overflow-hidden rounded-full">
                    <img
                      src={`${import.meta.env.BASE_URL}img/${MEDALS[index]}`}
                      alt={`Rank ${index + 1}`}
                      className="w-8 h-8 sm:w-9 sm:h-9 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-300 group-hover:scale-110"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 -translate-x-[130%] skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[130%] motion-reduce:hidden"
                    />
                  </span>
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full font-elegant text-sm font-bold text-slate-500 tabular-nums transition-colors duration-300 group-hover:text-slate-300">
                    {index + 1}
                  </span>
                )}
              </div>

              {/* User info */}
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={leader.avatar_url || getAvatarForName(leader.reporter_alias)}
                  alt=""
                  className="h-9 w-9 flex-shrink-0 rounded-full border border-white/10 bg-black/20 object-cover drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
                />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="truncate font-elegant text-[15px] font-semibold leading-none tracking-tight text-white/85 transition-colors duration-300 group-hover:text-white">
                      @{leader.reporter_alias}
                    </h4>
                    {isAdmin && (
                      <span className="flex flex-shrink-0 items-center gap-1">
                        <img src={`${import.meta.env.BASE_URL}img/admin.png`} title="Admin" alt="Admin" className="h-5 w-5 object-contain drop-shadow transition-transform duration-300 group-hover:scale-110" />
                        <img src={`${import.meta.env.BASE_URL}img/hunter.png`} title="Hunter" alt="Hunter" className="h-5 w-5 object-contain drop-shadow transition-transform duration-300 group-hover:scale-110" />
                      </span>
                    )}
                  </div>
                  {/* Rank badge — premium SaaS tag */}
                  {rank && (
                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider transition-all duration-300 ${rank.badge}`}>
                      {rank.icon}
                      {rank.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Score — counts up when the row mounts */}
              <div className="flex flex-col items-end justify-center pl-1 text-right">
                <RowScore count={leader.reports_count} active={true} />
                <div className="mt-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap">
                  Intel Reports
                </div>
              </div>
            </div>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}
