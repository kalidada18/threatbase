import React from 'react'
import IsoLevelWarp from '@/components/ui/isometric-wave-grid-background'
import { motion } from 'framer-motion'
import { Database, Target, Zap } from 'lucide-react'
import { useSEO } from '@/useSEO'

export default function AboutPage() {
  useSEO({
    title: 'About — Threatbase | Community-Driven Threat Intelligence',
    description: 'Learn about Threatbase, a community-driven threat intelligence platform for researchers, analysts, and cybersecurity enthusiasts. Discover IOCs, track threats, and transform security data into actionable intelligence.',
    path: '/about',
  })
  const features = [
    {
      icon: <Database size={24} />,
      iconColorClass: "text-red-400 bg-red-950/30 border-red-500/20 group-hover:border-red-500/40",
      title: "Discover IOCs",
      desc: "Access verified indicators of compromise to proactively defend networks."
    },
    {
      icon: <Target size={24} />,
      iconColorClass: "text-indigo-400 bg-indigo-950/30 border-indigo-500/20 group-hover:border-indigo-500/40",
      title: "Track Threats",
      desc: "Monitor emerging threat actors, malware campaigns, and attack vectors."
    },
    {
      icon: <Zap size={24} />,
      iconColorClass: "text-blue-400 bg-blue-950/30 border-blue-500/20 group-hover:border-blue-500/40",
      title: "Actionable Intel",
      desc: "Transform raw security data and logs into clear, actionable intelligence."
    }
  ]

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans bg-[#0A0C10]">
      
      {/* BACKGROUND */}
      <IsoLevelWarp 
        // A mix of deep red and blue (magenta/purple) to fit the red/blue theme
        color="220, 38, 38" 
        density={50} 
        speed={1.2}
      />

      {/* CONTENT LAYER */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-32 text-center">
        
        {/* Top Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-white/10 backdrop-blur-xl shadow-2xl text-xs font-bold uppercase tracking-widest mb-6 text-red-400">
            About ThreatBase
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white mb-6 drop-shadow-2xl">
            Community-Driven <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-blue-500">
              Threat Intelligence.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed mb-8">
            ThreatBase is a community-driven threat intelligence platform designed for researchers, analysts, and cybersecurity enthusiasts. Discover IOCs, track emerging threats, explore vulnerabilities, and transform raw security data into actionable intelligence.
          </p>

          <div className="inline-block p-[1px] rounded-2xl bg-gradient-to-r from-red-500/40 to-blue-500/40 mb-20 shadow-2xl">
            <div className="px-8 py-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl">
              <span className="font-mono text-lg text-slate-200 tracking-wide">
                <span className="text-red-400">&gt;</span> Curiosity fuels discovery.
              </span>
            </div>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {features.map((f, i) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + (i * 0.1), duration: 0.5 }}
              key={f.title}
              className="group relative flex flex-col justify-start overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-8 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:-translate-y-1 hover:shadow-2xl backdrop-blur-md text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className={`p-3 w-fit rounded-2xl border transition-all duration-300 mb-6 ${f.iconColorClass}`}>
                {f.icon}
              </div>
              
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight group-hover:text-red-100 transition-colors">
                {f.title}
              </h3>
              
              <p className="text-slate-400 font-medium leading-relaxed group-hover:text-slate-300 transition-colors">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  )
}
