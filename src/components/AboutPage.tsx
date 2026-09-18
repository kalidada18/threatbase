import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Radar, Database, Waypoints, FileJson, Network, FileText, FileCode, Layers, ExternalLink, Search, Terminal, ListChecks } from 'lucide-react'
import { GithubIcon as Github } from './ui/github-icon'
import IsoPageShell from './layout/IsoPageShell'
import { Typewriter } from './motion/Typewriter'
import { useSEO } from '@/useSEO'

export default function AboutPage() {
  useSEO({
    title: 'About Threatbase | Community-Driven Threat Intelligence',
    description:
      'Learn how Threatbase works: an automated pipeline turning 55 OSINT feeds and community reports into free IOC blocklists and a real-time hunting console.',
    path: '/about',
  })

  const reduce = useReducedMotion()
  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  })

  const stats = [
    { value: '55+', label: 'Upstream OSINT sources' },
    { value: '6', label: 'Indicator types' },
    { value: 'MIT', label: 'Open & free' },
    { value: '24/7', label: 'Scheduled rebuild' },
  ]

  const types = ['IPv4', 'IPv6', 'CIDR', 'Domain', 'URL', 'File hash']

  const pillars = [
    {
      icon: <Database className="h-6 w-6" strokeWidth={1.8} />,
      title: 'One deduplicated corpus',
      desc: 'Public feeds, honeypot telemetry, and community reports are refanged, typed, and merged into a single record per indicator — no duplicate lines, no stale clutter.',
      span: 'md:col-span-3 md:col-start-1 md:row-span-2 md:row-start-1',
      hero: true,
    },
    {
      icon: <Radar className="h-6 w-6" strokeWidth={1.8} />,
      title: 'A live hunting console',
      desc: 'Query any IP, domain, URL, or hash and read the verdict, corroborating sources, and first-seen history in one view.',
      span: 'md:col-span-3 md:col-start-4 md:row-start-1',
      hero: false,
    },
    {
      icon: <Waypoints className="h-6 w-6" strokeWidth={1.8} />,
      title: 'Built to be consumed',
      desc: 'Plain-text blocklists and stable auto-update URLs drop straight into firewalls, IDS/IPS, and SIEMs.',
      span: 'md:col-span-3 md:col-start-4 md:row-start-2',
      hero: false,
    },
  ]

  // Delivery model, verified against the real gating: the free tier is query
  // access (web lookup, REST API, rate-limited bulk — functions/api/v1/*);
  // downloadable feed subscriptions are Pro (functions/feed/ tokenized
  // delivery; the functions/ioc mirror returns 402 for ip/categories/, firewall/
  // and stix/). Only formats pipeline/update_feed.py actually emits are listed.
  type DeliveryItem = { icon: ReactNode; name: string; desc: string }
  const tiers: { key: 'free' | 'pro'; label: string; items: DeliveryItem[] }[] = [
    {
      key: 'free',
      label: 'Free — query the intelligence',
      items: [
        {
          icon: <Search className="h-5 w-5" strokeWidth={1.8} />,
          name: 'Indicator lookup',
          desc: 'Look up any IP, IPv6, domain, URL, SHA-256 hash, or CIDR and get enrichment — verdict, risk score, categories, and first/last-seen.',
        },
        {
          icon: <Terminal className="h-5 w-5" strokeWidth={1.8} />,
          name: 'REST API',
          desc: 'A documented JSON API for programmatic enrichment, authenticated with your own API key — free to start using.',
        },
        {
          icon: <ListChecks className="h-5 w-5" strokeWidth={1.8} />,
          name: 'Limited bulk lookups',
          desc: 'Submit a batch of indicators and get verdicts back in a single call, within the free tier\'s rate limits.',
        },
      ],
    },
    {
      key: 'pro',
      label: 'Pro — subscribe and download the feeds',
      items: [
        {
          icon: <FileText className="h-5 w-5" strokeWidth={1.8} />,
          name: 'Plain-text blocklist feeds',
          desc: 'IPv4, IPv6, CIDR, domain, URL, and SHA-256 — one indicator per line on stable, tokenized auto-update URLs your appliance polls.',
        },
        {
          icon: <FileJson className="h-5 w-5" strokeWidth={1.8} />,
          name: 'STIX 2.1 + TAXII',
          desc: 'Bundle-per-page collections that Microsoft Sentinel, MISP, and OpenCTI pull natively, with stable indicator IDs held across every run.',
        },
        {
          icon: <FileCode className="h-5 w-5" strokeWidth={1.8} />,
          name: 'Firewall & IDS formats',
          desc: 'Deploy-ready Suricata rules, ipset sets, EDLs, and gzipped JSONL — loaded straight into the sensor with no parsing downstream.',
        },
        {
          icon: <Layers className="h-5 w-5" strokeWidth={1.8} />,
          name: 'Threat-category feeds',
          desc: 'The corpus split by behaviour — C2, botnet, brute-force, scanning, and more — each published in every format above.',
        },
      ],
    },
  ]

  return (
    <IsoPageShell>
      {/* Hero — editorial split: the message on the left, a real console record
          on the right (a genuine product artifact, not filler copy). */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-16">
          <motion.div {...rise(0)} className="text-left">
            <div className="eyebrow mb-6">About Threatbase</div>

            <h1 className="text-[2.6rem] font-extrabold leading-[1.03] tracking-tighter text-white sm:text-6xl md:text-7xl">
              Threat intel,{' '}
              <span className="text-liquid-red">stripped of the noise.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Threatbase aggregates, deduplicates, and publishes open-source
              threat intelligence at scale — so defenders everywhere can block
              what attackers already know.
            </p>

            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-400">
              No account to browse, no card to start. The corpus stays MIT and
              free; Pro adds precision and convenience on top.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to="/threatfeed"
                className="group inline-flex items-center gap-2 rounded-2xl bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-glow-ruby transition-all hover:bg-red-500 active:scale-[0.98]"
              >
                Explore the feeds
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="https://github.com/kalidada18/threatbase"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-platinum-400/20 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-platinum-300 backdrop-blur-md transition-all hover:border-platinum-400/40 hover:text-white"
              >
                <Github className="h-4 w-4" />
                Star on GitHub
              </a>
            </div>
          </motion.div>

          {/* Console record panel. */}
          <motion.div {...rise(0.12)} className="relative">
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2.25rem] bg-gradient-to-br from-red-500/12 via-transparent to-platinum-400/[0.05] blur-2xl"
            />
            <div className="glass-card relative overflow-hidden shadow-glass-lux">
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  hunt — live
                </span>
              </div>
              <div className="px-5 py-5 font-mono text-sm">
                <p className="text-red-400">
                  &gt;{' '}
                  <Typewriter text="query 185.220.101.44" speed={38} startDelay={600} />
                </p>
                <dl className="mt-4 space-y-2 text-[13px]">
                  {[
                    ['verdict', 'malicious', 'text-red-400 font-semibold'],
                    ['class', 'C2 · command & control', 'text-slate-200'],
                    ['sources', '6 corroborating feeds', 'text-slate-200'],
                    ['first seen', '2026-08-30', 'text-slate-200'],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">{k}</dt>
                      <dd className={cls}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats — a single bordered strip divided by rules, not four floating
          cards. Keeps the metric band from reading as generic feature tiles. */}
      <motion.dl
        {...rise(0)}
        className="mx-auto mt-20 grid w-full max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.05] md:grid-cols-4"
      >
        {stats.map((s) => (
          <div key={s.label} className="bg-[#090d14] px-6 py-8 text-center">
            <dt className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              {s.value}
            </dt>
            <dd className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              {s.label}
            </dd>
          </div>
        ))}
      </motion.dl>

      {/* Pillars — asymmetric, gapless bento: one tall tile with real depth
          (radial ruby wash + indicator chips) beside two stacked supporting
          tiles with their own tint. Mobile collapses to a single column. */}
      <section className="mx-auto mt-24 w-full max-w-5xl">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-6 md:grid-rows-2">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              {...rise(i * 0.08)}
              className={`glass-card glass-hover group relative flex flex-col overflow-hidden p-8 ${p.span}`}
            >
              {p.hero ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-70"
                  style={{
                    background:
                      'radial-gradient(130% 90% at 0% 0%, rgba(207,23,51,0.14), transparent 55%)',
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(120% 90% at 100% 0%, rgba(205,211,222,0.07), transparent 55%)',
                  }}
                />
              )}

              <div className="icon-chip relative z-10 mb-6 h-12 w-12 transition-transform duration-300 group-hover:scale-105">
                {p.icon}
              </div>

              <h3 className="relative z-10 text-xl font-bold tracking-tight text-white">
                {p.title}
              </h3>
              <p className="relative z-10 mt-3 text-[15px] font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-300">
                {p.desc}
              </p>

              {p.hero && (
                <ul className="relative z-10 mt-auto flex flex-wrap gap-2 pt-8">
                  {types.map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-slate-400"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Delivery model — the honest Free/Pro split: query the corpus free,
          subscribe and download the feeds on Pro. Split layout is earned: the
          right column is a real two-tier ledger, not filler copy. */}
      <section className="mx-auto mt-24 w-full max-w-5xl">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-14">
          <motion.div {...rise(0)}>
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-[2.5rem] md:leading-[1.1]">
              Query it free. Feed your stack in its native format.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Threatbase splits cleanly down the middle. Interactive lookup, the
              REST API, and limited bulk queries are free forever. Downloadable,
              auto-updating feed subscriptions — in every format a SOC already
              ingests — are Pro.
            </p>
            <p className="mt-6 flex items-start gap-2.5 text-[13px] leading-relaxed text-slate-500">
              <Network className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.8} aria-hidden />
              <span>
                Already run MISP? Four Threatbase feeds are merged into its
                upstream default-feed list.{' '}
                <a
                  href="https://github.com/MISP/MISP/pull/11115"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm font-semibold text-red-300 transition-colors hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                >
                  Merged PR #11115
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </span>
            </p>
          </motion.div>

          <motion.div {...rise(0.1)} className="space-y-6">
            {tiers.map((tier) => (
              <div key={tier.key}>
                <span
                  className={
                    'mb-2 ml-1 inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider ' +
                    (tier.key === 'pro'
                      ? 'border-red-500/25 bg-red-500/[0.08] text-red-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300')
                  }
                >
                  {tier.label}
                </span>
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  {tier.items.map((item) => (
                    <li key={item.name} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6">
                      <span className="icon-chip mt-0.5 h-9 w-9 shrink-0">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-[15px] font-semibold text-white">{item.name}</span>
                        <span className="mt-1 block text-[13px] leading-relaxed text-slate-500">{item.desc}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Closing CTA — two distinct intents (contribute / integrate), neither
          duplicating the hero's feeds or GitHub actions. */}
      <motion.div
        {...rise(0)}
        className="glass-card relative mx-auto mt-24 w-full max-w-4xl overflow-hidden rounded-[2rem] p-10 text-center shadow-glass-lux md:p-14"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-red-900/10"
        />
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Join the defense.
          </h2>
          <p className="mx-auto mb-8 mt-4 max-w-xl leading-relaxed text-slate-300">
            Every report strengthens the feed. Submit malicious indicators and
            help protect networks around the world.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/report"
              className="group inline-flex items-center gap-2 rounded-2xl bg-red-600 px-7 py-3 text-sm font-semibold text-white shadow-glow-ruby transition-all hover:bg-red-500 active:scale-[0.98]"
            >
              <ShieldCheck className="h-4 w-4" />
              Report a threat
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/api"
              className="inline-flex items-center gap-2 rounded-2xl border border-platinum-400/20 bg-white/[0.03] px-7 py-3 text-sm font-semibold text-platinum-300 backdrop-blur-md transition-all hover:border-platinum-400/40 hover:text-white"
            >
              View the API docs
            </Link>
          </div>
        </div>
      </motion.div>
    </IsoPageShell>
  )
}
