import { ArrowRight, Check, Crown, Zap } from 'lucide-react'
import { useSEO } from '@/useSEO'

const PRO_EMAIL = 'threatbasepro@gmail.com'
const PRICE = 25

const WAITLIST_HREF =
  `mailto:${PRO_EMAIL}?subject=${encodeURIComponent('Threatbase Pro waitlist')}` +
  `&body=${encodeURIComponent(
    'Hi,\n\nPut me on the Threatbase Pro waitlist.\n\n' +
      'What I want to block: \nFirewall / IDS / SIEM I run: \n',
  )}`

// Each free row is a fact about the open corpus, nothing more.
const FREE_FEATURES = [
  'Every IOC type: IP, IPv6, CIDR, domain, URL, hash',
  'Hunt console and community reports',
  'Open source, MIT, no auth, no rate limits',
] as const

// Ranked by what research says people actually pay for (2026-09 pass):
// suppression first, then category aim, first-hand speed, source liveness.
// Formats/token URL are the compatibility promise, parked last on purpose.
const PRO_FEATURES = [
  'False positives reviewed and pulled before every publish',
  'Your own allowlist applied server-side to every download',
  'Per-category lists: block C2 without blocking Tor',
  'First-hand honeypot intel, listed minutes after our sensors see it',
  'Every source liveness-monitored: dead ones dropped, never stale',
  'Formats for your firewall, IDS/IPS and SIEM, under one stable auto-update URL',
] as const

function FeatureRow({ label, pro }: { label: string; pro?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-300">
      <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${pro ? 'text-red-500' : 'text-platinum-300'}`} />
      <span>{label}</span>
    </li>
  )
}

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description:
      'Free open-source blocklists for everyone, permanently. Threatbase Pro is launching soon: per-category IP lists, firewall and STIX 2.1 formats, and a 15-minute refresh backed by our own sensors. $25/month at launch. Join the waitlist.',
    path: '/pricing',
  })

  return (
    <div className="w-full bg-app font-sans">
      <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-24">
        {/* Hero: headline and promise, the CTAs live in the cards below. */}
        <header className="max-w-3xl">
          <span className="eyebrow mb-6">Pro launching soon</span>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tighter text-white lg:text-6xl">
            Free for everyone.
            <br />
            <span className="text-red-500">Precise for defenders.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            The whole corpus stays open and MIT. Pro adds first-hand sensor
            intel, per-category lists, and suppression you can block on.
          </p>
        </header>

        {/* Pricing: two plans, side by side, each saying only its own piece. */}
        <section className="mt-16 grid items-stretch gap-6 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-white/10 p-8">
            <div className="mb-6 flex items-center gap-2 text-slate-300">
              <Zap aria-hidden className="h-5 w-5" />
              <span className="text-sm font-bold uppercase tracking-widest">Community</span>
            </div>
            <div className="mb-8 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-extrabold text-white">$0</span>
              <span className="text-sm text-slate-500">forever</span>
            </div>
            <ul className="space-y-3">
              {FREE_FEATURES.map((label) => (
                <FeatureRow key={label} label={label} />
              ))}
            </ul>
            <a
              href="/threatfeed"
              className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-4 text-sm font-bold text-slate-200 transition-colors hover:border-white/25 active:scale-[0.98]"
            >
              Browse free feeds
            </a>
          </div>

          <div className="flex flex-col rounded-2xl border border-red-500/40 p-8">
            <div className="mb-6 flex items-center gap-2 text-white">
              <Crown aria-hidden className="h-5 w-5 text-red-500" />
              <span className="text-sm font-bold uppercase tracking-widest">Pro</span>
              <span className="ml-auto rounded-full border border-red-500/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                Launching soon
              </span>
            </div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-liquid-red font-mono text-5xl font-extrabold">${PRICE}</span>
              <span className="text-sm text-slate-500">/ month at launch</span>
            </div>
            <p className="mb-8 text-xs text-slate-500">
              Nothing to pay today. The waitlist is free and holds launch pricing.
            </p>
            <ul className="space-y-3">
              {PRO_FEATURES.map((label) => (
                <FeatureRow key={label} label={label} pro />
              ))}
            </ul>
            <a
              href={WAITLIST_HREF}
              className="group mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-sm font-bold text-white transition-colors hover:bg-red-500 active:scale-[0.98]"
            >
              Join the waitlist
              <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
              One seat is one token URL for all your devices. Onboarding is by hand at first:
              generate a key in <a href="/profile" className="text-slate-300 hover:underline">Profile</a>
              and send us its prefix. We reply with your token URL.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
