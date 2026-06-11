import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Medal, Star, Shield, ShieldAlert, Award } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt } from '../utils'

// Ranks based on number of reports
const getRankInfo = (count: number) => {
  if (count >= 50) return { name: 'Elite Defender', color: 'from-yellow-300 via-yellow-500 to-amber-600', shadow: 'shadow-[0_0_20px_rgba(234,179,8,0.5)]', icon: <Trophy size={16} className="text-yellow-100" /> }
  if (count >= 15) return { name: 'Vanguard', color: 'from-purple-400 via-purple-500 to-indigo-600', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.4)]', icon: <Star size={16} className="text-purple-100" /> }
  if (count >= 5) return { name: 'Guardian', color: 'from-cyan-400 via-cyan-500 to-blue-600', shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.4)]', icon: <Shield size={16} className="text-cyan-100" /> }
  return { name: 'Initiate', color: 'from-slate-400 to-slate-600', shadow: 'shadow-sm', icon: <Medal size={16} className="text-slate-200" /> }
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
            className="flex items-center justify-between p-3.5 rounded-lg bg-[#171C28] border border-white/5 hover:border-white/10 transition-colors relative overflow-hidden group"
          >
            {/* Top 3 Glow effect behind the row */}
            {index < 3 && (
              <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${rank.color}`} />
            )}

            <div className="flex items-center gap-4 relative z-10">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/40 border border-white/10 text-sm font-bold text-slate-400">
                #{index + 1}
              </div>
              <div>
                <h4 className="font-bold text-white tracking-wide text-lg">@{leader.reporter_alias}</h4>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full mt-1.5 bg-gradient-to-r ${rank.color} ${rank.shadow}`}>
                  {rank.icon}
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white/90 drop-shadow-sm">
                    {rank.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right relative z-10">
              <div className="text-2xl font-black text-white">
                {fmt(leader.reports_count)}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Intel Reports
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
