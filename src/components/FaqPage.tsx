import { motion, useReducedMotion } from 'framer-motion'
import { useSEO } from '@/useSEO'
import IsoPageShell from './layout/IsoPageShell'

/**
 * Every answer here must be verifiable against README.md / src/proFeatures.ts —
 * the same array renders the visible list AND the FAQPage JSON-LD, so the
 * structured data can never drift from the shown text (Google's requirement).
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Threatbase?',
    a: 'Threatbase is an open-source, fully-automated threat-intelligence pipeline. It ingests, validates and deduplicates malicious indicators from 54 public OSINT feeds plus community reports, then publishes them as ready-to-use blocklists and serves them through an IOC-hunting console.',
  },
  {
    q: 'Is Threatbase free?',
    a: 'Yes. All public blocklists are MIT-licensed, with no authentication and no rate limits. An optional Threatbase Pro tier ($25/month, launching soon) adds 15-minute refresh, per-category lists, first-party honeypot telemetry, deploy-ready firewall formats and a false-positive suppression guarantee.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Authoritative open sources including Abuse.ch (FeodoTracker, URLhaus, MalwareBazaar), Spamhaus DROP/EDROP, FireHOL, DShield, PhishTank, OpenPhish, Emerging Threats, Hagezi, Blocklist.de and GreenSnow. Full attribution with links to every upstream is on the Credits page.',
  },
  {
    q: 'How often are the feeds updated?',
    a: 'The pipeline rebuilds on a schedule and every publish is a git commit you can diff. Free feeds refresh daily; Pro feeds refresh every 15 minutes. Current totals and the last-sync time are shown live on the threat feed page.',
  },
  {
    q: 'Which indicator types do you cover?',
    a: 'IPv4, IPv6, CIDR ranges, domains, URLs and file hashes, plus category signals such as C2, botnet, brute-force, spam and Tor. Use the scanner on the homepage to check any of them against the live dataset.',
  },
  {
    q: 'How do I use the blocklists?',
    a: 'Pull the raw text feeds directly into your tooling: every list under threatbase.qzz.io/ioc/ (also mirrored on GitHub raw and Releases) needs no auth. The IP feed is comma-separated with the IP first, so a single cut command turns it into a bare-IP list for ipset,pfSense, Suricata or a SIEM.',
  },
  {
    q: 'How do I report a malicious IP or a false positive?',
    a: 'Sign in, complete the human-verification check on the report page, and submit the indicator with tags and a note. Your report joins the community intelligence the pipeline ingests on its next run. Pro adds a false-positive suppression guarantee: a bad indicator you report is removed from the next build.',
  },
  {
    q: 'What happens to my reports?',
    a: 'Your submitted indicator, chosen tags and alias join the public community-report list and are synced into the open dataset on every pipeline run — that is how one person’s sighting reaches everyone’s firewall. The reporting policy and privacy pages cover the rules.',
  },
]

const faqJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
})

export default function FaqPage() {
  useSEO({
    title: 'FAQ | Threatbase',
    description: 'Answers about Threatbase: free MIT-licensed IOC blocklists, daily feed updates from 54 OSINT sources, supported indicator types, and how community reporting works.',
    path: '/faq',
    keywords: 'threat intelligence FAQ, IOC feed questions, blocklist update frequency, free threat intel, how to use threat feeds',
  })
  const reduce = useReducedMotion()

  return (
    <IsoPageShell>
      {/* Rendered in the page's own lazy chunk, so it appears only when /faq is
          visited — which is exactly where crawlers need it. Same array as the
          visible list below, so markup and text match by construction. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd }} />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-3xl"
      >
        <div className="eyebrow mb-6">FAQ</div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white mb-6">
          Questions, <span className="text-liquid-red">answered</span>.
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed mb-12">
          What Threatbase is, what it costs, where the data comes from, and how to put it to work.
        </p>

        <div className="space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group glass-card rounded-2xl open:bg-white/[0.03] transition-colors">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-4 px-6 py-4 text-left">
                <span className="font-semibold text-slate-100 group-open:text-white">{f.q}</span>
                <span className="font-mono text-slate-500 transition-transform duration-200 group-open:rotate-45 shrink-0" aria-hidden>+</span>
              </summary>
              <p className="px-6 pb-5 text-slate-400 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </motion.div>
    </IsoPageShell>
  )
}
