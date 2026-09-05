import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Crown, Layers, Minus, Radar, ShieldCheck, Zap } from 'lucide-react'
import IsoPageShell from './layout/IsoPageShell'
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

const ROW = { hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }
const listStagger = (delay: number) => ({
  hidden: {},
  show: { transition: { delayChildren: delay, staggerChildren: 0.035 } },
})

function FeatureRow({ label, on }: { label: string; on: boolean }) {
  return (
    <motion.li variants={ROW} className="flex items-start gap-2.5 text-sm">
      {on
        ? <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        : <Minus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />}
      <span className={on ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
      <span className="sr-only">{on ? '(included)' : '(not included)'}</span>
    </motion.li>
  )
}

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description:
      'Free open-source blocklists for everyone, permanently. Threatbase Pro is launching soon: our own sensors and aggregation behind 15-minute, per-category feeds in firewall-ready formats — $25/month at launch. Join the waitlist.',
    path: '/pricing',
  })
  const reduce = useReducedMotion()
  const anim = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay },
  })

  return (
    <IsoPageShell color="207, 23, 51">
      <div className="mx-auto w-full max-w-5xl">
        <motion.div {...anim(0)} className="mb-14 text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-400">
            <span className="relative flex h-1.5 w-1.5">
              {!reduce && (
                <span aria-hidden className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              )}
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
            </span>
            Pro — launching soon
          </span>
          <h1 className="text-5xl font-extrabold tracking-tighter text-white lg:text-6xl">
            Free for everyone.<br /><span className="text-red-500">Pro for defenders.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-slate-400">
            The data stays open. Pro adds our own sensors, our own aggregation, and feeds
            fresh and accurate enough for your firewall to trust unattended.
          </p>
        </motion.div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Community */}
          <motion.div
            {...anim(0.1)}
            whileHover={reduce ? undefined : { y: -4 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-white/20"
          >
            <div className="mb-6 flex items-center gap-2 text-slate-300">
              <Zap aria-hidden className="h-5 w-5" />
              <span className="text-sm font-bold uppercase tracking-widest">Community</span>
              <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Live now
              </span>
            </div>
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-white">$0</span>
              <span className="text-sm text-slate-500">forever</span>
            </div>
            <motion.ul
              variants={listStagger(0.3)}
              initial={reduce ? false : 'hidden'}
              animate="show"
              className="space-y-3"
            >
              {FEATURES.map(([label, free]) => (
                <FeatureRow key={label} label={label} on={free} />
              ))}
            </motion.ul>
            <a
              href="/threatfeed"
              className="group mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-4 text-sm font-bold text-slate-200 transition-all hover:border-white/25 hover:bg-white/[0.06] active:scale-[0.98]"
            >
              Browse the feeds
              <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="mt-4 text-center text-[11px] text-slate-600">
              Raw lists, daily sync, no auth, no rate limits — from the Threat Feed page or GitHub.
            </p>
          </motion.div>

          {/* Pro — not purchasable yet, so every affordance points at the waitlist */}
          <motion.div {...anim(0.2)} className="relative overflow-hidden rounded-2xl p-[1.5px] shadow-glow-ruby">
            {/* Rotating conic sweep sits under the card and shows only as a 1.5px edge.
                Square is 2x the box so the gradient covers all four corners as it turns. */}
            {!reduce && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  background:
                    'conic-gradient(from 0deg, rgba(239,68,68,0) 0deg, rgba(239,68,68,0.9) 40deg, rgba(245,158,11,0.7) 70deg, rgba(239,68,68,0) 120deg, rgba(239,68,68,0) 360deg)',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
              />
            )}
            <div aria-hidden className="absolute inset-0 rounded-2xl border border-red-500/40" />

            <div className="relative rounded-2xl bg-[#0A0A0A] p-8">
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-red-500/[0.04]" />
              <div className="relative">
                <div className="mb-6 flex items-center gap-2 text-white">
                  <Crown aria-hidden className="h-5 w-5 text-amber-400" />
                  <span className="text-sm font-bold uppercase tracking-widest">Pro</span>
                  <span className="relative ml-auto overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Launching soon
                    {!reduce && (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                        initial={{ x: '-120%' }}
                        animate={{ x: '220%' }}
                        transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2.4 }}
                      />
                    )}
                  </span>
                </div>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold text-white">${PRICE}</span>
                  <span className="text-sm text-slate-500">/ month at launch</span>
                </div>
                <p className="mb-6 text-xs text-slate-500">
                  Nothing to pay today — the waitlist is free and gets you launch pricing.
                </p>

                <motion.ul
                  variants={listStagger(0.4)}
                  initial={reduce ? false : 'hidden'}
                  animate="show"
                  className="space-y-3"
                >
                  {FEATURES.map(([label]) => (
                    <FeatureRow key={label} label={label} on />
                  ))}
                </motion.ul>

                <motion.a
                  href={WAITLIST_HREF}
                  whileHover={reduce ? undefined : { scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="group mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-sm font-bold text-white shadow-glow-ruby transition-colors hover:bg-red-500"
                >
                  Join the waitlist
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </motion.a>
                <p className="mt-4 text-center text-[11px] text-slate-500">
                  We email you the day Pro opens. Onboarding is by hand at first: generate a
                  key in <a href="/profile" className="text-slate-300 hover:underline">Profile</a>,
                  send us its prefix, and your token URL comes back with it.
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* What the money actually buys — the three things Pro is being built on. */}
        <motion.h2 {...anim(0.3)} className="mt-20 mb-2 text-center text-2xl font-extrabold tracking-tight text-white">
          What Pro is built on
        </motion.h2>
        <motion.p {...anim(0.34)} className="mx-auto mb-8 max-w-xl text-center text-sm text-slate-500">
          Community re-publishes what 54 public sources report. Pro adds what we see and
          verify ourselves.
        </motion.p>
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              {...anim(0.4 + i * 0.08)}
              whileHover={reduce ? undefined : { y: -4 }}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-red-500/30"
            >
              <Icon aria-hidden className="mb-4 h-5 w-5 text-red-500" />
              <h3 className="mb-2 text-sm font-bold text-white">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-500">{body}</p>
            </motion.div>
          ))}
        </div>

        <motion.p {...anim(0.6)} className="mt-10 text-center text-xs text-slate-600">
          One seat = one token URL usable across your network devices. Community feeds stay
          free and MIT-licensed, permanently.
        </motion.p>
      </div>
    </IsoPageShell>
  )
}
