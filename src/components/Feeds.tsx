import { Download } from 'lucide-react'
import { motion } from 'framer-motion'
import Section from './layout/Section'
import Container from './layout/Container'
import { getDomainUrl, getHashUrl, INDICATOR_ACCENT } from '../utils'

/**
 * Icons are `img` + `invert` rather than inline JSX (same shape as Stats.tsx)
 * so this stays plain data the grid test can import without a DOM.
 * `span` is the desktop width out of 6 columns; rows must sum to 6.
 */
export const feeds = [
  {
    name: 'IPv4 Blocklist',
    desc: 'High-confidence malicious IPv4 addresses, ready for firewall ingestion.',
    file: 'threatbase-ip.txt',
    accent: INDICATOR_ACCENT.ip,
    span: 'lg:col-span-4',
    img: 'ipv4icon.png', invert: true,
  },
  {
    name: 'Domain Blocklist',
    desc: 'Phishing and C2 domains ready for DNS sinkholing and blocking.',
    file: 'threatbase-domain.txt',
    accent: INDICATOR_ACCENT.domain,
    span: 'lg:col-span-2',
    img: 'domain.png',
  },
  {
    name: 'Hash Blocklist',
    desc: 'SHA-256 malware signatures tuned for endpoint detection and AV.',
    file: 'threatbase-hash.txt',
    accent: INDICATOR_ACCENT.hash,
    span: 'lg:col-span-2',
    img: 'file.png',
  },
  {
    name: 'URL Blocklist',
    desc: 'Verified malicious URLs for web proxies, gateways, and filtering.',
    file: 'threatbase-url.txt',
    accent: INDICATOR_ACCENT.url,
    span: 'lg:col-span-2',
    img: 'url.png',
  },
  {
    name: 'IPv6 Blocklist',
    desc: 'High-confidence malicious IPv6 addresses for modern network defense.',
    file: 'threatbase-ipv6.txt',
    accent: INDICATOR_ACCENT.ipv6,
    span: 'lg:col-span-2',
    img: 'ipv6.png', invert: true,
  },
  {
    name: 'CIDR Blocklist',
    desc: 'Aggregated malicious IPv4 and IPv6 subnets for broad-spectrum blocking.',
    file: 'threatbase-cidr.txt',
    accent: INDICATOR_ACCENT.cidr,
    span: 'lg:col-span-6',
    img: 'cidrs.png',
  },
] as const

type Feed = typeof feeds[number]

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: 'easeOut' },
  }),
}

export default function Feeds({ statsData }: { statsData?: any }) {
  const getChunks = (filename: string) => {
    if (statsData && statsData.chunk_files && statsData.chunk_files[filename]) {
      return statsData.chunk_files[filename]
    }
    return [filename]
  }

  return (
    <Section id="feeds" container={false} className="overflow-hidden">
      <Container width="wide" className="relative z-10">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            Threat intelligence feeds
          </h2>
          <p className="mt-4 text-slate-400 text-lg font-medium leading-relaxed">
            Plain-text indicators that drop straight into your firewalls, IDS/IPS, and SIEMs. Updated continuously as the community reports new threats.
          </p>
        </div>

        {/* Asymmetric 6-column bento on desktop, horizontal scroll-snap on mobile.
            Different layout family from the Stats bento (tasteskill §4.7) */}
        <div className="relative">
          {/* Mobile: horizontal scroll-snap strip with fade masks */}
          <div className="lg:hidden relative">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6 scrollbar-none">
              {feeds.map((f, i) => {
                const chunks = getChunks(f.file)
                return (
                  <motion.div
                    key={f.file}
                    custom={i}
                    className="group snap-start shrink-0 w-[85vw] max-w-[340px]"
                    variants={cardVariants}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-30px' }}
                  >
                    <FeedCard f={f} isSplit={chunks.length > 1} chunks={chunks} />
                  </motion.div>
                )
              })}
            </div>
            {/* Fade masks */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#080b12] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#080b12] to-transparent z-10" />
          </div>

          {/* Desktop: 6-column asymmetric grid */}
          <div className="hidden lg:grid grid-cols-6 gap-5">
            {feeds.map((f, i) => {
              const chunks = getChunks(f.file)
              return (
                <motion.div
                  key={f.file}
                  custom={i}
                  className={f.span}
                  variants={cardVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-50px' }}
                >
                  <FeedCard f={f} isSplit={chunks.length > 1} chunks={chunks} wide={f.span === 'lg:col-span-6'} />
                </motion.div>
              )
            })}
          </div>
        </div>
      </Container>
    </Section>
  )
}

function FeedCard({ f, isSplit, chunks, wide = false }: { f: Feed; isSplit: boolean; chunks: string[]; wide?: boolean }) {
  // Always link a single, directly downloadable file. The domain and hash feeds
  // are committed to the repo as ~31 MiB chunks (too large for one file in git),
  // but the unsplit build is published as a GitHub Release asset, so the download
  // button stays one click rather than sending people to browse a folder.
  const href =
    f.file === 'threatbase-domain.txt' ? getDomainUrl()
    : f.file === 'threatbase-hash.txt' ? getHashUrl()
    : `https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/${f.file}`

  return (
    <div className="group glass-card glass-hover relative flex flex-col h-full overflow-hidden">
      {/* Category-color accent stripe at top */}
      <div
        className="h-[2px] w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${f.accent}, transparent)` }}
      />

      <div className={`flex flex-1 p-5 sm:p-6 ${wide ? 'flex-col md:flex-row md:items-center gap-6' : 'flex-col'}`}>
        <div className="flex items-start gap-4 flex-1">
          <div className="icon-chip p-3 shrink-0 transition-transform duration-500 group-hover:scale-105">
            <img
              src={`${import.meta.env.BASE_URL}img/${f.img}`}
              alt=""
              aria-hidden="true"
              className={`w-7 h-7 object-contain ${'invert' in f && f.invert ? 'invert opacity-80' : 'drop-shadow-sm'}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-white tracking-tight truncate">{f.name}</h3>
              {isSplit && (
                <span
                  title={`Also mirrored in this repo as ${chunks.length} chunks (${chunks.join(', ')}). Concatenating them in order reproduces this file exactly — see ioc/manifest.json for the chunk list and key ranges.`}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-slate-400 cursor-help"
                >
                  {chunks.length} parts
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">
              {f.desc}
            </p>
          </div>
        </div>

        <div className={wide ? 'shrink-0 md:w-52' : 'mt-auto pt-5'}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 sm:px-5 h-11 text-sm font-semibold text-white shadow-glow-red hover:bg-red-400 transition-all duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
          >
            <Download size={16} className="transition-transform group-hover:-translate-y-0.5" />
            Download
          </a>
        </div>
      </div>
    </div>
  )
}
