import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, ExternalLink } from 'lucide-react'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'

/**
 * The four feeds merged into MISP's default-feed registry (PR #11115, into
 * develop on 15 Sep 2026, by the project lead). The names and URLs below are
 * the registry strings verbatim — threatbase.qzz.io, not the viewer's origin —
 * so what a visitor copies is byte-for-byte what MISP ships.
 */
const MISP_FEEDS = [
  { name: 'Threatbase (IP feed)', url: 'https://threatbase.qzz.io/ioc/misp/threatbase-ip.txt' },
  { name: 'Threatbase (Domain feed)', url: 'https://threatbase.qzz.io/ioc/misp/threatbase-domain.txt' },
  { name: 'Threatbase (URL feed)', url: 'https://threatbase.qzz.io/ioc/misp/threatbase-url.txt' },
  { name: 'Threatbase (File hash feed)', url: 'https://threatbase.qzz.io/ioc/misp/threatbase-hash.txt' },
]
const PR_URL = 'https://github.com/MISP/MISP/pull/11115'

export default function MispIntegration() {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (v: string) => {
    navigator.clipboard?.writeText(v)
    setCopied(v)
    setTimeout(() => setCopied((c) => (c === v ? null : c)), 1200)
  }

  return (
    <Section id="misp" className="overflow-hidden" containerClassName="relative z-10">
      <SectionHeading
        title="Use in MISP"
        subtitle="Threatbase is an official default feed in MISP — four feeds merged upstream. Enable them in your instance, or add the URLs to any install today."
        aside={
          <a
            href={PR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 md:self-end"
          >
            Merged PR #11115
            <ExternalLink aria-hidden size={12} />
          </a>
        }
      />

      <motion.div
        className="glass-card overflow-hidden"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Registry path, exactly as MISP shows it once the release lands. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.05] px-5 py-4 font-mono text-xs text-slate-400 md:px-7">
          <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-slate-500 mr-1">On release</span>
          {['Sync Actions', 'Feeds', 'search “Threatbase”'].map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-slate-600">→</span>}
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-slate-300">{step}</span>
            </span>
          ))}
        </div>

        <ul className="divide-y divide-white/[0.05]">
          {MISP_FEEDS.map((f) => (
            <li key={f.url} className="flex items-center gap-4 px-5 py-4 md:px-7">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{f.name}</span>
                <span className="mt-0.5 block truncate font-mono text-xs text-slate-500" title={f.url}>
                  {f.url}
                </span>
              </span>
              {/* Native clipboard, no deps; the glyph is the whole affordance. */}
              <button
                type="button"
                onClick={() => copy(f.url)}
                title="Copy feed URL"
                aria-label={`Copy URL for ${f.name}`}
                className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 ${
                  copied === f.url
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white'
                }`}
              >
                {copied === f.url ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </li>
          ))}
        </ul>

        <p className="border-t border-white/[0.05] px-5 py-4 text-xs leading-relaxed text-slate-500 md:px-7">
          Merged into MISP's <span className="font-mono text-slate-400">develop</span> on 15 Sep 2026 — the four feeds ship
          with the next release train. Until then, paste any URL above as a custom feed and it pulls the same data.
        </p>
      </motion.div>
    </Section>
  )
}
