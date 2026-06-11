import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Medal, Star, Shield, ShieldAlert, Award, Sparkles } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt } from '../utils'

// Ranks based on number of reports
const getRankInfo = (count: number) => {
  if (count >= 50) {
    return {
      name: 'Elite Defender',
      color: 'from-amber-400 via-yellow-500 to-amber-600',
      badgeColor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      shadow: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
      icon: <Trophy size={14} className="text-amber-400" />
    }
  }
  if (count >= 15) {
    return {
      name: 'Vanguard',
      color: 'from-purple-400 via-purple-500 to-indigo-600',
      badgeColor: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
      shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.25)]',
      icon: <Star size={14} className="text-purple-400" />
    }
  }
  if (count >= 5) {
    return {
      name: 'Guardian',
      color: 'from-cyan-400 via-cyan-500 to-blue-600',
      badgeColor: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
      shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.25)]',
      icon: <Shield size={14} className="text-cyan-400" />
    }
  }
  return {
    name: 'Initiate',
    color: 'from-slate-400 to-slate-600',
    badgeColor: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
    shadow: 'shadow-sm',
    icon: <Medal size={14} className="text-slate-400" />
  }
}

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLeaders() {
      if (!supabaseClient) return
      setLoading(true)
      try {
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
    const interval = setInterval(loadLeaders, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && leaders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="relative h-10 w-10 mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-slate-800"></div>
          <div className="absolute inset-0 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"></div>
        </div>
        <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Fetching Top Contributors...</p>
      </div>
    )
  }

  if (leaders.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 border border-white/5 bg-slate-950/20 rounded-2xl p-8">
        <Award size={48} className="mx-auto mb-4 text-slate-600 opacity-40 animate-pulse" />
        <h4 className="text-white font-bold text-lg mb-2">No Contributors Registered</h4>
        <p className="text-sm max-w-xs mx-auto text-slate-400">
          Be the first defender to report a threat IP and claim the #1 spot on the leaderboard!
        </p>
      </div>
    )
  }

  const maxReports = leaders.length > 0 ? leaders[0].reports_count : 1

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between px-2 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Top Analysts Leaderboard
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
          Rankings auto-update
        </span>
      </div>

      <div className="space-y-3">
        {leaders.map((leader, index) => {
          const rank = getRankInfo(leader.reports_count)
          const percentage = Math.min(100, Math.max(2, (leader.reports_count / maxReports) * 100))
          const isTop3 = index < 3

          return (
            <motion.div
              key={leader.reporter_alias}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
                isTop3
                  ? 'bg-slate-900/60 border-white/[0.08] hover:border-white/[0.15]'
                  : 'bg-slate-950/40 border-white/5 hover:border-white/[0.08]'
              }`}
            >
              {/* Dynamic visual progress background filling */}
              <div 
                className="absolute left-0 bottom-0 top-0 bg-slate-800/10 transition-all duration-500 pointer-events-none"
                style={{ width: `${percentage}%` }}
              />

              {/* Decorative side accent for top spots */}
              {isTop3 && (
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${rank.color}`} />
              )}

              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  {/* Rank Circle */}
                  <div className={`flex items-center justify-center w-9 h-9 rounded-full font-mono font-bold text-sm transition-all duration-300 ${
                    index === 0
                      ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 group-hover:scale-105 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                      : index === 1
                      ? 'bg-slate-300/15 text-slate-300 border border-slate-300/30 group-hover:scale-105'
                      : index === 2
                      ? 'bg-amber-600/15 text-amber-500 border border-amber-600/30 group-hover:scale-105'
                      : 'bg-white/5 text-slate-500 border border-white/5'
                  }`}>
                    {index + 1}
                  </div>

                  <div>
                    {/* User Alias */}
                    <h4 className="font-bold text-slate-200 tracking-wide text-base group-hover:text-white transition-colors">
                      @{leader.reporter_alias}
                    </h4>

                    {/* Rank Badge */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${rank.badgeColor}`}>
                        {rank.icon}
                        <span>{rank.name}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  {/* Total Reports */}
                  <div className="text-2xl font-extrabold text-slate-100 group-hover:text-cyan-400 transition-colors duration-300 font-mono tracking-tight">
                    {fmt(leader.reports_count)}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-0.5">
                    Intel Submissions
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
