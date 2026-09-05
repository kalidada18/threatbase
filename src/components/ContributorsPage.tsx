import { motion, useReducedMotion } from 'framer-motion'
import Leaderboard from './Leaderboard'
import { useSEO } from '../useSEO'

export default function ContributorsPage() {
  useSEO({
    title: 'Top Contributors | Threatbase Community Intel',
    description: 'View the top contributors who are defending networks globally by reporting threats.',
    path: '/contributors',
  })

  const reduce = useReducedMotion()

  return (
    <main className="bg-app min-h-[100dvh]">
      <div className="pt-28 pb-24 relative font-sans">
        <div className="grain absolute inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none z-10"></div>

        <div className="mx-auto max-w-3xl px-6 lg:px-12 relative z-10">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <div className="eyebrow mb-4">Community Intel</div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-white">
              Top contributors
            </h1>
            <p className="mt-3 text-slate-400 text-sm md:text-base max-w-lg leading-relaxed">
              The reporters whose intel keeps the feeds honest. Ranked by verified submissions.
            </p>
          </motion.div>

          {/* Single framed ledger: column labels instead of a decorative card
              header, hairline rows instead of glow tiles. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-white/[0.06] bg-[#0a0e17]/60"
          >
            <div className="grid grid-cols-[1.75rem_2.25rem_1fr_auto] sm:grid-cols-[2.25rem_2.5rem_1fr_auto] gap-3 sm:gap-4 border-b border-white/[0.06] px-2 sm:px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              <span>#</span>
              <span aria-hidden />
              <span>Contributor</span>
              <span className="text-right">Reports</span>
            </div>
            <Leaderboard />
          </motion.div>
        </div>
      </div>
    </main>
  )
}
