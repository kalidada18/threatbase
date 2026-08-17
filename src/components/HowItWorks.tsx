import { motion } from 'framer-motion'
import { Search, ShieldCheck, Share2 } from 'lucide-react'
import Section from './layout/Section'

const steps = [
  {
    icon: Search,
    title: 'Scan & Investigate',
    desc: 'Query any IP, domain, URL, or hash against aggregated threat feeds and community reports in real time.',
  },
  {
    icon: ShieldCheck,
    title: 'Analyze Threats',
    desc: 'Get severity scoring, geolocation data, ISP attribution, and corroborating evidence from multiple feeds.',
  },
  {
    icon: Share2,
    title: 'Defend Together',
    desc: 'Report new threats, download blocklists, and deploy high-performance feeds to your firewall and SIEM.',
  },
]

const lineVariants = {
  hidden: { scaleY: 0 },
  show: { scaleY: 1, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
}

const stepVariants = {
  hidden: { opacity: 0, x: -20 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.15 + i * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
}

export default function HowItWorks() {
  return (
    <Section id="how-it-works" className="overflow-hidden" containerClassName="relative z-10">
      <motion.div
        className="mb-12 max-w-2xl"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
          How it works
        </h2>
        <p className="mt-3 text-slate-400 text-base md:text-lg font-medium max-w-xl leading-relaxed">
          A simple loop that turns individual observations into collective defense.
        </p>
      </motion.div>

      {/* Vertical timeline — unique layout family (no card grid) */}
      <div className="relative max-w-3xl">
        {/* Connecting line */}
        <motion.div
          className="absolute left-[23px] md:left-[27px] top-6 bottom-6 w-px bg-gradient-to-b from-red-500/40 via-white/10 to-transparent origin-top"
          variants={lineVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        />

        <div className="relative space-y-10 md:space-y-14">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.title}
                custom={i}
                variants={stepVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                className="group relative flex gap-5 md:gap-7"
              >
                {/* Step indicator */}
                <div className="relative z-10 flex flex-col items-center shrink-0">
                  <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_-6px_rgba(207,23,51,0.15)] group-hover:border-red-500/30 group-hover:shadow-[0_0_24px_-4px_rgba(207,23,51,0.25)] transition-all duration-300">
                    <Icon className="h-5 w-5 md:h-6 md:w-6 text-red-400 group-hover:text-red-300 transition-colors" strokeWidth={1.8} />
                  </div>
                </div>

                {/* Content */}
                <div className="pt-1.5 md:pt-2.5">
                  <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight group-hover:text-red-50 transition-colors">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm md:text-base text-slate-400 leading-relaxed max-w-lg group-hover:text-slate-300 transition-colors">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
