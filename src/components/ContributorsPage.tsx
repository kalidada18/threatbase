import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Leaderboard from './Leaderboard'
import { useSEO } from '../useSEO'

export default function ContributorsPage() {
  useSEO({
    title: 'Top Contributors | Threatbase Community Intel',
    description: 'The community reporters whose sightings power the Threatbase feeds, ranked by verified submissions. See who is defending networks globally — and join them.',
    path: '/contributors',
  })

  const reduce = useReducedMotion()

  return (
    <main className="bg-app min-h-[100dvh]">
      <div className="pt-28 pb-24 relative font-sans">
        <div className="grain fixed inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none z-10" aria-hidden />

        {/* Local light field behind the panels. Glass only reads as glass when
            there is something behind it to bend — the page-level ambient in
            body::before sits higher and fainter than the panel edges, so the
            frosted surfaces would otherwise resolve to flat grey. Static and
            pointer-events-none, so it costs no scroll frames. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[34rem] overflow-hidden">
          <div className="absolute left-1/2 top-10 h-80 w-[min(52rem,92vw)] -translate-x-1/2 rounded-full bg-red-500/[0.06] blur-3xl" />
          <div className="absolute left-[62%] top-44 h-64 w-[34rem] rounded-full bg-platinum-400/[0.035] blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl px-6 lg:px-12 relative z-10">
          {/* Asymmetric header — copy anchored left, refresh cadence as the
              counterweight. No centred hero. */}
          <div className="mb-10 grid gap-6 lg:mb-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="eyebrow mb-4">Community Intel</div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-white">
                Top contributors
              </h1>
              <p className="mt-5 max-w-[54ch] text-sm md:text-base leading-relaxed text-slate-400">
                Every indicator in the feeds started as one person deciding it was worth reporting.
                Ranked by verified submissions.
              </p>
            </motion.div>

            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="flex items-center gap-3 lg:pb-2"
            >
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-red-500/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-platinum-400">
                Live &middot; refreshes every 30s
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <Leaderboard />
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-12 flex justify-center lg:justify-start"
          >
            <Link
              to="/report"
              className="group inline-flex items-center gap-3 border-b border-red-500/30 pb-1 text-sm font-bold uppercase tracking-[0.15em] text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
            >
              Report a threat — join the board
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </div>
    </main>
  )
}
