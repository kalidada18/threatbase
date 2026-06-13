import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSEO } from '@/useSEO'
import { ParticleCanvas } from '@/components/ui/particle-canvas-1'
import supabaseClient from '../supabaseClient'
import { Crown, Trophy } from 'lucide-react'
import { fmt, getAvatarForName } from '../utils'

export default function ThanksPage() {
  const [topReporter, setTopReporter] = useState<any>(null)

  useSEO({
    title: 'Intel Sources — Threatbase | Open Source Threat Intelligence Credits',
    description: 'Threatbase is powered by the global cybersecurity community. Credits to Spamhaus, FireHOL, Emerging Threats, Abuse.ch, SANS DShield, and 15+ open-source threat intelligence providers.',
    path: '/thanks',
  })

  useEffect(() => {
    async function loadTopReporter() {
      try {
        const { data: topData, error: topError } = await supabaseClient
          .from('top_contributors')
          .select('*')
          .order('reports_count', { ascending: false })
          .limit(1)
          .single()
          
        if (topData) {
          const { data: profileData } = await supabaseClient
            .from('profiles')
            .select('avatar_url')
            .eq('username', topData.reporter_alias)
            .single()
            
          setTopReporter({
            ...topData,
            avatar_url: profileData?.avatar_url || getAvatarForName(topData.reporter_alias)
          })
        }
      } catch (err) {
        console.error('Failed to load top reporter for thanks page:', err)
      }
    }
    loadTopReporter()
  }, [])

  const getRankName = (count: number) => {
    if (count >= 500) return 'Legend'
    if (count >= 300) return 'Elite'
    if (count >= 100) return 'Pro'
    if (count >= 50) return 'Defender'
    return 'Initiate'
  }

  return (
    <main className="min-h-screen pt-32 pb-32 relative bg-[#0B0F19] overflow-hidden font-sans">
      <ParticleCanvas speedScale={1.5} maxParticles={600} />

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-16 text-center relative flex flex-col items-center"
        >
          {/* Golden Glowing Background Behind Handshake */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none"></div>

          {/* Thanks Logo Animation */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="mb-8 mx-auto w-32 h-32 rounded-full bg-white/5 border border-white/10 shadow-[0_0_40px_rgba(34,211,238,0.15)] backdrop-blur-md flex items-center justify-center p-6 overflow-hidden relative z-10"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-transparent opacity-50"></div>
            <img src={`${import.meta.env.BASE_URL}img/thanks.png`} alt="Thanks" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-black flex flex-col items-center justify-center gap-3 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-slate-400 tracking-tight drop-shadow-sm pb-2">
            Intel Sources
          </h1>
          <p className="mt-4 text-slate-400 text-lg md:text-xl max-w-4xl mx-auto leading-relaxed drop-shadow">
            A sincere thank you to all the threat intelligence feed maintainers and contributors whose hard work makes this project possible. By continuously collecting, analyzing, and sharing malicious IP indicators, you help security professionals and organizations around the world detect threats faster and strengthen their defenses. We are grateful to the teams behind FireHOL, AbuseIPDB, Blocklist.de, IPsum, CINS Army, ThreatFox, Binary Defense, Feodo Tracker, DShield, TOR lists, GreenSnow, Emerging Threats, and many other community-driven projects. Your dedication to open threat intelligence helps make the internet a safer place for everyone.
          </p>
        </motion.div>

        {/* Top Reporter Card */}
        {topReporter && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mx-auto max-w-4xl rounded-2xl border border-yellow-500/20 bg-gradient-to-b from-yellow-500/10 to-black/40 backdrop-blur-md overflow-hidden relative shadow-[0_0_40px_rgba(234,179,8,0.15)] group"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent"></div>
            <div className="p-8 md:p-10 flex flex-col md:flex-row items-center gap-8 text-center md:text-left relative z-10">
              <div className="relative">
                <div className="absolute -inset-4 bg-yellow-500/20 rounded-full blur-xl group-hover:bg-yellow-500/30 transition-all duration-500"></div>
                <img src={topReporter.avatar_url} alt="Avatar" className="w-32 h-32 rounded-full border-4 border-yellow-500/30 object-cover shadow-2xl relative z-10" />
                <div className="absolute -bottom-4 -right-4 bg-black rounded-full p-2 border-2 border-yellow-500/50 shadow-xl z-20">
                  <img src={`${import.meta.env.BASE_URL}img/1streward.png`} alt="1st Place" className="w-10 h-10 object-contain drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                </div>
              </div>
              
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-yellow-500 text-xs font-bold uppercase tracking-[0.2em] mb-2 drop-shadow-sm flex items-center justify-center md:justify-start gap-2">
                    <Crown size={14} className="text-yellow-400" />
                    #1 Community MVP
                  </h3>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                    <h2 className="text-4xl md:text-5xl font-black text-white font-elegant tracking-tight">@{topReporter.reporter_alias}</h2>
                    {topReporter.reporter_alias === 'kalidada' || topReporter.reporter_alias === 'lamichhanesujal18' ? (
                      <span className="flex items-center gap-2">
                        <img src={`${import.meta.env.BASE_URL}img/admin.png`} title="Admin" alt="Admin" className="w-8 h-8 object-contain drop-shadow-md" />
                        <img src={`${import.meta.env.BASE_URL}img/hunter.png`} title="Hunter" alt="Hunter" className="w-8 h-8 object-contain drop-shadow-md" />
                      </span>
                    ) : null}
                  </div>
                </div>
                
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-semibold shadow-inner">
                  <Trophy size={16} />
                  {getRankName(topReporter.reports_count)}
                </div>
              </div>

              <div className="text-center flex flex-col items-center justify-center min-w-[140px] p-6 rounded-xl bg-black/40 border border-white/5 backdrop-blur-sm">
                <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 mb-2 drop-shadow-lg font-elegant">
                  {fmt(topReporter.reports_count)}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                  Intel Reports
                </div>
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </main>
  )
}
