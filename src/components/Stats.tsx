import { useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Activity, Database, Radio } from 'lucide-react'
import { fmt, INDICATOR_ACCENT, type IndicatorKey } from '../utils'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import { Spotlight } from './motion/Spotlight'
import { useCountUp } from '../lib/useCountUp'

type MetricDef = {
  key: IndicatorKey
  label: string
  statKey: string
  img: string
  invert?: boolean
  sub: string
}

const METRICS: MetricDef[] = [
  { key: 'ip', label: 'Malicious IPs', statKey: 'total_unique_ips', img: 'ipv4icon.png', invert: true, sub: 'Active IPv4 addresses' },
  { key: 'domain', label: 'Domains', statKey: 'total_unique_domains', img: 'domain.png', sub: 'Known malicious domains' },
  { key: 'hash', label: 'File Hashes', statKey: 'total_unique_hashes', img: 'file.png', sub: 'Malware signatures' },
  { key: 'url', label: 'Malicious URLs', statKey: 'total_unique_urls', img: 'url.png', sub: 'Active phishing URLs' },
  { key: 'ipv6', label: 'IPv6 Addresses', statKey: 'total_unique_ipv6', img: 'ipv6.png', invert: true, sub: 'Active IPv6 threats' },
  { key: 'cidr', label: 'CIDR Blocks', statKey: 'total_unique_cidrs', img: 'cidrs.png', sub: 'Malicious subnets' },
]

/** Skeleton in the shape of the number it replaces (tasteskill §4.5). */
function ValueSkeleton({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-[0.75em] rounded-md bg-white/[0.07] animate-pulse align-middle ${className}`}
      role="status"
      aria-label="Loading count"
    />
  )
}

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function Stats({ statsData }: any) {
  const lastUpdated = useMemo(() => {
    const ts = statsData?.last_updated
    if (!ts) return null
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch { return null }
  }, [statsData])

  const totalTracked = useMemo(() => {
    if (!statsData) return null
    return METRICS.reduce((sum, m) => sum + (statsData[m.statKey] || 0), 0)
  }, [statsData])

  // Split metrics into featured (top 2) and compact (remaining 4)
  const featured = METRICS.slice(0, 2)
  const compact = METRICS.slice(2)

  return (
    <Section id="stats" className="overflow-hidden" containerClassName="relative z-10">

        {/* Section header — NO eyebrow (tasteskill budget) */}
        <SectionHeading
          title="Threat database at a glance"
          subtitle="Aggregated, de-duplicated indicators of compromise, refreshed continuously and ready for ingestion."
          aside={lastUpdated && (
            <div className="shrink-0 flex items-center gap-2 text-[11px] font-semibold text-slate-400 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-2">
              <Activity size={13} className="text-red-400" />
              <span className="uppercase tracking-wider">Synced</span>
              <span className="text-slate-300 font-bold">{lastUpdated}</span>
            </div>
          )}
        />

        {/* Summary strip */}
        <SummaryStrip total={totalTracked} feeds={statsData?.active_feeds ?? null} />

        {/* BENTO LAYOUT — Featured 2 large + 4 compact (tasteskill §4.7 layout diversification) */}
        <motion.div
          className="space-y-5"
          variants={gridVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
        >
          {/* Featured row: 2 large tiles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {featured.map((m) => (
              <FeaturedStatCard
                key={m.key}
                metric={m}
                target={statsData ? (statsData[m.statKey] ?? 0) : null}
              />
            ))}
          </div>

          {/* Compact row: 4 tiles. One column on the narrowest phones — at 375px a
              two-up split leaves ~65px of label width, which shreds "IPv6 Addresses"
              across three lines. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {compact.map((m) => (
              <CompactStatCard
                key={m.key}
                metric={m}
                target={statsData ? (statsData[m.statKey] ?? 0) : null}
              />
            ))}
          </div>
        </motion.div>
    </Section>
  )
}

function SummaryStrip({ total, feeds }: { total: number | null; feeds: number | null }) {
  const totalVal = useCountUp(total)
  return (
    <motion.div
      className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
    >
      <div className="glass-card relative overflow-hidden p-6 flex items-center gap-4">
        <div className="p-3 icon-chip shrink-0">
          <Database size={22} />
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total indicators tracked</div>
          <div className="font-mono text-2xl md:text-3xl font-bold text-white tabular-nums tracking-tight mt-0.5">
            {total != null ? fmt(totalVal) : <ValueSkeleton className="w-[8ch]" />}
          </div>
        </div>
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-red-500/[0.05] blur-3xl pointer-events-none" />
      </div>

      <div className="glass-card relative overflow-hidden p-6 flex items-center gap-4">
        <div className="p-3 icon-chip shrink-0">
          <Radio size={22} />
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Active intelligence feeds</div>
          <div className="font-mono text-2xl md:text-3xl font-bold text-white tabular-nums tracking-tight mt-0.5">
            {feeds != null ? fmt(feeds) : <ValueSkeleton className="w-[3ch]" />}
          </div>
        </div>
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-red-500/[0.06] blur-3xl pointer-events-none" />
      </div>
    </motion.div>
  )
}

/** Featured stat card — larger, with accent glow and more visual weight */
function FeaturedStatCard({ metric, target }: { metric: MetricDef; target: number | null }) {
  const value = useCountUp(target)
  const ready = target != null
  const accent = INDICATOR_ACCENT[metric.key]

  return (
    <Spotlight className="rounded-2xl h-full">
      <motion.div
        variants={cardVariants}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="group glass-card glass-hover relative flex flex-col overflow-hidden p-7 md:p-8 h-full"
      >
      {/* Accent glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(130% 90% at 100% 0%, ${accent}1f, transparent 55%)` }}
      />
      {/* Top accent line on hover */}
      <div
        className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ backgroundImage: `linear-gradient(90deg, transparent, ${accent}b3, transparent)` }}
      />

      {/* Header row */}
      <div className="flex items-center justify-between relative z-10">
        <span className="text-xs font-bold text-slate-400 tracking-widest uppercase group-hover:text-slate-200 transition-colors">
          {metric.label}
        </span>
        <div className="p-3 icon-chip transition-transform duration-300 group-hover:scale-105">
          <img
            src={`${import.meta.env.BASE_URL}img/${metric.img}`}
            alt=""
            aria-hidden="true"
            className={`w-7 h-7 object-contain ${metric.invert ? 'invert opacity-80' : 'drop-shadow-sm'}`}
          />
        </div>
      </div>

      {/* Value — larger for featured. Steps down on narrow phones so an
          eight-digit count cannot outrun the card. */}
      <div className="mt-8 relative z-10">
        <span className="block font-mono text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white tabular-nums leading-none">
          {ready ? fmt(value) : <ValueSkeleton className="w-[7ch]" />}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-white/[0.05] relative z-10">
        <span className="text-[11px] text-slate-400 font-medium tracking-wide group-hover:text-slate-300 transition-colors">
          {metric.sub}
        </span>
      </div>
      </motion.div>
    </Spotlight>
  )
}

/** Compact stat card — smaller, denser layout for the secondary row */
function CompactStatCard({ metric, target }: { metric: MetricDef; target: number | null }) {
  const value = useCountUp(target)
  const ready = target != null
  const accent = INDICATOR_ACCENT[metric.key]

  return (
    <Spotlight className="rounded-2xl h-full">
      <motion.div
        variants={cardVariants}
        whileHover={{ y: -3 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="group glass-card glass-hover relative flex flex-col overflow-hidden p-5 h-full"
      >
      {/* Top accent line on hover */}
      <div
        className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ backgroundImage: `linear-gradient(90deg, transparent, ${accent}99, transparent)` }}
      />

      {/* Icon + label */}
      <div className="flex items-center gap-3 relative z-10">
        <div className="p-2 icon-chip shrink-0">
          <img
            src={`${import.meta.env.BASE_URL}img/${metric.img}`}
            alt=""
            aria-hidden="true"
            className={`w-5 h-5 object-contain ${metric.invert ? 'invert opacity-80' : 'drop-shadow-sm'}`}
          />
        </div>
        <span className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">
          {metric.label}
        </span>
      </div>

      {/* Value */}
      <div className="mt-4 relative z-10">
        <span className="block font-mono text-3xl font-bold tracking-tight text-white tabular-nums leading-none">
          {ready ? fmt(value) : <ValueSkeleton className="w-[5ch]" />}
        </span>
      </div>

      {/* Sub */}
      <div className="mt-3 pt-3 border-t border-white/[0.05] relative z-10">
        <span className="text-[10px] text-slate-400 font-medium tracking-wide group-hover:text-slate-300 transition-colors">
          {metric.sub}
        </span>
      </div>
      </motion.div>
    </Spotlight>
  )
}
