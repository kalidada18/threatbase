import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import { fmt, getBaseUrl, getDomainUrl, getHashUrl, INDICATOR_ACCENT, feedPath } from '../utils'

/**
 * One row per published list, in download order. `statKey` is the stats.json
 * field that counts the lines in that file, so every row quotes the real size
 * of the thing you are about to download.
 */
export const feeds = [
  {
    name: 'IPv4 Blocklist',
    desc: 'Malicious IPv4 addresses for firewall and IDS blocklists.',
    file: 'threatbase-ip.txt',
    accent: INDICATOR_ACCENT.ip,
    statKey: 'total_unique_ips',
  },
  {
    name: 'Domain Blocklist',
    desc: 'Phishing and C2 domains for DNS sinkholing.',
    file: 'threatbase-domain.txt',
    accent: INDICATOR_ACCENT.domain,
    statKey: 'total_unique_domains',
  },
  {
    name: 'Hash Blocklist',
    desc: 'SHA-256 malware hashes for endpoint detection and AV.',
    file: 'threatbase-hash.txt',
    accent: INDICATOR_ACCENT.hash,
    statKey: 'total_unique_hashes',
  },
  {
    name: 'URL Blocklist',
    desc: 'Malicious URLs for web proxies and gateways.',
    file: 'threatbase-url.txt',
    accent: INDICATOR_ACCENT.url,
    statKey: 'total_unique_urls',
  },
  {
    name: 'IPv6 Blocklist',
    desc: 'Malicious IPv6 addresses for firewalls that route v6.',
    file: 'threatbase-ipv6.txt',
    accent: INDICATOR_ACCENT.ipv6,
    statKey: 'total_unique_ipv6',
  },
  {
    name: 'CIDR Blocklist',
    desc: 'Malicious IPv4 and IPv6 subnets, aggregated to CIDR ranges.',
    file: 'threatbase-cidr.txt',
    accent: INDICATOR_ACCENT.cidr,
    statKey: 'total_unique_cidrs',
  },
] as const

type Feed = typeof feeds[number]

/**
 * Published lists as a release manifest: filename, size, one download per row.
 *
 * The card grid this replaces printed the same filled red button six times, so
 * the page had six primary actions and no shape. A row list carries the same
 * links, adds the line count of each file, and spends the accent colour on the
 * type rule instead of on six buttons.
 */
export default function Feeds({ statsData }: { statsData?: any }) {
  const getChunks = (filename: string): string[] => statsData?.chunk_files?.[filename] || [filename]

  return (
    <Section id="feeds" className="overflow-hidden" containerClassName="relative z-10">
        <SectionHeading
          title="Threat intelligence feeds"
          subtitle="Plain-text indicators that drop straight into your firewalls, IDS/IPS, and SIEMs. Updated continuously as the community reports new threats."
          aside={
            <Link
              to="/api"
              className="shrink-0 self-start rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 md:self-end"
            >
              Auto-update URLs
            </Link>
          }
        />

        <motion.div
          className="glass-card overflow-hidden"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <ul className="divide-y divide-white/[0.05]">
            {feeds.map((f) => (
              <li key={f.file}>
                <FeedRow f={f} chunks={getChunks(f.file)} count={statsData?.[f.statKey] ?? null} />
              </li>
            ))}
          </ul>
        </motion.div>
    </Section>
  )
}

function FeedRow({ f, chunks, count }: { f: Feed; chunks: string[]; count: number | null }) {
  // Always link a single, directly downloadable file. The domain and hash feeds
  // are committed to the repo as ~31 MiB chunks (too large for one file in git),
  // but the unsplit build is published as a GitHub Release asset, so the download
  // stays one click rather than sending people to browse a folder.
  // Everything else goes through the same-origin /ioc/ mirror: cross-origin
  // raw.githubusercontent.com serves text/plain with no Content-Disposition,
  // so the browser renders 60 MB inline instead of saving it. Same-origin +
  // `download` (below) makes the browser save the file.
  const href =
    f.file === 'threatbase-domain.txt' ? getDomainUrl()
    : f.file === 'threatbase-hash.txt' ? getHashUrl()
    : `${getBaseUrl()}${feedPath(f.file)}`

  const split = chunks.length > 1
  // The whole row is the link, so the chunk note and the size ride along in its
  // label instead of needing their own focusable elements.
  const label = [
    `Download ${f.file}`,
    count != null ? `${fmt(count)} entries` : null,
    split ? `mirrored in-repo as ${chunks.length} chunks: ${chunks.join(', ')}` : null,
  ].filter(Boolean).join(', ')

  return (
    <a
      href={href}
      download
      rel="noopener noreferrer"
      aria-label={label}
      className="group grid grid-cols-[3px_minmax(0,1fr)_auto_1rem] items-center gap-x-4 px-5 py-4 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04] md:grid-cols-[3px_minmax(0,1.5fr)_minmax(0,1fr)_auto_1rem] md:gap-x-6 md:px-7 md:py-5"
    >
      <span aria-hidden className="h-10 w-[3px] rounded-full" style={{ backgroundColor: f.accent }} />

      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-semibold tracking-tight text-white">{f.name}</span>
          {split && (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {chunks.length} parts
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs leading-relaxed text-slate-500 transition-colors group-hover:text-slate-400">
          {f.desc}
        </span>
      </span>

      <span className="hidden truncate font-mono text-xs text-slate-500 transition-colors group-hover:text-slate-300 md:block">
        {f.file}
      </span>

      <span className="justify-self-end whitespace-nowrap font-mono text-sm font-bold tabular-nums text-white">
        {count != null ? fmt(count) : ''}
        {count != null && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">lines</span>}
      </span>

      <Download
        aria-hidden
        size={16}
        className="justify-self-end text-slate-500 transition-all group-hover:translate-y-0.5 group-hover:text-red-400"
      />
    </a>
  )
}
