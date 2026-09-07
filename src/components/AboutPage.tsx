import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import IsoPageShell from './layout/IsoPageShell'
import HowItWorks from './HowItWorks'
import { ShieldCheck, ArrowRight, Github, Database, Radar, Zap } from 'lucide-react'
import { useSEO } from '@/useSEO'
import { Typewriter } from './motion/Typewriter'

export default function AboutPage() {
  useSEO({
    title: 'About Threatbase | Community-Driven Threat Intelligence',
    description: 'Learn about Threatbase, a community-driven threat intelligence platform for researchers, analysts, and cybersecurity enthusiasts. Discover IOCs, track threats, and transform security data into actionable intelligence.',
    path: '/about',
  })

  const prefersReducedMotion = useReducedMotion()

  const features = [
    {
      icon: <Database className="h-7 w-7" strokeWidth={1.8} />,
      title: "Discover IOCs",
      desc: "Access verified indicators of compromise to proactively defend networks.",
      large: true
    },
    {
      icon: <Radar className="h-7 w-7" strokeWidth={1.8} />,
      title: "Track Threats",
      desc: "Monitor emerging threat actors, malware campaigns, and attack vectors.",
      large: false
    },
    {
      icon: <Zap className="h-7 w-7" strokeWidth={1.8} />,
      title: "Actionable Intel",
      desc: "Transform raw security data and logs into clear, actionable intelligence.",
      large: false
    }
  ]

  const stats = [
    { value: "6+", label: "IOC Categories" },
    { value: "Scheduled", label: "Feed Updates" },
    { value: "Open", label: "Source & Free" },
    { value: "Global", label: "Community" },
  ]

  return (
    <IsoPageShell color="207, 23, 51">

        {/* Top Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="eyebrow mb-6">
            About Threatbase
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white mb-6">
            Community-Driven <br />
            <span className="text-liquid-red">
              Threat Intelligence.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed mb-8">
            IOCs, threat actors, and vulnerabilities, verified by the community and free to consume.
          </p>

          <div className="inline-block p-[1px] rounded-2xl bg-gradient-to-r from-red-500/40 to-red-800/40 mb-16 shadow-glow-ruby">
            <div className="px-8 py-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl">
              <span className="font-mono text-lg text-metal tracking-wide">
                <span className="text-red-500">&gt;</span>{' '}
                <Typewriter text="Open data, community verified." speed={42} startDelay={700} />
              </span>
            </div>
          </div>
        </motion.div>

        {/* Stats band */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 max-w-4xl mx-auto w-full mb-24"
        >
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-widest text-slate-400 font-semibold">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Feature Grid (Asymmetric Bento) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {features.map((f, i) => (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + (i * 0.1), duration: 0.5 }}
              key={f.title}
              className={`group glass-card glass-hover flex flex-col justify-start p-8 text-left ${f.large ? 'md:col-span-2' : ''}`}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(120% 90% at 100% 0%, rgba(207, 23, 51, 0.08), transparent 55%)` }}
              />
              <div className="icon-chip w-14 h-14 mb-6 relative z-10 transition-transform duration-300 group-hover:scale-105">
                {f.icon}
              </div>

              <h3 className="text-xl font-bold text-white mb-3 tracking-tight group-hover:text-red-50 transition-colors relative z-10">
                {f.title}
              </h3>

              <p className="text-slate-400 font-medium leading-relaxed group-hover:text-slate-300 transition-colors relative z-10">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* How it works — full section with its own heading and rhythm */}
        <div className="w-full max-w-5xl mx-auto">
          <HowItWorks />
        </div>

        {/* CTA */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative max-w-4xl mx-auto w-full overflow-hidden rounded-[2rem] glass-card p-10 md:p-14 text-center shadow-glass-lux"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-red-900/10 pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-4">
              Join the defense.
            </h2>
            <p className="text-slate-300 max-w-xl mx-auto mb-8 leading-relaxed">
              Every report strengthens the feed. Submit malicious indicators, explore the
              data, and help protect networks around the world.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/report"
                className="group inline-flex items-center gap-2 px-7 py-3 rounded-2xl bg-red-600 text-white font-semibold text-sm transition-all hover:bg-red-500 shadow-glow-ruby"
              >
                <ShieldCheck className="h-4 w-4" />
                Report a Threat
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="https://github.com/kalidada18/threatbase"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl border border-platinum-400/20 bg-white/[0.03] backdrop-blur-md text-platinum-300 font-semibold text-sm transition-all hover:border-platinum-400/40 hover:bg-white/[0.06] hover:text-white"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </a>
            </div>
          </div>
        </motion.div>

    </IsoPageShell>
  )
}
