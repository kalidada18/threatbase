import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { Inbox, Filter, Upload, ShieldCheck, Repeat } from 'lucide-react'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import './HowItWorks.css'

/**
 * How it works, as the system diagram it always wanted to be: one rail, four
 * stages, each stage listing its own components as nodes.
 *
 * The stages below are the real pipeline, so the nodes are the actual
 * artifacts: refang and classify, de-dupe, the committed files, the ways out.
 * A single packet carries one report the length of the rail; each stage's badge
 * flashes on arrival and its nodes light in sequence. Layout and motion live in
 * HowItWorks.css, so this file stays the content.
 */
const STAGES = [
  {
    name: 'Collect',
    icon: Inbox,
    desc: 'Public source feeds and community reports arrive as raw indicator lines.',
    nodes: ['public source feeds', 'community reports'],
  },
  {
    name: 'Reduce',
    icon: Filter,
    desc: 'Lines are refanged, typed, and merged into one record per indicator.',
    nodes: ['refang + classify', 'de-duplicate', 'expire stale entries'],
  },
  {
    name: 'Publish',
    icon: Upload,
    desc: 'Each run commits the lists and a stats file back to the open repo.',
    nodes: ['ioc/*.txt', 'stats.json', 'chunks + release mirror'],
  },
  {
    name: 'Consume',
    icon: ShieldCheck,
    desc: 'Scan one indicator here, call the API, or pull the raw list on a timer.',
    nodes: ['scan console', 'REST API', 'firewall, IDS, SIEM'],
  },
]

export default function HowItWorks() {
  return (
    <Section id="how-it-works" className="overflow-hidden" containerClassName="relative z-10">
      <SectionHeading
        eyebrow="The pipeline"
        title="How the system works"
        subtitle="The path one report takes to reach your firewall. Four stages, one direction."
      />

      <div className="hiw-arch">
        {/* The rail is one continuous wire behind the four badges. */}
        <div className="hiw-rail" aria-hidden>
          <span className="hiw-rail-track" />
          <span className="hiw-rail-packet">
            <span className="hiw-packet-tail" />
            <span className="hiw-packet-head" />
          </span>
        </div>

        {STAGES.map((s, i) => {
          const Icon = s.icon
          return (
            /* --hiw-i drives every animation delay in the CSS: stage i owns
               quarter i of the cycle. */
            <motion.div
              className="hiw-stage"
              key={s.name}
              style={{ '--hiw-i': i } as CSSProperties}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{
                duration: 0.5,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              }}
            >
              <div className="hiw-badge">
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              </div>

              <div className="hiw-card glass-card glass-hover">
                <span className="hiw-index" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-lg font-bold tracking-tight text-white">{s.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.desc}</p>

                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {s.nodes.map((n, ni) => (
                    <li className="hiw-node" key={n} style={{ '--hiw-n': ni } as CSSProperties}>
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="hiw-foot">
        <span className="hiw-foot-pill">
          <Repeat size={14} aria-hidden />
          The rebuild runs on a schedule. Every publish is a commit, so you can diff what changed and when.
        </span>
      </div>
    </Section>
  )
}
