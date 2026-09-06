import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Clock, Crown, Layers, Radar, ShieldCheck, Zap } from 'lucide-react'
import { Reveal, EASE_EXPO } from './motion/primitives'
import { Magnetic } from './motion/Magnetic'
import { useCountUp } from '@/lib/useCountUp'
import { getBaseUrl, feedPath, fmt, categoryTier, type SeverityTier } from '../utils'
import { useSEO } from '@/useSEO'

const PRO_EMAIL = 'threatbasepro@gmail.com'
const PRICE = 25

// Real refresh windows, straight from the Workers that serve the two tiers:
// functions/ioc KV_TTL = 21600s, functions/feed PRO_TTL = 900s.
const FREE_TTL_S = 21600
const PRO_TTL_S = 900

const WAITLIST_HREF =
  `mailto:${PRO_EMAIL}?subject=${encodeURIComponent('Threatbase Pro waitlist')}` +
  `&body=${encodeURIComponent(
    'Hi,\n\nPut me on the Threatbase Pro waitlist.\n\n' +
      'What I want to block: \nFirewall / IDS / SIEM I run: \n',
  )}`

/**
 * Snapshot of ioc/data/stats.json, used until the live fetch lands (and kept
 * as the fallback if it never does, so the page never renders an empty bar).
 * Refreshed from the committed feed, not invented.
 */
const SNAPSHOT = {
  total: 920228,
  feeds: 55,
  cats: {
    Mixed: 694059, Malicious: 187008, 'Brute-Force': 31593, Compromised: 15538,
    Spam: 12719, Exploit: 9835, C2: 7607, Tor: 6823, Malware: 2728, Botnet: 2301,
  } as Record<string, number>,
}

// Severity fills, pulled to the house ramp (ruby, vermilion, amber, platinum,
// slate). Colour carries how bad, never which category: the label does that.
const TIER_FILL: Record<SeverityTier, string> = {
  critical: '#cf1733',
  high: '#ed6b4a',
  medium: '#f48d34',
  low: '#cdd3de',
  unknown: '#454c5a',
}
const TIER_RANK: Record<SeverityTier, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }

/** Live stats when we can get them, snapshot when we cannot. */
function useFeedStats() {
  const [stats, setStats] = useState(SNAPSHOT)
  useEffect(() => {
    let cancelled = false
    fetch(getBaseUrl() + feedPath('stats.json') + '?_=' + Date.now())
      .then((r) => r.json())
      .then((d: { category_counts?: Record<string, number>; total_unique_ips?: number; active_feeds?: number }) => {
        if (cancelled || !d?.category_counts) return
        setStats({
          total: d.total_unique_ips ?? SNAPSHOT.total,
          feeds: d.active_feeds ?? SNAPSHOT.feeds,
          cats: d.category_counts,
        })
      })
      .catch(() => { /* snapshot stands */ })
    return () => { cancelled = true }
  }, [])
  return stats
}

function Stat({ value, label }: { value: number; label: string }) {
  const n = useCountUp(value)
  return (
    <div>
      <div className="font-mono text-2xl font-bold tabular-nums text-white md:text-3xl">{fmt(n)}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  )
}

/**
 * The page's whole argument in one graphic: the free tier is one file where
 * every category is fused, Pro is the same intel addressable a category at a
 * time. Both bars are the same width, so the eye reads it as one dataset cut
 * two ways. Segments grow with scaleX (transform only, never width).
 */
function PrecisionSplit({ cats, total }: { cats: Record<string, number>; total: number }) {
  const entries = Object.entries(cats)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => ({ name, n, tier: categoryTier(name) }))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.n - a.n)
  const sum = entries.reduce((s, e) => s + e.n, 0) || 1
  const tor = cats['Tor'] ?? 0
  const c2 = cats['C2'] ?? 0

  return (
    <div className="rounded-2xl border border-white/10 p-6 md:p-10">
      {/* Community: one undifferentiated block. */}
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-bold text-slate-300">Community</span>
        <span className="font-mono text-xs text-slate-500">threatbase-ip.txt</span>
      </div>
      <motion.div
        className="h-12 origin-left overflow-hidden rounded-lg bg-slate-700/60"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: EASE_EXPO }}
      />
      <p className="mt-3 text-sm text-slate-500">
        {fmt(total)} addresses in one file. Every category fused together, so the
        firewall takes all of it or none of it.
      </p>

      <div className="my-8 h-px bg-white/10" />

      {/* Pro: the same corpus, addressable. */}
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-bold text-white">Pro</span>
        <span className="font-mono text-xs text-slate-500">ip/categories/*.txt</span>
      </div>
      <div className="flex h-12 gap-1 overflow-hidden rounded-lg">
        {entries.map((e, i) => (
          <motion.div
            key={e.name}
            className="h-full origin-left rounded-[3px]"
            style={{ flexGrow: e.n, flexBasis: 0, backgroundColor: TIER_FILL[e.tier] }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.35 + i * 0.06, ease: EASE_EXPO }}
            title={`${e.name}: ${fmt(e.n)}`}
          />
        ))}
      </div>

      {/* Legend doubles as the category price list. */}
      <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {entries.map((e, i) => (
          <motion.li
            key={e.name}
            className="flex items-center justify-between gap-2 border-t border-white/[0.07] pt-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.5 + i * 0.05 }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: TIER_FILL[e.tier] }} />
              <span className="truncate text-xs text-slate-400">{e.name}</span>
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-300">{fmt(e.n)}</span>
          </motion.li>
        ))}
      </ul>

      <p className="mt-6 text-sm leading-relaxed text-slate-400">
        Block the {fmt(c2)} C2 addresses without also blocking {fmt(tor)} Tor exit
        nodes. On the single file, that choice does not exist.{' '}
        <span className="text-slate-600">
          Counts total more than {fmt(total)} because an address can carry more than one tag.
        </span>
      </p>
    </div>
  )
}

/** 6 hours against 15 minutes, drawn as the window an attacker gets for free. */
function Freshness() {
  const ratio = Math.round(FREE_TTL_S / PRO_TTL_S)
  const n = useCountUp(ratio, 1200)
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div className="rounded-2xl border border-white/10 p-6">
        <div className="text-[11px] uppercase tracking-widest text-slate-500">Community refresh</div>
        <div className="mt-2 font-mono text-4xl font-bold text-slate-400">6 h</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full origin-left rounded-full bg-slate-600"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
            transition={{ duration: 1.1, ease: 'linear' }}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          A host that starts scanning at 02:00 can still be missing from your
          blocklist at 08:00.
        </p>
      </div>

      <div className="px-2 text-center">
        <div className="font-mono text-3xl font-bold tabular-nums text-red-500">{n}x</div>
        <div className="text-[11px] uppercase tracking-widest text-slate-500">fresher</div>
      </div>

      <div className="rounded-2xl border border-red-500/30 p-6">
        <div className="text-[11px] uppercase tracking-widest text-red-400/80">Pro refresh</div>
        <div className="mt-2 font-mono text-4xl font-bold text-white">15 min</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full origin-left rounded-full bg-red-500"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
            transition={{ duration: 1.1 / 24, ease: 'linear' }}
          />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          The same host is in your ipset before the shift that noticed it has
          finished writing the ticket.
        </p>
      </div>
    </div>
  )
}

// [label, in Community?]. Pro is every row, so one list beats two columns.
const FEATURES = [
  ['Every IOC type: IP, IPv6, CIDR, domain, URL, hash', true],
  ['Hunt console and community reports', true],
  ['Open source, MIT, no auth, no rate limits', true],
  ['Per-category IP lists', false],
  ['Firewall formats per category: ipset, Suricata, NDJSON', false],
  ['STIX 2.1 bundles for Sentinel, Splunk, MISP, OpenCTI', false],
  ['15-minute refresh', false],
  ['First-party sensor telemetry', false],
  ['Stable token URL for unattended auto-update', false],
  ['False-positive suppression guarantee', false],
  ['Email support', false],
] as const

function FeatureRow({ label, on, pro }: { label: string; on: boolean; pro?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {on ? (
        <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${pro ? 'text-red-500' : 'text-platinum-300'}`} />
      ) : (
        <span aria-hidden className="mt-[9px] h-px w-4 shrink-0 bg-slate-700" />
      )}
      <span className={on ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
      <span className="sr-only">{on ? '(included)' : '(not included)'}</span>
    </li>
  )
}

const PILLARS = [
  {
    icon: Layers,
    title: 'Our own aggregation',
    body: 'Correlation, de-duplication and scoring run in-house against raw observations instead of inheriting each upstream verdict, so one noisy source cannot inflate an indicator by itself.',
  },
  {
    icon: ShieldCheck,
    title: 'Accuracy you can block on',
    body: 'Every address carries how many independent sources saw it. Whitelists and reported false positives are applied before publish, and manifest-pro.json ships a SHA-256 for every file.',
  },
] as const

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description:
      'Free open-source blocklists for everyone, permanently. Threatbase Pro is launching soon: per-category IP lists, firewall and STIX 2.1 formats, and a 15-minute refresh backed by our own sensors. $25/month at launch. Join the waitlist.',
    path: '/pricing',
  })
  const { cats, total, feeds } = useFeedStats()

  return (
    <div className="w-full bg-app font-sans">
      <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-24">
        {/* Hero: left-aligned, four elements, nothing below the CTAs. */}
        <header className="max-w-3xl">
          <Reveal>
            <span className="eyebrow mb-6">Pro launching soon</span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tighter text-white lg:text-6xl">
              Free for everyone.<br />
              <span className="text-red-500">Precise for defenders.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
              The whole corpus stays open and MIT. Pro adds our own sensors,
              per-category lists, and a 15-minute refresh.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Magnetic>
                <a
                  href={WAITLIST_HREF}
                  className="group flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-red-500 active:scale-[0.98]"
                >
                  Join the waitlist
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Magnetic>
              <a
                href="/threatfeed"
                className="rounded-xl border border-white/10 px-6 py-3.5 text-sm font-bold text-slate-200 transition-colors hover:border-white/25 active:scale-[0.98]"
              >
                Browse free feeds
              </a>
            </div>
          </Reveal>
        </header>

        {/* Live corpus, counting up. Proof of scale before any claim is made. */}
        <Reveal delay={0.28}>
          <div className="mt-16 grid grid-cols-2 gap-6 border-t border-white/10 pt-8 sm:grid-cols-4">
            <Stat value={total} label="IPv4 addresses" />
            <Stat value={cats['C2'] ?? 0} label="C2 addresses" />
            <Stat value={cats['Brute-Force'] ?? 0} label="Brute-force" />
            <Stat value={feeds} label="Sources merged" />
          </div>
        </Reveal>

        {/* The argument. */}
        <section className="mt-28">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              One file, or ten lists you can aim.
            </h2>
            <p className="mt-4 max-w-2xl text-slate-400">
              Same intelligence. The difference is whether your firewall can tell
              a command-and-control server from a Tor exit node.
            </p>
          </Reveal>
          <div className="mt-10">
            <PrecisionSplit cats={cats} total={total} />
          </div>
        </section>

        {/* Freshness. */}
        <section className="mt-28">
          <Reveal>
            <span className="eyebrow mb-5">Refresh window</span>
            <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              Six hours is a long time to be wrong.
            </h2>
          </Reveal>
          <div className="mt-10">
            <Freshness />
          </div>
        </section>

        {/* Pricing. Asymmetric: Pro carries more width and the only accent. */}
        <section className="mt-28 grid items-start gap-6 lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <div className="rounded-2xl border border-white/10 p-8">
              <div className="mb-6 flex items-center gap-2 text-slate-300">
                <Zap aria-hidden className="h-5 w-5" />
                <span className="text-sm font-bold uppercase tracking-widest">Community</span>
              </div>
              <div className="mb-6 flex items-baseline gap-2">
                <span className="font-mono text-5xl font-extrabold text-white">$0</span>
                <span className="text-sm text-slate-500">forever</span>
              </div>
              <ul className="space-y-3">
                {FEATURES.map(([label, free]) => (
                  <FeatureRow key={label} label={label} on={free} />
                ))}
              </ul>
              <a
                href="/threatfeed"
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-4 text-sm font-bold text-slate-200 transition-colors hover:border-white/25 active:scale-[0.98]"
              >
                Browse free feeds
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-3">
            <div className="rounded-2xl border border-red-500/40 p-8">
              <div className="mb-6 flex items-center gap-2 text-white">
                <Crown aria-hidden className="h-5 w-5 text-red-500" />
                <span className="text-sm font-bold uppercase tracking-widest">Pro</span>
                <span className="ml-auto rounded-full border border-red-500/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  Launching soon
                </span>
              </div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-mono text-5xl font-extrabold text-white">${PRICE}</span>
                <span className="text-sm text-slate-500">/ month at launch</span>
              </div>
              <p className="mb-6 text-xs text-slate-500">
                Nothing to pay today. The waitlist is free and holds launch pricing.
              </p>
              <ul className="space-y-3">
                {FEATURES.map(([label]) => (
                  <FeatureRow key={label} label={label} on pro />
                ))}
              </ul>
              <Magnetic>
                <a
                  href={WAITLIST_HREF}
                  className="group mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-sm font-bold text-white transition-colors hover:bg-red-500 active:scale-[0.98]"
                >
                  Join the waitlist
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Magnetic>
              <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
                We email you the day Pro opens. Onboarding is by hand at first:
                generate a key in <a href="/profile" className="text-slate-300 hover:underline">Profile</a>,
                send us its prefix, and your token URL comes back with it.
              </p>
            </div>
          </Reveal>
        </section>

        {/* What Pro is built on. Lead tile plus two, never three equal cards. */}
        <section className="mt-28">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              What Pro is built on
            </h2>
            <p className="mt-4 max-w-2xl text-slate-400">
              Community republishes what {feeds} public sources report. Pro adds
              what we see and verify ourselves.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-5">
            <Reveal className="lg:col-span-3">
              <div className="h-full rounded-2xl border border-red-500/20 p-8">
                <Radar aria-hidden className="mb-5 h-6 w-6 text-red-500" />
                <h3 className="mb-3 text-xl font-bold text-white">Our own sensors</h3>
                <p className="max-w-lg leading-relaxed text-slate-400">
                  Threatbase-run honeypots and telemetry feed Pro directly, on top
                  of the {feeds} public upstreams. What our own sensors catch does
                  not wait for anyone else to publish it first.
                </p>
              </div>
            </Reveal>
            <div className="grid gap-4 lg:col-span-2">
              {PILLARS.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={0.08 + i * 0.08}>
                  <div className="h-full rounded-2xl border border-white/10 p-6">
                    <Icon aria-hidden className="mb-4 h-5 w-5 text-slate-400" />
                    <h3 className="mb-2 text-sm font-bold text-white">{title}</h3>
                    <p className="text-xs leading-relaxed text-slate-500">{body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <Reveal>
          <div className="mt-20 flex flex-col items-center gap-4 border-t border-white/10 pt-10 text-center">
            <Clock aria-hidden className="h-5 w-5 text-slate-600" />
            <p className="max-w-xl text-xs leading-relaxed text-slate-500">
              One seat is one token URL, usable across the network devices you
              run. Community feeds stay free and MIT-licensed, permanently.
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
