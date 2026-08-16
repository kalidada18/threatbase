import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useSEO } from '@/useSEO'

const SECTIONS = [
  {
    title: 'Target Integrity',
    body: 'Only report public IP addresses that demonstrate genuine malicious activity. Do not report private networks (e.g. 192.168.x.x), loopback addresses, or legitimate DNS, CDN, and cloud infrastructure unless it is actively being weaponized against you.',
    points: [
      'Verify the indicator is a routable, public IP address.',
      'Private, reserved, and whitelisted ranges are automatically blocked.',
      'Avoid reporting shared infrastructure that affects innocent users.',
    ],
  },
  {
    title: 'Accuracy & Evidence',
    body: 'Every submission must include clear, concise evidence or reasoning in the description field. Quality intelligence depends on accurate, well-documented reports the community can trust and act upon.',
    points: [
      'Describe the observed behaviour (e.g. SSH brute force, C2 callback, scanning).',
      'Include relevant timestamps, ports, or log excerpts where possible.',
      'Choose the most accurate threat category for the activity.',
    ],
  },
  {
    title: 'No Personal Information',
    body: 'Do not include Personally Identifiable Information (PII) in your reports unless it is directly part of the threat indicator, for example a phishing email address operated by an attacker.',
    points: [
      'Never submit innocent third-party personal data.',
      'Redact sensitive internal details from log evidence.',
      'PII unrelated to the threat will be removed or rejected.',
    ],
  },
  {
    title: 'Prohibited Conduct',
    body: 'The platform exists to defend networks, not to harm them. Deliberate abuse of the reporting system undermines the entire community and will not be tolerated.',
    points: [
      'No false reports, manufactured false positives, or targeted harassment.',
      'No submitting competitors, personal grudges, or retaliatory listings.',
      'No automated mass submissions or attempts to game contributor rankings.',
    ],
  },
  {
    title: 'Moderation & Enforcement',
    body: 'Submissions are subject to review. We reserve the right to edit, de-list, or remove any report, and to restrict or permanently ban accounts that violate this policy.',
    points: [
      'Violations may result in an immediate, permanent account ban.',
      'Repeatedly inaccurate reports reduce contributor trust.',
      'Listings can be disputed or corrected through your profile.',
    ],
  },
]

export default function PolicyPage() {
  const prefersReducedMotion = useReducedMotion()

  useSEO({
    title: 'Community Reporting Policy | Threatbase',
    description: 'The rules and standards for submitting malicious IP addresses to the Threatbase community intelligence feed. Report accurately, ethically, and responsibly.',
    path: '/policy',
  })

  return (
    <main className="min-h-[100dvh] bg-[#050505] font-sans text-slate-300 selection:bg-red-500/30 pt-32 pb-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-12 relative z-10">
        
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-24"
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1 text-[10px] font-bold tracking-widest text-red-400 uppercase">
            Community Standards
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white leading-[0.95] mb-8 max-w-4xl">
            Reporting Policy.
          </h1>

          <div className="flex flex-col md:flex-row md:items-end gap-8 border-b border-white/5 pb-12">
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl leading-relaxed">
              Threatbase is powered by the community. These standards keep the intelligence
              feed accurate, ethical, and trustworthy. By submitting a report, you agree to
              abide by the rules below.
            </p>
            <div className="font-mono text-xs text-slate-500 shrink-0">
              Effective Date: <br className="hidden md:block" />
              <span className="text-slate-300 mt-1 block">June 12, 2026</span>
            </div>
          </div>
        </motion.div>

        {/* Policy sections - Editorial Split Layout */}
        <div className="flex flex-col">
          {SECTIONS.map((s, i) => (
            <motion.section
              key={s.title}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6 }}
              className="group flex flex-col md:flex-row gap-8 lg:gap-24 py-16 border-b border-white/5"
            >
              <div className="md:w-1/3 shrink-0">
                <div className="text-sm font-mono text-red-500 mb-4">
                  0{i + 1}
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  {s.title}
                </h2>
              </div>

              <div className="md:w-2/3">
                <p className="text-lg text-slate-300 leading-relaxed mb-8">
                  {s.body}
                </p>
                <ul className="space-y-4">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-4 text-slate-400">
                      <div className="mt-2 h-1 w-1 shrink-0 rounded-full bg-red-500/50" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.section>
          ))}
        </div>

        {/* Disclaimer + CTA */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-24 max-w-3xl"
        >
          <div className="mb-12 border-l-2 border-red-500/50 pl-6">
            <p className="text-sm text-slate-400 leading-relaxed">
              <strong className="text-white">Disclaimer.</strong> Threat
              intelligence is provided on an “as is” basis and may contain inaccuracies.
              Listings reflect community submissions and should be independently verified
              before being used for blocking or enforcement decisions. Review our{' '}
              <Link to="/terms" className="text-white hover:text-red-400 underline decoration-white/20 underline-offset-4 transition-colors">Terms</Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-white hover:text-red-400 underline decoration-white/20 underline-offset-4 transition-colors">Privacy Policy</Link>{' '}
              for full details.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Link
              to="/report"
              className="inline-flex h-12 items-center justify-center rounded-none bg-white px-8 text-sm font-bold tracking-wide text-black transition-transform hover:bg-slate-200 active:scale-95"
            >
              Submit a Report
            </Link>
            <Link
              to="/about"
              className="inline-flex h-12 items-center justify-center px-8 text-sm font-bold tracking-wide text-white transition-colors hover:text-red-400"
            >
              Learn More →
            </Link>
          </div>
        </motion.div>

      </div>
    </main>
  )
}
