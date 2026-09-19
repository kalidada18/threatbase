import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Trophy, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSEO } from '@/useSEO'
import db from '@/lib/dbClient'

export default function ThanksPage() {
  const [topReporter, setTopReporter] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    async function fetchTopReporter() {
      if (!db) return
      try {
        const { data, error } = await db
          .from('top_contributors')
          .select('reporter_alias')
          .order('reports_count', { ascending: false })
          .limit(1)
          .abortSignal(AbortSignal.timeout(12_000))
          .single()
        if (!error && data) setTopReporter(data.reporter_alias)
      } catch (err) {
        console.error('Failed to fetch top reporter:', err)
      }
    }
    fetchTopReporter()
  }, [])

  useSEO({
    title: 'Community & Contributors | Threatbase',
    description: 'Threatbase is powered by the global infosec community: aggregated, validated and maintained open-source threat intelligence, plus community reports.',
    path: '/thanks',
  })

  return (
    <main className="min-h-[100dvh] pt-28 md:pt-32 pb-32 relative bg-app overflow-hidden font-sans selection:bg-red-500/30">
      {/* Ruby ambient wash. Used to be a Three.js aurora shader on desktop and
          this gradient everywhere else; the gradient was already carrying the
          mood at zero cost, so the shader went. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 60% at 50% -10%, rgba(207,23,51,0.18), transparent 60%), radial-gradient(80% 50% at 50% 0%, rgba(174,182,196,0.06), transparent 65%)',
        }}
      />
      {/* Readability overlay + texture on top of the wash (matches --app-bg #080b12) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#080b12]/60 via-[#080b12]/90 to-[#080b12] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-px bg-gradient-to-r from-transparent via-red-500/25 to-transparent" />

      <div className="mx-auto max-w-5xl px-6 lg:px-12 relative z-10">

        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center flex flex-col items-center"
        >
          <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-[10rem] font-black tracking-tighter text-white leading-[0.9]">
            Community<br /><span className="text-metal">Powered.</span>
          </h1>

          <p className="mt-8 text-slate-400 text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            Threatbase aggregates, validates and maintains open threat intelligence, enriched by community reports.
          </p>
        </motion.div>

        {/* Top contributor highlight */}
        {topReporter && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className="mt-16 max-w-md mx-auto"
          >
            <div className="glass-card flex flex-col items-center justify-center px-8 py-10 text-center overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(207, 23, 51, 0.1), transparent 60%)' }}
              />
              <div className="relative mb-5 shrink-0 rounded-full border border-red-500/25 bg-red-500/[0.08] p-3.5 shadow-glow-ruby">
                <Trophy className="h-5 w-5 text-red-400" />
              </div>
              <div className="relative text-[10px] font-bold uppercase tracking-[0.24em] text-platinum-400">Top Contributor</div>
              <div className="relative mt-3 font-mono text-2xl text-metal tracking-tight">@{topReporter}</div>
            </div>
          </motion.div>
        )}

        {/* Footer note + CTA */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-32 text-center"
        >
          <Link
            to="/report"
            className="group inline-flex items-center gap-3 border-b border-red-500/30 pb-1 text-sm font-bold uppercase tracking-[0.15em] text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
          >
            Report a Threat
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

      </div>
    </main>
  )
}
