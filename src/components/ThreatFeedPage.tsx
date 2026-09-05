import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import Container from './layout/Container'
import Section from './layout/Section'
import LiveThreatIntel from './LiveThreatIntel'
import FeedHealth from './FeedHealth'
import Stats from './Stats'
import Feeds from './Feeds'
import Analytics from './Analytics'
import { useSEO } from '@/useSEO'

export default function ThreatFeedPage({ statsData, feedVersion }: { statsData: any; feedVersion: number }) {
  useSEO({
    title: 'Threat Feed | Threatbase',
    description: 'Live threat database stats, downloadable IOC blocklists for IPs, domains, hashes, URLs, IPv6 and CIDRs, and growth analytics — refreshed continuously.',
    path: '/threatfeed',
  })

  const reduce = useReducedMotion()

  return (
    <IsoPageShell color="207, 23, 51" contentClassName="w-full px-0">
      <main id="main-content" className="w-full">
        {/* Header — px-0 above lets the sections run full-bleed, so the header
            carries its own gutters via Container. */}
        <Container width="wide" className="pt-4 pb-10">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="eyebrow mb-6">Live Intelligence</div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white mb-6">
              Threat <span className="text-liquid-red">Feed</span>
            </h1>
            <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
              Database totals, downloadable blocklists, and how the threat landscape is growing.
            </p>
          </motion.div>
        </Container>

        <Stats statsData={statsData} />
        <Feeds statsData={statsData} />
        <FeedHealth />
        <Analytics statsData={statsData} feedVersion={feedVersion} />

        {/* Live intel panel — the old hero threat-map HUD, now a closing
            garnish after the chart. The map canvas was removed; this is lean. */}
        <Section id="live" spacing="md">
          <LiveThreatIntel />
        </Section>
      </main>
    </IsoPageShell>
  )
}
