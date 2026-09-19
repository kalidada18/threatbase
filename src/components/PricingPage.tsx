import { useRef } from 'react'
import { ArrowRight, Check, ChevronDown, Crown, FileDown, Filter, LayoutGrid, Radar, Sparkles, X, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useSEO } from '@/useSEO'
import { PRO_FEATURES, PRO_PRICE } from '@/proFeatures'
import { EASE_EXPO } from './motion/primitives'
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
  'Bulk / CSV hunt: 1 scan a day, up to 250 indicators',
  'Open source, MIT, no auth, no rate limits',
] as const

// Pro rows live in src/proFeatures.ts: the landing Pro band quotes the top
// three from there verbatim, so the wording has one home.

// The tier difference stated once, cell-by-cell. `true` renders a check,
// `false` a dash, and a string is shown verbatim (used for the bulk quota so
// the numbers can never read differently on the card and in the table).
type Cell = boolean | string
const COMPARISON: { label: string; free: Cell; pro: Cell }[] = [
  { label: 'IP, IPv6, CIDR, domain, URL & hash intel', free: true, pro: true },
  { label: 'Hunt console + community reports', free: true, pro: true },
  { label: 'Open corpus, MIT, no key required', free: true, pro: true },
  { label: 'Bulk / CSV hunt', free: '1 / day · 250 rows', pro: '10 / day · 10,000 rows' },
  { label: 'Per-category blocklists (C2 without Tor)', free: false, pro: true },
  { label: 'Your own allowlist applied server-side', free: false, pro: true },
  { label: 'False positives reviewed before publish', free: false, pro: true },
  { label: 'First-hand intel', free: false, pro: true },
  { label: 'Firewall / IDS / SIEM formats + stable URL', free: false, pro: true },
  { label: 'Source liveness monitoring', free: false, pro: true },
]

// Capability bento: the "what Pro actually is" chapter. Every tile restates a
// fact already present elsewhere on this page (coverage, quota, formats,
// suppression, liveness) — reframed for scanning, never a new claim. The grid
// is a dense 6-column matrix: 3+3 then 2+2+2, so it interlocks with zero voids.
type Tile = {
  icon: typeof Zap
  span: string
  kicker: string
  figures?: { value: string; label: string }[]
  body?: string
  accent?: boolean
}
const BENTO: Tile[] = [
  {
    icon: LayoutGrid,
    span: 'lg:col-span-3',
    kicker: 'One corpus, every indicator',
    body: 'IPv4, IPv6, CIDR, domain, URL and file hash — classified on sight and searched in a single pass, not six different tools.',
  },
  {
    icon: Zap,
    span: 'lg:col-span-3',
    kicker: 'Bulk hunt at real scale',
    accent: true,
    figures: [
      { value: '10', label: 'scans / day' },
      { value: '10,000', label: 'rows / scan' },
    ],
    body: 'Drop a whole spreadsheet and read every cell against the live corpus, then export the ledger back as CSV.',
  },
  {
    icon: FileDown,
    span: 'lg:col-span-2',
    kicker: 'Formats that just load',
    body: 'Firewall, IDS/IPS and SIEM feeds under one stable auto-update URL.',
  },
  {
    icon: Filter,
    span: 'lg:col-span-2',
    kicker: 'Precision you can block on',
    body: 'Reviewed false-positive suppression plus your own allowlist applied server-side.',
  },
  {
    icon: Radar,
    span: 'lg:col-span-2',
    kicker: 'Never stale',
    body: 'Every source is liveness-monitored; dead feeds are dropped, not left to rot.',
  },
]

// A mock ledger for the bulk-hunt showcase — illustrative verdicts only, so it
// reads as a preview and not live intel.
const SHOWCASE_ROWS: { value: string; status: 'malicious' | 'clean' | 'disputed'; note: string }[] = [
  { value: '185.220.101.44', status: 'malicious', note: 'C2 · 6 feeds' },
  { value: 'evil-cdn[.]xyz', status: 'malicious', note: 'phishing · 4 feeds' },
  { value: '93.184.216.34', status: 'clean', note: 'not listed' },
  { value: 'd41d8cd9…ecf8427e', status: 'disputed', note: '3 disputes' },
  { value: 'http://updates-verify[.]top/gate', status: 'malicious', note: 'malware · 2 feeds' },
]
const SHOWCASE_META = {
  malicious: { label: 'Threat', dot: 'bg-red-400', cls: 'text-red-400' },
  clean: { label: 'Clean', dot: 'bg-emerald-400', cls: 'text-emerald-400' },
  disputed: { label: 'Disputed', dot: 'bg-amber-400', cls: 'text-amber-400' },
} as const

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How much does Threatbase Pro cost?',
    a: `$${PRICE} per month at launch. Nothing is payable today — the waitlist is free and holds launch pricing for early members.`,
  },
  {
    q: 'What exactly do I get?',
    a: 'Per-category blocklists, a personal allowlist applied server-side, reviewed false-positive suppression, first-hand intel, firewall/IDS/SIEM formats under one stable auto-update URL, and bulk hunt at Pro scale (10 scans a day, up to 10,000 indicators each).',
  },
  {
    q: 'How is Pro delivered?',
    a: 'One seat is one token URL for all your devices. Early onboarding is by hand: generate a key in your Profile, send us its prefix, and we reply with your private feed URL.',
  },
  {
    q: 'Is the free corpus going away?',
    a: 'No. Everything open today stays open — commercially licensed, no auth, no rate limits on browsing. Pro adds precision, privacy and convenience on top, not a paywall around what is already free.',
  },
  {
    q: 'What are the bulk-hunt limits?',
    a: 'Free signed-in accounts get one bulk scan a day of up to 250 indicators. Pro raises it to 10 scans a day and the full 10,000 indicators per run. The count resets at 00:00 UTC.',
  },
  {
    q: 'Why a waitlist instead of instant checkout?',
    a: 'First Pro members are onboarded manually so the feeds are verified against the exact firewall, IDS or SIEM you run before you rely on them in production.',
  },
]

// FAQPage JSON-LD: the same answers, emitted as structured data so search and
// AI answer engines can cite them. Rendered once; derived from the FAQ array so
// the visible accordion and the schema can never drift.
const FAQ_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
})

/**
 * Per-word mask reveal: each word rises out of an overflow-hidden line box on a
 * stagger. The scroll-triggered "text draws itself in" motion, done in
 * framer-motion (the repo's stack) instead of a GSAP SplitText. Static, plain
 * text under reduced-motion.
 */
function WordReveal({
  text,
  className = '',
  delay = 0,
  reduce = false,
}: {
  text: string
  className?: string
  delay?: number
  reduce?: boolean
}) {
  if (reduce) return <span className={className}>{text}</span>
  const words = text.split(' ')
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.1em] -mb-[0.1em] align-bottom">
          <motion.span
            className="inline-block will-change-transform"
            initial={{ y: '115%' }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: delay + i * 0.06, ease: EASE_EXPO }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

function FeatureRow({ label, pro }: { label: string; pro?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-300">
      <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${pro ? 'text-red-500' : 'text-platinum-300'}`} />
      <span>{label}</span>
    </li>
  )
}

function CompareCell({ v, pro }: { v: Cell; pro?: boolean }) {
  if (v === true) return <Check aria-hidden className={`mx-auto h-4 w-4 ${pro ? 'text-red-500' : 'text-platinum-200'}`} />
  if (v === false) return <X aria-hidden className="mx-auto h-4 w-4 text-slate-700" />
  return <span className={`text-[11px] font-semibold ${pro ? 'text-red-400' : 'text-slate-400'}`}>{v}</span>
}

/* Shared acrylic surface: gradient body, hairline top highlight, and a deep
   tinted ambient shadow. preserve-3d so rows inside can float on Z. */
const CARD_SURFACE =
  'relative flex h-full flex-col rounded-2xl border p-8 [transform-style:preserve-3d]'
const COMMUNITY_SURFACE =
  'border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] shadow-[0_45px_90px_-35px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.09)]'
const PRO_SURFACE =
  'border-red-500/40 bg-gradient-to-b from-red-500/[0.09] to-white/[0.02] shadow-[0_50px_110px_-35px_rgba(207,23,51,0.32),0_25px_60px_-25px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14)]'
const PANEL =
  'relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/70 to-slate-950/80 backdrop-blur-2xl shadow-glass-lux'
const TILE =
  'group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6 transition-colors duration-500 hover:border-white/20'
const GRAIN = 'grain pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.05]'

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description:
      'Threatbase Pro: $25/month per-category blocklists, firewall and STIX 2.1 formats, bulk hunt at scale, and 15-minute refresh backed by our own sensors. Free feeds stay free, forever. Join the waitlist.',
    path: '/pricing',
  })

  const reduce = useReducedMotion() ?? false

  // Attention chapter: the hero recedes and darkens as the page scrolls in
  // under it (GSAP scrub, ported to framer-motion). Deltas collapse to zero
  // under reduced-motion, so the transform stays but never moves.
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -70])
  const heroFade = useTransform(scrollYProgress, [0, 0.85], [1, reduce ? 1 : 0])

  const rise = (delay: number) => ({
    initial: reduce ? undefined : { opacity: 0, y: 28, rotateX: reduce ? 0 : -6 },
    whileInView: reduce ? undefined : { opacity: 1, y: 0, rotateX: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.6, delay, ease: EASE_EXPO },
  })

  return (
    <div className="relative w-full overflow-x-hidden bg-app font-sans">
      {/* FAQPage structured data (schema.org) for rich results and AI answer engines. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }}
      />

      {/* Studio lighting behind the hero: one ruby key light, one platinum fill. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-28 h-[520px]"
        style={{
          background:
            'radial-gradient(720px 340px at 26% 16%, rgba(207,23,51,0.15), transparent 70%), radial-gradient(620px 320px at 78% 30%, rgba(205,211,222,0.08), transparent 70%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 pt-28 pb-28">
        {/* ============ ATTENTION — hero ============ */}
        {/* Wide editorial headline on a max-w-5xl flow: two lines, never a
            text wall. Words draw themselves in; the whole block parallaxes
            away on scroll. CTAs live in the cards, so no buttons up here. */}
        <motion.div ref={heroRef} style={reduce ? undefined : { y: heroY, opacity: heroFade }} className="max-w-5xl [transform-style:preserve-3d]">
          <motion.span {...rise(0)} className="eyebrow mb-8 inline-block">
            Pro launching soon
          </motion.span>
          <h1 className="text-[clamp(3rem,7vw,5.5rem)] font-extrabold leading-[0.98] tracking-tighter text-white">
            <WordReveal text="Free for everyone." reduce={reduce} />
            <br />
            <WordReveal text="Precise for defenders." className="text-liquid-red" delay={0.28} reduce={reduce} />
          </h1>
          <motion.p {...rise(0.5)} className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-400 md:text-xl">
            The whole corpus stays open and MIT. Pro adds first-hand sensor intel,
            per-category lists, suppression you can block on, and bulk hunt at real
            scale.
          </motion.p>
        </motion.div>

        {/* ============ Pricing slabs (early Action anchor) ============ */}
        {/* Two sheets of acrylic on the same table, Pro lit harder. */}
        <motion.section {...rise(0.12)} className="mt-20 grid grid-flow-dense items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
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

        {/* ============ INTEREST — capability bento ============ */}
        {/* Dense, interlocking 6-column matrix (3+3 / 2+2+2). grid-flow-dense
            guarantees no void; tiles lift subtly on hover. */}
        <section className="mt-32 md:mt-48">
          <motion.header {...rise(0)} className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              What Pro actually puts in your hands
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-400">
              Not a paywalled slice of the free corpus — a different instrument.
            </p>
          </motion.header>
          <div className="grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {BENTO.map((t, i) => {
              const Icon = t.icon
              return (
                <motion.div
                  key={t.kicker}
                  {...rise(0.05 * i)}
                  whileHover={reduce ? undefined : { y: -4 }}
                  transition={{ duration: 0.5, delay: 0.05 * i, ease: EASE_EXPO }}
                  className={`${TILE} ${t.span} ${t.accent ? 'border-red-500/30 from-red-500/[0.09] to-white/[0.015]' : ''}`}
                >
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${
                      t.accent
                        ? 'bg-[radial-gradient(420px_circle_at_30%_0%,rgba(207,23,51,0.18),transparent_70%)]'
                        : 'bg-[radial-gradient(420px_circle_at_30%_0%,rgba(255,255,255,0.06),transparent_70%)]'
                    }`}
                  />
                  <Icon aria-hidden className={`relative h-6 w-6 ${t.accent ? 'text-red-400' : 'text-platinum-200'}`} />
                  <h3 className="relative mt-5 text-lg font-semibold leading-snug text-white">{t.kicker}</h3>
                  {t.figures && (
                    <div className="relative mt-4 flex gap-8">
                      {t.figures.map((f) => (
                        <div key={f.label}>
                          <div className="font-mono text-3xl font-extrabold text-liquid-red md:text-4xl">{f.value}</div>
                          <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{f.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="relative mt-4 text-sm leading-relaxed text-slate-400">{t.body}</p>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* ============ DESIRE — bulk showcase (pinned title) ============ */}
        {/* Left column pins on scroll while the verdict ledger rises past it —
            the split-pin GSAP motion via native sticky. Rows scale-and-fade in
            on entry. */}
        <motion.section {...rise(0.1)} className="mt-32 md:mt-48">
          <div className={`${PANEL} p-8 md:p-12`}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/80 to-transparent" />
            <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
              <div className="lg:sticky lg:top-28">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-red-400">
                  <Sparkles aria-hidden className="h-3.5 w-3.5" /> Bulk hunt
                </span>
                <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white md:text-[2.5rem]">
                  Drop a spreadsheet. Get a verdict on every row.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate-400">
                  Paste indicators or load a CSV / Excel and Threatbase reads every
                  cell — up to 10,000 unique IP, domain, URL and hash indicators
                  against the live corpus in one pass, then exports the whole ledger
                  back as CSV. Pro runs it 10 times a day.
                </p>
                <Link
                  to="/threatfeed"
                  className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-platinum-200 transition-colors hover:text-white"
                >
                  Try the hunt console <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </div>

              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950/50" aria-label="Example bulk scan results">
                {SHOWCASE_ROWS.map((r, i) => {
                  const m = SHOWCASE_META[r.status]
                  return (
                    <motion.li
                      key={r.value}
                      initial={reduce ? undefined : { opacity: 0, scale: 0.98, x: -10 }}
                      whileInView={reduce ? undefined : { opacity: 1, scale: 1, x: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.4, delay: 0.08 + i * 0.09, ease: EASE_EXPO }}
                      className="flex items-center gap-3 px-4 py-4"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-200" title={r.value}>{r.value}</span>
                      <span className="hidden sm:inline shrink-0 text-[11px] text-slate-500">{r.note}</span>
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>{m.label}</span>
                    </motion.li>
                  )
                })}
              </ul>
            </div>
          </div>
        </motion.section>

        {/* ============ Comparison: the whole tier difference on one screen ============ */}
        <motion.section {...rise(0.05)} className="mt-32 md:mt-48">
          <header className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Compare every row</h2>
            <p className="mt-3 text-base text-slate-400">Free is the whole open corpus. Pro is precision, privacy and scale.</p>
          </header>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th scope="col" className="w-1/2 px-5 py-4 font-semibold text-slate-300">Feature</th>
                  <th scope="col" className="w-1/4 px-4 py-4 text-center">
                    <span className="block text-xs font-bold uppercase tracking-widest text-slate-400">Community</span>
                    <span className="font-mono text-sm text-slate-500">$0</span>
                  </th>
                  <th scope="col" className="w-1/4 px-4 py-4 text-center">
                    <span className="block text-xs font-bold uppercase tracking-widest text-red-400">Pro</span>
                    <span className="font-mono text-sm text-red-400/80">${PRICE}/mo</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={row.label} className={i % 2 ? 'bg-white/[0.015]' : ''}>
                    <th scope="row" className="px-5 py-3.5 text-left font-normal text-slate-300">{row.label}</th>
                    <td className="px-4 py-3.5 text-center"><CompareCell v={row.free} /></td>
                    <td className="px-4 py-3.5 text-center bg-red-500/[0.04]"><CompareCell v={row.pro} pro /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        {/* ============ FAQ: objection handling ============ */}
        {/* Real <details> for keyboard + screen-reader support, no JS state. */}
        <motion.section {...rise(0.05)} className="mx-auto mt-32 max-w-3xl md:mt-48">
          <header className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Questions, answered</h2>
          </header>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 transition-colors hover:border-white/15">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-slate-100 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
              </details>
            ))}
          </div>
        </motion.section>

        {/* ============ ACTION — closing CTA band ============ */}
        {/* The terminal beat: one wide, high-contrast slab that leaves exactly
            one thing to do. */}
        <motion.section {...rise(0)} className="relative mt-32 md:mt-48">
          <div className="relative overflow-hidden rounded-3xl border border-red-500/25 bg-gradient-to-b from-red-500/[0.12] to-slate-950/60 px-8 py-16 text-center shadow-[0_60px_140px_-50px_rgba(207,23,51,0.4)] md:px-16 md:py-24">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(560px 280px at 50% 0%, rgba(207,23,51,0.24), transparent 72%)',
              }}
            />
            <span aria-hidden className={GRAIN} />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-4xl font-extrabold leading-[1.02] tracking-tighter text-white md:text-6xl">
                Block the noise. Keep the signal.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
                Join the Pro waitlist and lock launch pricing. We verify every feed
                against the exact firewall, IDS or SIEM you run before you depend on
                it.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Magnetic strength={0.12}>
                  <a
                    href={WAITLIST_HREF}
                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-9 py-4 text-base font-bold text-white shadow-[0_18px_50px_-12px_rgba(207,23,51,0.7),inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors hover:bg-red-500 active:scale-[0.98] sm:w-auto"
                  >
                    Join the waitlist
                    <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </Magnetic>
                <Link
                  to="/threatfeed"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-9 py-4 text-base font-bold text-slate-200 transition-colors hover:border-white/30 active:scale-[0.98] sm:w-auto"
                >
                  Hunt the free corpus
                </Link>
              </div>
              <p className="mt-6 text-xs uppercase tracking-widest text-slate-500">
                ${PRICE}/mo at launch · free forever community feeds · no card today
              </p>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
