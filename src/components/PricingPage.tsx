import { ArrowRight, Check, Crown, Layers, Minus, Radar, ShieldCheck, Zap } from 'lucide-react'
import { useSEO } from '@/useSEO'

const PRO_EMAIL = 'threatbasepro@gmail.com'
const PRICE = 25

const WAITLIST_HREF =
  `mailto:${PRO_EMAIL}?subject=${encodeURIComponent('Threatbase Pro — waitlist')}` +
  `&body=${encodeURIComponent(
    'Hi,\n\nPut me on the Threatbase Pro waitlist.\n\n' +
      'What I want to block: \nFirewall / IDS / SIEM I run: \n',
  )}`

// [label, included in Community?] — Pro includes every row, so one list beats two.
const FEATURES = [
  ['Daily-updated blocklists', true],
  ['All IOC types (IP, IPv6, CIDR, domain, URL, hash)', true],
  ['Hunt console & community reports', true],
  ['Free & open source (MIT)', true],
  ['15-minute fresh feeds', false],
  ['First-party sensor telemetry', false],
  ['Per-category IP lists (brute-force, C2, spam…)', false],
  ['Firewall formats per category (ipset, Suricata, NDJSON)', false],
  ['Stable token URL for firewall auto-update', false],
  ['False-positive suppression guarantee', false],
  ['Email support', false],
] as const

const PILLARS = [
  {
    icon: Radar,
    title: 'Our own sensors',
    body: 'Threatbase-run honeypots and telemetry feed Pro directly, on top of the 54 public upstreams. Something our own sensors saw does not wait for anyone else to publish it first.',
  },
  {
    icon: Layers,
    title: 'Our own aggregation',
    body: 'Correlation, de-duplication and scoring run in-house against raw observations rather than inheriting each upstream’s verdict — so one noisy source cannot inflate an indicator by itself.',
  },
  {
    icon: ShieldCheck,
    title: 'Accuracy you can block on',
    body: 'Every IP carries how many independent sources saw it, whitelists and reported false positives are applied before publish, and manifest-pro.json ships a SHA-256 for every file.',
  },
] as const

function FeatureRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {on
        ? <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        : <Minus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />}
      <span className={on ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
      <span className="sr-only">{on ? '(included)' : '(not included)'}</span>
    </li>
  )
}

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description:
      'Free open-source blocklists for everyone, permanently. Threatbase Pro is launching soon: our own sensors and aggregation behind 15-minute, per-category feeds in firewall-ready formats — $25/month at launch. Join the waitlist.',
    path: '/pricing',
  })

  return (
    <div className="min-h-[100dvh] w-full bg-app font-sans">
      <div className="mx-auto w-full max-w-5xl px-6 pt-28 pb-24">
        <div className="mb-14 text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-400">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Pro — launching soon
          </span>
          <h1 className="text-5xl font-extrabold tracking-tighter text-white lg:text-6xl">
            Free for everyone.<br /><span className="text-red-500">Pro for defenders.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-slate-400">
            The data stays open. Pro adds our own sensors, our own aggregation, and feeds
            fresh and accurate enough for your firewall to trust unattended.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Community */}
          <div className="rounded-2xl border border-white/10 p-8">
            <div className="mb-6 flex items-center gap-2 text-slate-300">
              <Zap aria-hidden className="h-5 w-5" />
              <span className="text-sm font-bold uppercase tracking-widest">Community</span>
              <span className="ml-auto rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Live now
              </span>
            </div>
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-white">$0</span>
              <span className="text-sm text-slate-500">forever</span>
            </div>
            <ul className="space-y-3">
              {FEATURES.map(([label, free]) => (
                <FeatureRow key={label} label={label} on={free} />
              ))}
            </ul>
            <a
              href="/threatfeed"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-4 text-sm font-bold text-slate-200 hover:border-white/25"
            >
              Browse the feeds
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
            <p className="mt-4 text-center text-[11px] text-slate-600">
              Raw lists, daily sync, no auth, no rate limits — from the Threat Feed page or GitHub.
            </p>
          </div>

          {/* Pro — not purchasable yet, so every affordance points at the waitlist */}
          <div className="rounded-2xl border border-red-500/40 p-8">
            <div className="mb-6 flex items-center gap-2 text-white">
              <Crown aria-hidden className="h-5 w-5 text-amber-400" />
              <span className="text-sm font-bold uppercase tracking-widest">Pro</span>
              <span className="ml-auto rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Launching soon
              </span>
            </div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-white">${PRICE}</span>
              <span className="text-sm text-slate-500">/ month at launch</span>
            </div>
            <p className="mb-6 text-xs text-slate-500">
              Nothing to pay today — the waitlist is free and gets you launch pricing.
            </p>

            <ul className="space-y-3">
              {FEATURES.map(([label]) => (
                <FeatureRow key={label} label={label} on />
              ))}
            </ul>

            <a
              href={WAITLIST_HREF}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-sm font-bold text-white hover:bg-red-500"
            >
              Join the waitlist
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
            <p className="mt-4 text-center text-[11px] text-slate-500">
              We email you the day Pro opens. Onboarding is by hand at first: generate a
              key in <a href="/profile" className="text-slate-300 hover:underline">Profile</a>,
              send us its prefix, and your token URL comes back with it.
            </p>
          </div>
        </div>

        {/* What the money actually buys — the three things Pro is being built on. */}
        <h2 className="mt-20 mb-2 text-center text-2xl font-extrabold tracking-tight text-white">
          What Pro is built on
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-center text-sm text-slate-500">
          Community re-publishes what 54 public sources report. Pro adds what we see and
          verify ourselves.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/10 p-6">
              <Icon aria-hidden className="mb-4 h-5 w-5 text-red-500" />
              <h3 className="mb-2 text-sm font-bold text-white">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-500">{body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate-600">
          One seat = one token URL usable across your network devices. Community feeds stay
          free and MIT-licensed, permanently.
        </p>
      </div>
    </div>
  )
}
