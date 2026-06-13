import { motion } from 'framer-motion'
import { useSEO } from '@/useSEO'
import { ParticleCanvas } from '@/components/ui/particle-canvas-1'

export default function ThanksPage() {
  useSEO({
    title: 'Intel Sources — Threatbase | Open Source Threat Intelligence Credits',
    description: 'Threatbase is powered by the global cybersecurity community. Credits to Spamhaus, FireHOL, Emerging Threats, Abuse.ch, SANS DShield, and 15+ open-source threat intelligence providers.',
    path: '/thanks',
  })
  return (
    <main className="min-h-screen pt-32 pb-32 relative bg-[#0B0F19] overflow-hidden font-sans">
      <ParticleCanvas speedScale={1.5} maxParticles={600} />

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-24 text-center relative flex flex-col items-center"
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
          <p className="mt-4 text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed drop-shadow">
            Threatbase is powered by the tireless work of the global cybersecurity community. We extend our deepest gratitude to the following organizations and open-source projects for providing free, high-quality threat intelligence.
          </p>
        </motion.div>


      </div>
    </main>
  )
}
