import { Link } from 'react-router-dom'
import { ArrowRight, Check, Crown } from 'lucide-react'
import Section from '../layout/Section'
import { PRO_LANDING_CLAIMS, PRO_PRICE } from '../../proFeatures'
import { usePro } from '../../usePro'

/**
 * Everything below the home console, in one lazy chunk so the hero (the only
 * thing a visitor sees first) does not wait on it. Home stays a hunting
 * console: counts live on /threatfeed, the explainer loop on /about, the feed
 * index on /threatfeed. Only the Pro band remains.
 */
export default function HomeSections() {
  return <ProBand />
}

/**
 * Pro band — the three claims the client-acquisition research ranked highest,
 * imported verbatim from proFeatures so /pricing stays the source of truth.
 * Two CTAs with different intents: keep using the free corpus, or get on the
 * waitlist. Hidden for signed-in Pro users (and while their status resolves,
 * so a paying member never sees the waitlist pitch flash).
 */
export function ProBand() {
  const { status } = usePro()
  if (status === 'pro' || status === 'checking') return null
  return (
    <Section id="pro" spacing="md">
      <div className="glass-card relative overflow-hidden p-8 md:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-red-500/[0.07] blur-3xl"
        />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <div className="mb-5 flex items-center gap-2 text-white">
              <Crown aria-hidden className="h-5 w-5 text-red-500" />
              <span className="text-sm font-bold uppercase tracking-widest">Pro launching soon</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Feeds you can block on
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400">
              The open corpus stays MIT and free. Pro is ${PRO_PRICE} a month at launch.
              The waitlist costs nothing and holds that price.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/threatfeed"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3.5 text-sm font-bold text-slate-200 transition-colors hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 active:scale-[0.98]"
              >
                Browse free feeds
              </Link>
              <Link
                to="/pricing"
                className="group inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_-12px_rgba(207,23,51,0.65)] transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 active:scale-[0.98]"
              >
                Join the Pro waitlist
                <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          <ul className="space-y-4">
            {PRO_LANDING_CLAIMS.map((claim) => (
              <li key={claim} className="flex items-start gap-3 text-sm text-slate-300 md:text-base">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span>{claim}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
