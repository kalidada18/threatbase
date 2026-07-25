import { Download } from 'lucide-react'
import { motion } from 'framer-motion'
import Section from './layout/Section'
import Container from './layout/Container'
import { getDomainUrl } from '../utils'

const BASE = import.meta.env.BASE_URL

// Accent stripe colors per feed type — visual differentiation
const FEED_ACCENT: Record<string, string> = {
  'threatbase-ip.txt': '#cf1733',
  'threatbase-domain.txt': '#6366f1',
  'threatbase-hash.txt': '#3b82f6',
  'threatbase-url.txt': '#f43e5e',
  'threatbase-ipv6.txt': '#0ea5e9',
  'threatbase-cidr.txt': '#f97316',
}

const feeds = [
  {
    name: 'IPv4 Blocklist',
    desc: 'High-confidence malicious IPv4 addresses, ready for firewall ingestion.',
    file: 'threatbase-ip.txt',
    icon: <img src={`${BASE}img/ipv4icon.png`} alt="IPv4" className="w-7 h-7 object-contain invert opacity-80" />,
  },
  {
    name: 'Domain Blocklist',
    desc: 'Phishing and C2 domains ready for DNS sinkholing and blocking.',
    file: 'threatbase-domain.txt',
    icon: <img src={`${BASE}img/domain.png`} alt="Domain" className="w-7 h-7 object-contain drop-shadow-sm" />,
  },
  {
    name: 'Hash Blocklist',
    desc: 'SHA-256 malware signatures tuned for endpoint detection and AV.',
    file: 'threatbase-hash.txt',
    icon: <img src={`${BASE}img/file.png`} alt="File" className="w-7 h-7 object-contain drop-shadow-sm" />,
  },
  {
    name: 'URL Blocklist',
    desc: 'Verified malicious URLs for web proxies, gateways, and filtering.',
    file: 'threatbase-url.txt',
    icon: <img src={`${BASE}img/url.png`} alt="URL" className="w-7 h-7 object-contain drop-shadow-sm" />,
  },
  {
    name: 'IPv6 Blocklist',
    desc: 'High-confidence malicious IPv6 addresses for modern network defense.',
    file: 'threatbase-ipv6.txt',
    icon: <img src={`${BASE}img/ipv6.png`} alt="IPv6" className="w-7 h-7 object-contain invert opacity-80" />,
  },
  {
    name: 'CIDR Blocklist',
    desc: 'Aggregated malicious IPv4 and IPv6 subnets for broad-spectrum blocking.',
    file: 'threatbase-cidr.txt',
    icon: <img src={`${BASE}img/cidrs.png`} alt="CIDR" className="w-7 h-7 object-contain drop-shadow-sm" />,
  },
]

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

        {/* Asymmetric 3-column grid on desktop, horizontal scroll-snap on mobile
            Different layout family from Stats bento (tasteskill §4.7) */}
        <div className="relative">
          {/* Mobile: horizontal scroll-snap strip with fade masks */}
          <div className="lg:hidden relative">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {feeds.map((f, i) => {
                const chunks = getChunks(f.file)
                const isSplit = chunks.length > 1
                const accent = FEED_ACCENT[f.file] || '#cf1733'
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
                    <FeedCard f={f} isSplit={isSplit} chunks={chunks} accent={accent} />
                  </motion.div>
                )
              })}
            </div>
            {/* Fade masks */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#080b12] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#080b12] to-transparent z-10" />
          </div>

          {/* Desktop: 3-column asymmetric grid */}
          <div className="hidden lg:grid grid-cols-3 gap-5">
            {feeds.map((f, i) => {
              const chunks = getChunks(f.file)
              const isSplit = chunks.length > 1
              const accent = FEED_ACCENT[f.file] || '#cf1733'
              return (
                <motion.div
                  key={f.file}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-50px' }}
                >
                  <FeedCard f={f} isSplit={isSplit} chunks={chunks} accent={accent} />
                </motion.div>
              )
            })}
          </div>
        </div>
      </Container>
    </Section>
  )
}

function FeedCard({ f, isSplit, chunks, accent }: { f: typeof feeds[0]; isSplit: boolean; chunks: string[]; accent: string }) {
  return (
    <div className="group glass-card glass-hover relative flex flex-col h-full overflow-hidden">
      {/* Category-color accent stripe at top */}
      <div
        className="h-[2px] w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />

      <div className="flex flex-col flex-1 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="icon-chip p-3 shrink-0 transition-transform duration-500 group-hover:scale-105">
            {f.icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-white tracking-tight truncate">{f.name}</h3>
              {isSplit && (
                <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                  {chunks.length} parts
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">
              {f.desc}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-5">
          {isSplit ? (
            <a
              href="https://github.com/kalidada18/threatbase/tree/main/ioc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 h-11 text-sm font-semibold text-slate-200 hover:bg-white/[0.1] hover:text-white transition-all duration-200 active:scale-[0.97] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
            >
              <Download size={16} className="transition-transform group-hover:-translate-y-0.5" />
              View Parts
            </a>
          ) : (
            <a
              href={f.file === 'threatbase-domain.txt' ? getDomainUrl() : `https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/${f.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 sm:px-5 h-11 text-sm font-semibold text-white shadow-glow-red hover:bg-red-400 transition-all duration-200 active:scale-[0.97] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
            >
              <Download size={16} className="transition-transform group-hover:-translate-y-0.5" />
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
