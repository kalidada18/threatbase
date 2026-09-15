import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, ShieldCheck } from 'lucide-react'
import { fmt, INDICATOR_ACCENT, type IndicatorKey } from '../utils'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
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

/**
 * Coverage ledger: one headline total, one composition bar, one legend table.
 *
 * The six-tile bento this replaces gave every indicator type the same visual
 * weight, which is the opposite of the claim worth making — domains and hashes
 * ARE the corpus, IPv6 and CIDR are a rounding error. Composition is the
 * product fact, so the section is built as a single meter plus the rows that
 * read it. Colour comes from DATA_RAMP in magnitude order (utils.ts), so rank
 * and hue always agree.
 */
export default function Stats({ statsData }: any) {
  const lastUpdated = useMemo(() => {
    const ts = statsData?.last_updated
    if (!ts) return null
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch { return null }
  }, [statsData])

  // Rows sorted by volume so the ledger reads top-down as "what dominates".
  // Before data lands, METRICS order stands in and the values render as
  // skeletons; no zeros, no invented numbers.
  const { rows, total } = useMemo(() => {
    if (!statsData) return { rows: METRICS.map((m) => ({ m, value: null as number | null, share: 0 })), total: null }
    const withValues = METRICS.map((m) => ({ m, value: (statsData[m.statKey] || 0) as number }))
    const sum = withValues.reduce((acc, r) => acc + r.value, 0)
    return {
      rows: withValues
        .sort((a, b) => b.value - a.value)
        .map((r) => ({ ...r, share: sum ? (r.value / sum) * 100 : 0 })),
      total: sum,
    }
  }, [statsData])

  const totalVal = useCountUp(total)
  const feeds = statsData?.active_feeds ?? null

  return (
    <Section id="stats" className="overflow-hidden" containerClassName="relative z-10">
      <SectionHeading
        title="What is in the database"
        subtitle="Every indicator here is aggregated, de-duplicated, and ready to ingest. This is the whole corpus, by type."
        aside={lastUpdated && (
          <div className="shrink-0 flex items-center gap-2 text-[11px] font-semibold text-slate-400 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-2">
            <Activity size={13} className="text-red-400" />
            <span className="uppercase tracking-wider">Synced</span>
            <span className="text-slate-300 font-bold">{lastUpdated}</span>
          </div>
        )}
      />

      <motion.div
        className="glass-card relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-red-500/[0.06] blur-3xl"
        />

        {/* Headline: the two numbers a defender quotes. */}
        <div className="relative flex flex-wrap items-end justify-between gap-x-12 gap-y-6 px-6 pt-7 pb-6 md:px-9 md:pt-9">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Indicators tracked</div>
            <div className="mt-1.5 font-mono text-4xl font-bold leading-none tracking-tight text-white tabular-nums sm:text-5xl md:text-6xl">
              {total != null ? fmt(totalVal) : <ValueSkeleton className="w-[9ch]" />}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 md:flex-col md:items-end md:gap-0">
            <div className="md:text-right">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Live sources</div>
              <div className="mt-1.5 font-mono text-2xl font-bold leading-none tracking-tight text-white tabular-nums md:text-3xl">
                {feeds != null ? fmt(feeds) : <ValueSkeleton className="w-[3ch]" />}
              </div>
            </div>
            {/* The headline proof, riding next to the IOC count: the corpus is a
                registered default feed in MISP. Links to the Use-in-MISP card. */}
            <Link
              to="/threatfeed#misp"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/[0.08] px-3 py-1 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
            >
              <ShieldCheck size={12} className="text-red-400" aria-hidden />
              <span className="uppercase tracking-wider">MISP default feed</span>
            </Link>
          </div>
        </div>

        {/* The meter: one stacked bar, segments in ledger order. Decoration for
            screen readers — every segment's number is in the table below. */}
        <div aria-hidden className="flex h-2.5 w-full overflow-hidden bg-white/[0.05]">
          {rows.map(({ m, share }) => (
            <span
              key={m.key}
              className={`h-full transition-[width,opacity] duration-1000 ease-out ${total == null ? 'animate-pulse' : ''}`}
              style={{
                width: total == null ? `${100 / rows.length}%` : `${share}%`,
                backgroundColor: INDICATOR_ACCENT[m.key],
                opacity: total == null ? 0.25 : 1,
              }}
            />
          ))}
        </div>

        {/* The legend: same order, same colours, with the actual counts. */}
        <ul className="divide-y divide-white/[0.05]">
          {rows.map(({ m, value, share }) => (
            <LedgerRow key={m.key} metric={m} value={value} share={share} />
          ))}
        </ul>
      </motion.div>
    </Section>
  )
}

function LedgerRow({ metric, value, share }: { metric: MetricDef; value: number | null; share: number }) {
  const count = useCountUp(value)
  return (
    <li className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white/[0.02] md:gap-6 md:px-9">
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: INDICATOR_ACCENT[metric.key] }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white md:text-base">{metric.label}</span>
        <span className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">{metric.sub}</span>
      </span>
      <span className="shrink-0 font-mono text-base font-bold tabular-nums text-white md:text-xl">
        {value != null ? fmt(count) : <ValueSkeleton className="w-[6ch]" />}
      </span>
      <span className="w-[4.5rem] shrink-0 text-right font-mono text-xs tabular-nums text-slate-400 md:text-sm">
        {value != null ? `${share < 0.1 && share > 0 ? '<0.1' : share.toFixed(1)}%` : ''}
      </span>
    </li>
  )
}
