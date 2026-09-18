import { lazy, Suspense, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Activity } from 'lucide-react'
import IsoPageShell from './layout/IsoPageShell'
import Container from './layout/Container'
import Section from './layout/Section'
import LiveThreatIntel from './LiveThreatIntel'
import Stats from './Stats'
import Feeds from './Feeds'
import MispIntegration from './MispIntegration'
import { ProBand } from './blocks/LandingSections'
import { EASE_EXPO } from './motion/primitives'
import { fmt } from '@/utils'
import { useSEO } from '@/useSEO'

// FeedHealth and Analytics are the only users of recharts on this route
// (~437kB chunk). Lazy-loading them keeps the tables + feeds (which paint
// first) independent of the chart libraries.
const FeedHealth = lazy(() => import('./FeedHealth'))
const Analytics = lazy(() => import('./Analytics'))

const chartSectionSkeleton = (
  <div className="h-[520px] w-full animate-pulse" aria-hidden="true">
    <div className="mx-auto max-w-7xl px-6 pt-16">
      <div className="h-10 w-72 rounded-lg bg-white/[0.05]" />
      <div className="mt-4 h-4 w-full max-w-xl rounded bg-white/[0.04]" />
      <div className="mt-10 h-[360px] rounded-2xl bg-white/[0.04]" />
    </div>
  </div>
)

export default function ThreatFeedPage({ statsData, feedVersion, statsFailed, onRetryStats }: { statsData: any; feedVersion: number; statsFailed?: boolean; onRetryStats?: () => void }) {
  useSEO({
    title: 'Threat Feed | Threatbase',
    description: 'Live threat database stats, downloadable IOC blocklists for IPs, domains, hashes, URLs, IPv6 and CIDRs, and growth analytics, refreshed continuously.',
    path: '/threatfeed',
  })

  const reduce = useReducedMotion()

  // Header telemetry mirrors the ledger in Stats: real fields only, skeleton
  // (never a fabricated zero) until the data lands.
  const corpusTotal = useMemo(() => {
    if (!statsData) return null
    const keys = ['total_unique_ips', 'total_unique_domains', 'total_unique_hashes', 'total_unique_urls', 'total_unique_ipv6', 'total_unique_cidrs']
    return keys.reduce((acc, k) => acc + (Number(statsData[k]) || 0), 0)
  }, [statsData])
  const feeds = statsData?.active_feeds ?? null

  return (
    <IsoPageShell contentClassName="w-full px-0">
      <main id="main-content" className="w-full">
        {/* Masthead — editorial split instead of a centered hero: identity on
            the left, a live telemetry ledger on the right. The section below
            is dense and curated, so the header has to match that weight. */}
        <Container className="pt-10 pb-4">
          <motion.header
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_EXPO }}
          >
            <div className="eyebrow mb-6">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-red-400/60 ${reduce ? '' : 'animate-ping'}`} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Live Intelligence
            </div>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
              <div className="max-w-2xl">
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white">
                  Threat <span className="text-liquid-red">Feed</span>
                </h1>
                <p className="mt-5 text-base md:text-lg text-slate-400 leading-relaxed max-w-xl">
                  Database totals, downloadable blocklists, and how the threat
                  landscape is growing — refreshed continuously from
                  {feeds != null ? ` ${fmt(feeds)} live sources.` : ' live sources.'}
                </p>
              </div>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: EASE_EXPO }}
                className="glass-card flex items-stretch divide-x divide-white/[0.06] self-start lg:self-auto"
              >
                <div className="px-5 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Indicators</div>
                  <div className="mt-1.5 font-mono text-2xl font-bold leading-none tabular-nums text-white">
                    {corpusTotal != null ? fmt(corpusTotal) : (
                      <span className="inline-block h-[0.75em] w-[7ch] rounded-md bg-white/[0.07] animate-pulse align-middle" role="status" aria-label="Loading count" />
                    )}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Feed build</div>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-2xl font-bold leading-none tabular-nums text-white">
                    <Activity size={14} className="text-red-400" aria-hidden="true" />
                    v{feedVersion}
                  </div>
                </div>
              </motion.div>
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none mt-10 h-px w-full bg-gradient-to-r from-white/[0.09] via-white/[0.04] to-transparent"
            />
          </motion.header>
        </Container>

        <Stats statsData={statsData} />
        <Feeds statsData={statsData} />
        <MispIntegration />
        <Suspense fallback={chartSectionSkeleton}>
          <FeedHealth />
        </Suspense>
        <Suspense fallback={chartSectionSkeleton}>
          <Analytics statsData={statsData} feedVersion={feedVersion} statsFailed={statsFailed} onRetryStats={onRetryStats} />
        </Suspense>

        {/* Live intel panel — the old hero threat-map HUD, now a closing
            garnish after the chart. The map canvas was removed; this is lean. */}
        <Section id="live" spacing="md">
          <LiveThreatIntel />
        </Section>

        {/* The one CTA this page lacked: visitors who just browsed the free
            feeds are exactly the audience for the Pro band. */}
        <ProBand />
      </main>
    </IsoPageShell>
  )
}
