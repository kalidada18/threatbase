import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Target, Database, Zap, Sparkles } from 'lucide-react'

export default function AboutSection() {
  const features = [
    {
      icon: <Database size={20} />,
      iconColorClass: "text-red-400 bg-red-950/30 border-red-500/20 group-hover:border-red-500/40",
      title: "Discover IOCs",
      desc: "Access verified indicators of compromise to proactively defend networks."
    },
    {
      icon: <Target size={20} />,
      iconColorClass: "text-blue-400 bg-blue-950/30 border-blue-500/20 group-hover:border-blue-500/40",
      title: "Track Threats",
      desc: "Monitor emerging threat actors, malware campaigns, and attack vectors."
    },

    {
      icon: <Zap size={20} />,
      iconColorClass: "text-indigo-400 bg-indigo-950/30 border-indigo-500/20 group-hover:border-indigo-500/40",
      title: "Actionable Intel",
      desc: "Transform raw security data and logs into clear, actionable intelligence."
    }
  ]

  return (
    <section className="relative w-full py-16 md:py-24 z-10 overflow-hidden" id="about">
      {/* Very Subtle Noise/Glow (optional, matches the rest of the site's dark mood) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(225,29,72,0.03)_0%,transparent_70%)] pointer-events-none" />

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Column - Text Content */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="flex flex-col space-y-8"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/50 border border-white/[0.05] text-red-400 backdrop-blur-xl shadow-2xl text-[10px] uppercase font-bold tracking-widest mb-6">
                <Sparkles size={12} className="text-red-400 animate-pulse" />
                About ThreatBase
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
                Community-Driven <br />
                <span className="bg-gradient-to-r from-red-400 to-blue-500 bg-clip-text text-transparent">
                  Threat Intelligence
                </span>
              </h2>
            </div>
            
            <p className="text-base md:text-lg text-slate-400 leading-relaxed max-w-xl font-medium">
              ThreatBase is a community-driven threat intelligence platform designed for researchers, analysts, and cybersecurity enthusiasts. Discover IOCs, track emerging threats, explore vulnerabilities, and transform raw security data into actionable intelligence. 
            </p>
            
            <div className="pt-2">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest border-l-2 border-red-500/50 pl-4 py-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                Curiosity fuels discovery.
              </p>
            </div>
          </motion.div>

          {/* Right Column - Feature Grid */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-6"
          >
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className="group relative flex flex-col justify-start overflow-hidden rounded-2xl border border-white/[0.04] bg-slate-950/40 p-6 sm:p-8 transition-all duration-300 hover:bg-slate-900/30 hover:border-slate-700/40 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className={`h-12 w-12 rounded-xl border flex items-center justify-center transition-all duration-300 shadow-lg mb-5 ${feature.iconColorClass} group-hover:scale-110`}>
                  {feature.icon}
                </div>
                <div>
                  <h3 className="text-white font-bold text-base mb-2 group-hover:text-slate-200 transition-colors">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors font-medium">{feature.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </section>
  )
}
