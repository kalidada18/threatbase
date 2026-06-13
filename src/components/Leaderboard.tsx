import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Crown, Diamond, Star, Shield, Target, Trophy, ShieldCheck, Medal } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, getAvatarForName } from '../utils'

// Ranks based on number of reports
const getRankInfo = (count: number) => {
  if (count >= 500) {
    return {
      name: 'Legend',
      style: 'bg-amber-500/10 border-amber-500/30 text-amber-500 transition-all duration-500 group-hover:bg-amber-500/20 group-hover:border-amber-400/60 group-hover:text-amber-400',
      icon: <Trophy size={14} className="text-amber-500 transition-all duration-500 group-hover:text-amber-400" strokeWidth={2.5} />
    }
  }
  if (count >= 300) {
    return {
      name: 'Elite',
      style: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-500 transition-all duration-500 group-hover:bg-fuchsia-500/20 group-hover:border-fuchsia-400/60 group-hover:text-fuchsia-400',
      icon: <Diamond size={14} className="text-fuchsia-500 transition-all duration-500 group-hover:text-fuchsia-400" strokeWidth={2.5} />
    }
  }
  if (count >= 100) {
    return {
      name: 'Pro',
      style: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500 transition-all duration-500 group-hover:bg-cyan-500/20 group-hover:border-cyan-400/60 group-hover:text-cyan-400',
      icon: <Star size={14} className="text-cyan-500 transition-all duration-500 group-hover:text-cyan-400" strokeWidth={2.5} />
    }
  }
  if (count >= 50) {
    return {
      name: 'Defender',
      style: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 transition-all duration-500 group-hover:bg-emerald-500/20 group-hover:border-emerald-400/60 group-hover:text-emerald-400',
      icon: <Shield size={14} className="text-emerald-500 transition-all duration-500 group-hover:text-emerald-400" strokeWidth={2.5} />
    }
  }
  return {
    name: 'Initiate',
    style: 'bg-slate-500/10 border-slate-500/30 text-slate-400 transition-all duration-500 group-hover:bg-slate-400/20 group-hover:border-slate-300/40 group-hover:text-slate-200',
    icon: <Target size={14} className="text-slate-400 transition-all duration-500 group-hover:text-slate-200" strokeWidth={2.5} />
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
    <div className="w-full flex flex-col">
      {leaders.map((leader, index) => {
        const rank = getRankInfo(leader.reports_count)
        return (
          <motion.div
            key={leader.reporter_alias}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between py-4 px-3 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors duration-200 relative group gap-4"
          >
            <div className="flex items-center gap-4 relative z-10 flex-1 min-w-0">
              <div className={`flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-full font-bold font-elegant border transition-all duration-500 ${index === 0 ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-500' :
                  index === 1 ? 'bg-slate-400/5 border-slate-400/20 text-slate-400' :
                    index === 2 ? 'bg-orange-600/5 border-orange-600/20 text-orange-600' :
                      'bg-transparent text-slate-500 border-transparent text-[14px]'
                }`}>
                {index === 0 ? <img src={`${import.meta.env.BASE_URL}img/1streward.png`} alt="1st Place" className="w-8 h-8 object-contain drop-shadow-md transition-all duration-500 group-hover:scale-110" /> :
                  index === 1 ? <img src={`${import.meta.env.BASE_URL}img/2ndmedal.png`} alt="2nd Place" className="w-8 h-8 object-contain drop-shadow-md transition-all duration-500 group-hover:scale-110" /> :
                    index === 2 ? <img src={`${import.meta.env.BASE_URL}img/3rdmedal.png`} alt="3rd Place" className="w-8 h-8 object-contain drop-shadow-md transition-all duration-500 group-hover:scale-110" /> :
                      `#${index + 1}`}
              </div>
              <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <img src={getAvatarForName(leader.reporter_alias)} alt="Avatar" className="w-6 h-6 rounded-full border border-white/10 bg-black/20 object-cover drop-shadow-sm" />
                  <h4 className="font-semibold text-white/80 transition-all duration-500 group-hover:text-white text-[15px] md:text-[16px] tracking-tight font-elegant leading-tight break-words">@{leader.reporter_alias}</h4>
                  {leader.reporter_alias === 'lamichhanesujal18' && (
                    <span className="flex-shrink-0 flex items-center gap-2 transition-transform duration-500 hover:scale-105">
                      <img src={`${import.meta.env.BASE_URL}img/admin.png`} title="Admin" alt="Admin" className="w-7 h-7 object-contain drop-shadow-md transition-all duration-500" />
                      <img src={`${import.meta.env.BASE_URL}img/hunter.png`} title="Hunter" alt="Hunter" className="w-7 h-7 object-contain drop-shadow-md transition-all duration-500" />
                    </span>
                  )}
                </div>

              </div>
            </div>

            <div className="text-right relative z-10 flex flex-col justify-center flex-shrink-0">
              <div className="text-xl font-bold text-white font-elegant tracking-tight leading-none mb-0.5">
                {fmt(leader.reports_count)}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold whitespace-nowrap">
                Intel Reports
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
