import { ArrowRight, Check, Crown, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useSEO } from '@/useSEO'
import { PRO_FEATURES, PRO_PRICE } from '@/proFeatures'
import { TiltCard } from './motion/TiltCard'
import { Magnetic } from './motion/Magnetic'

const PRO_EMAIL = 'threatbasepro@gmail.com'
const PRICE = PRO_PRICE

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

// Pro rows live in src/proFeatures.ts: the landing Pro band quotes the top
// three from there verbatim, so the wording has one home.

function FeatureRow({ label, pro }: { label: string; pro?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-300">
      <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${pro ? 'text-red-500' : 'text-platinum-300'}`} />
      <span>{label}</span>
    </li>
  )
}

/* Shared acrylic surface: gradient body, hairline top highlight, and a deep
   tinted ambient shadow. preserve-3d so rows inside can float on Z. */
const CARD_SURFACE =
  'relative flex h-full flex-col rounded-2xl border p-8 [transform-style:preserve-3d]'
const COMMUNITY_SURFACE =
  'border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] shadow-[0_45px_90px_-35px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.09)]'
const PRO_SURFACE =
  'border-red-500/40 bg-gradient-to-b from-red-500/[0.09] to-white/[0.02] shadow-[0_50px_110px_-35px_rgba(207,23,51,0.32),0_25px_60px_-25px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14)]'

/* Pointer-events pass through: it is texture, not a control. */
const GRAIN = 'grain pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.05]'

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description:
      'Threatbase Pro: $25/month per-category blocklists, firewall and STIX 2.1 formats, and 15-minute refresh backed by our own sensors. Free feeds stay free, forever. Join the waitlist.',
    path: '/pricing',
  })

  const reduce = useReducedMotion()
  const rise = (delay: number) => ({
    initial: reduce ? undefined : { opacity: 0, y: 28, rotateX: reduce ? 0 : -6 },
    whileInView: reduce ? undefined : { opacity: 1, y: 0, rotateX: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  })

  return (
    <div className="relative w-full overflow-hidden bg-app font-sans">
      {/* Studio lighting behind the hero: one ruby key light, one platinum fill. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-28 h-[460px]"
        style={{
          background:
            'radial-gradient(640px 300px at 28% 18%, rgba(207,23,51,0.13), transparent 70%), radial-gradient(560px 300px at 76% 30%, rgba(205,211,222,0.07), transparent 70%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 pt-24 pb-24">
        {/* Hero: headline and promise, the CTAs live in the cards below. */}
        <motion.header {...rise(0)} className="max-w-3xl [transform-style:preserve-3d]">
          <span className="eyebrow mb-6">Pro launching soon</span>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tighter text-white lg:text-6xl">
            Free for everyone.
            <br />
            <span className="text-liquid-red">Precise for defenders.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            The whole corpus stays open and MIT. Pro adds first-hand sensor
            intel, per-category lists, and suppression you can block on.
          </p>
        </motion.header>

        {/* Pricing: two slabs of acrylic on the same table, Pro lit harder. */}
        <motion.section
          {...rise(0.12)}
          className="mt-16 grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8"
        >
          <TiltCard maxTilt={4.5} glow="rgba(205,211,222,0.10)" className="rounded-2xl">
            <div className={`${CARD_SURFACE} ${COMMUNITY_SURFACE}`}>
              <span aria-hidden className={GRAIN} />
              <div className="mb-6 flex items-center gap-2 text-slate-300" style={{ transform: 'translateZ(22px)' }}>
                <Zap aria-hidden className="h-5 w-5" />
                <span className="text-sm font-bold uppercase tracking-widest">Community</span>
              </div>
              <div className="mb-8 flex items-baseline gap-2" style={{ transform: 'translateZ(42px)' }}>
                <span className="font-mono text-5xl font-extrabold text-white drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]">$0</span>
                <span className="text-sm text-slate-500">forever</span>
              </div>
              <ul className="space-y-3" style={{ transform: 'translateZ(14px)' }}>
                {FREE_FEATURES.map((label) => (
                  <FeatureRow key={label} label={label} />
                ))}
              </ul>
              <Magnetic strength={0.1} className="mt-auto pt-8 [transform-style:preserve-3d]">
                <Link
                  to="/threatfeed"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] py-4 text-sm font-bold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:border-white/30 active:scale-[0.98]"
                  style={{ transform: 'translateZ(26px)' }}
                >
                  Browse free feeds
                </Link>
              </Magnetic>
            </div>
          </TiltCard>

          <TiltCard maxTilt={6} className="rounded-2xl">
            <div className={`${CARD_SURFACE} ${PRO_SURFACE}`}>
              <span aria-hidden className={GRAIN} />
              <div className="mb-6 flex items-center gap-2 text-white" style={{ transform: 'translateZ(26px)' }}>
                <Crown aria-hidden className="h-5 w-5 text-red-500 drop-shadow-[0_4px_12px_rgba(207,23,51,0.5)]" />
                <span className="text-sm font-bold uppercase tracking-widest">Pro</span>
                <span className="ml-auto rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400 shadow-[0_8px_20px_-8px_rgba(207,23,51,0.6)]">
                  Launching soon
                </span>
              </div>
              <div className="mb-1 flex items-baseline gap-2" style={{ transform: 'translateZ(52px)' }}>
                <span className="text-liquid-red font-mono text-5xl font-extrabold drop-shadow-[0_14px_30px_rgba(207,23,51,0.35)]">${PRICE}</span>
                <span className="text-sm text-slate-500">/ month at launch</span>
              </div>
              <p className="mb-8 text-xs text-slate-500">
                Nothing to pay today. The waitlist is free and holds launch pricing.
              </p>
              <ul className="space-y-3" style={{ transform: 'translateZ(16px)' }}>
                {PRO_FEATURES.map((label) => (
                  <FeatureRow key={label} label={label} pro />
                ))}
              </ul>
              <Magnetic strength={0.12} className="mt-auto pt-8 [transform-style:preserve-3d]">
                <a
                  href={WAITLIST_HREF}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-sm font-bold text-white shadow-[0_16px_40px_-12px_rgba(207,23,51,0.65),inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors hover:bg-red-500 active:scale-[0.98]"
                  style={{ transform: 'translateZ(34px)' }}
                >
                  Join the waitlist
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Magnetic>
              <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500" style={{ transform: 'translateZ(8px)' }}>
                One seat is one token URL for all your devices. Onboarding is by hand at first:
                generate a key in <Link to="/profile" className="text-slate-300 hover:underline">Profile</Link>
                {' '}and send us its prefix. We reply with your token URL.
              </p>
            </div>
          </TiltCard>
        </motion.section>
      </div>
    </div>
  )
}
