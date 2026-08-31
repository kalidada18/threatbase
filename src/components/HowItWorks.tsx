import { useRef } from 'react'
import { motion, useScroll, useSpring, type Variants } from 'framer-motion'
import { Search, ShieldCheck, Share2 } from 'lucide-react'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import { EASE_EXPO } from './motion/primitives'

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

const stepVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.15 + i * 0.15, duration: 0.6, ease: EASE_EXPO },
  }),
}

export default function HowItWorks() {
  const timelineRef = useRef<HTMLDivElement>(null)

  // The connecting line draws itself as the timeline scrolls through the
  // viewport — scroll storytelling instead of a one-shot entrance.
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ['start 0.85', 'end 0.45'],
  })
  const lineScale = useSpring(scrollYProgress, { stiffness: 90, damping: 24 })

  return (
    <Section id="how-it-works" className="overflow-hidden" containerClassName="relative z-10">
      <SectionHeading
        title="How it works"
        subtitle="A simple loop that turns individual observations into collective defense."
      />

      {/* Vertical timeline — unique layout family (no card grid) */}
      <div ref={timelineRef} className="relative max-w-3xl">
        {/* Track + scroll-linked fill */}
        <div className="absolute left-[23px] md:left-[27px] top-6 bottom-6 w-px bg-white/[0.07]" />
        <motion.div
          className="absolute left-[23px] md:left-[27px] top-6 bottom-6 w-px origin-top bg-gradient-to-b from-red-500/70 via-red-500/30 to-transparent"
          style={{ scaleY: lineScale }}
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
                  <div className="icon-chip h-12 w-12 md:h-14 md:w-14 shadow-[0_0_20px_-6px_rgba(207,23,51,0.15)] group-hover:border-red-500/30 group-hover:shadow-[0_0_24px_-4px_rgba(207,23,51,0.25)] group-hover:scale-105 transition-all duration-300">
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
