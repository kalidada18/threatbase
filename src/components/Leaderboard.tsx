import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Award } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt } from '../utils'

// Ranks based on number of reports
const getRankInfo = (count: number) => {
  if (count >= 500) {
    return {
      name: 'Legend',
      color: 'from-yellow-300 via-amber-400 to-yellow-600',
      shadow: 'shadow-[0_0_20px_rgba(234,179,8,0.5)]',
      icon: (
        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    }
  }
  if (count >= 300) {
    return {
      name: 'Elite',
      color: 'from-purple-400 via-fuchsia-500 to-purple-600',
      shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.4)]',
      icon: (
        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 12l10 10 10-10L12 2z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 2L2 12l10 10 10-10L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    }
  }
  if (count >= 100) {
    return {
      name: 'Pro',
      color: 'from-cyan-400 via-blue-500 to-indigo-600',
      shadow: 'shadow-[0_0_15px_rgba(34,211,238,0.4)]',
      icon: (
        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" fillOpacity="0.2" />
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    }
  }
  if (count >= 50) {
    return {
      name: 'Defender',
      color: 'from-emerald-400 via-emerald-500 to-teal-600',
      shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.4)]',
      icon: (
        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
  }
  return {
    name: 'Initiate',
    color: 'from-slate-400 to-slate-600',
    shadow: 'shadow-sm',
    icon: (
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1" />
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
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
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (leaders.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Award size={48} className="mx-auto mb-4 opacity-30" />
        <p>No contributors yet. Be the first to earn a rank!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {leaders.map((leader, index) => {
        const rank = getRankInfo(leader.reports_count)
        return (
          <motion.div
            key={leader.reporter_alias}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-3.5 rounded-lg bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-colors relative overflow-hidden group"
          >
            {/* Top 3 Glow effect behind the row */}
            {index < 3 && (
              <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${rank.color}`} />
            )}

            <div className="flex items-center gap-4 relative z-10">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/5 text-sm font-semibold text-slate-400">
                #{index + 1}
              </div>
              <div>
                <h4 className="font-semibold text-slate-200 text-base tracking-wide">@{leader.reporter_alias}</h4>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full mt-1.5 bg-gradient-to-r ${rank.color} ${rank.shadow}`}>
                  {rank.icon}
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white/90 drop-shadow-sm">
                    {rank.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right relative z-10">
              <div className="text-xl font-bold text-slate-200">
                {fmt(leader.reports_count)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                Intel Reports
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
