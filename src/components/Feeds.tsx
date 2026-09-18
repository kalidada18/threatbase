import { Download, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import { usePro } from '../usePro'
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
 * Direct raw-list downloads are a Pro benefit. The manifest stays public — it
 * is the honest catalogue of what Pro unlocks — but the download action itself
 * is gated on the same entitlement as bulk hunt (GET /api/me/pro). Free and
 * signed-out visitors see the locked rows plus a single Pro CTA; Pro members
 * get the working same-origin downloads. 'checking' renders a neutral state so
 * paying members never see the paywall flash while the round-trip resolves.
 */
export default function Feeds({ statsData }: { statsData?: any }) {
  const { status } = usePro()
  const canDownload = status === 'pro'
  const checking = status === 'checking'

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
                <FeedRow
                  f={f}
                  chunks={getChunks(f.file)}
                  count={statsData?.[f.statKey] ?? null}
                  canDownload={canDownload}
                  checking={checking}
                />
              </li>
            ))}
          </ul>
        </motion.div>

        {!canDownload && <ProGate checking={checking} />}
    </Section>
  )
}

function FeedRow({
  f,
  chunks,
  count,
  canDownload,
  checking,
}: {
  f: Feed
  chunks: string[]
  count: number | null
  canDownload: boolean
  checking: boolean
}) {
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

  const gridCls =
    'group grid grid-cols-[3px_minmax(0,1fr)_auto_1rem] items-center gap-x-4 px-5 py-4 transition-colors md:grid-cols-[3px_minmax(0,1.5fr)_minmax(0,1fr)_auto_1rem] md:gap-x-6 md:px-7 md:py-5'

  const body = (
    <>
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
    </>
  )

  // Locked / pending rows keep the exact same grid so switching states after the
  // entitlement resolves never reflows the manifest.
  const trailing = canDownload ? (
    <Download
      aria-hidden
      size={16}
      className="justify-self-end text-slate-500 transition-all group-hover:translate-y-0.5 group-hover:text-red-400"
    />
  ) : checking ? (
    <span
      aria-hidden
      className="justify-self-end font-mono text-[10px] uppercase tracking-wider text-slate-600"
    >
      ···
    </span>
  ) : (
    <span aria-hidden className="icon-chip justify-self-end h-7 w-7">
      <Lock size={13} />
    </span>
  )

  if (canDownload) {
    return (
      <a
        href={href}
        download
        rel="noopener noreferrer"
        aria-label={label}
        className={`${gridCls} hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04]`}
      >
        {body}
        {trailing}
      </a>
    )
  }

  return (
    <div
      className={gridCls}
      aria-label={`${f.name}, ${count != null ? `${fmt(count)} entries. ` : ''}Direct download is a Pro feature`}
    >
      {body}
      {trailing}
    </div>
  )
}

/**
 * The one gate below the locked manifest. Same shell and motion idiom as the
 * bulk-hunt paywall so a free visitor meets a single, consistent "this is Pro"
 * surface rather than a per-row error. While the entitlement is still
 * resolving we show a neutral note instead of the pitch (LandingSections and
 * BulkScanner gate on 'checking' the same way).
 */
function ProGate({ checking }: { checking: boolean }) {
  if (checking) {
    return (
      <p
        role="status"
        className="mt-5 text-center font-mono text-xs uppercase tracking-widest text-slate-500"
      >
        Checking your Pro status…
      </p>
    )
  }

  return (
    <div className="glass-card relative mt-5 overflow-hidden p-8 text-center md:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/80 to-transparent"
      />
      <span className="icon-chip mx-auto h-10 w-10">
        <Lock size={18} />
      </span>
      <h3 className="mt-4 text-lg font-bold text-white">Direct feed downloads are Pro</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        The open corpus stays MIT and free to browse and query. Pulling the raw
        blocklists below, under one stable auto-update URL, is what Pro unlocks.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-[13px] font-semibold tracking-[0.06em] text-white shadow-glow-red transition-all hover:bg-red-400 active:translate-y-px"
        >
          Join the Pro waitlist
        </Link>
        <Link
          to="/api"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-5 py-2.5 text-[13px] font-semibold text-platinum-300 transition-all hover:border-white/20 hover:text-white"
        >
          See auto-update URLs
        </Link>
      </div>
    </div>
  )
}
