import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import { Check, Minus, Zap, Crown } from 'lucide-react'
import { useSEO } from '@/useSEO'

const PRO_EMAIL = 'threatbasepro@gmail.com'

const FREE = [
  ['Daily-updated blocklists', true],
  ['All IOC types (IP, domain, hash, URL)', true],
  ['Hunt console & community reports', true],
  ['Free & open source (MIT)', true],
  ['15-minute fresh feeds', false],
  ['Per-category IP lists (brute-force, C2, spam…)', false],
  ['Firewall formats (ipset, Suricata, plain)', false],
  ['Stable token URL for firewall auto-update', false],
  ['False-positive suppression guarantee', false],
  ['Email support', false],
] as const

const PRO = [
  ['Daily-updated blocklists', true],
  ['All IOC types (IP, domain, hash, URL)', true],
  ['Hunt console & community reports', true],
  ['Free & open source (MIT)', true],
  ['15-minute fresh feeds', true],
  ['Per-category IP lists (brute-force, C2, spam…)', true],
  ['Firewall formats (ipset, Suricata, plain)', true],
  ['Stable token URL for firewall auto-update', true],
  ['False-positive suppression guarantee', true],
  ['Email support', true],
] as const

function FeatureRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {on
        ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />}
      <span className={on ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
    </li>
  )
}

export default function PricingPage() {
  useSEO({
    title: 'Pricing | Threatbase Pro Feeds',
    description: 'Free open-source blocklists for everyone. Threatbase Pro adds 15-minute fresh, per-category feeds in firewall-ready formats with stable token URLs — $25/month.',
    path: '/pricing',
  })
  const prefersReducedMotion = useReducedMotion()
  const anim = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay },
  })

  return (
    <IsoPageShell color="207, 23, 51">
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-32">
        <motion.div {...anim(0)} className="mb-14 text-center">
          <h1 className="text-5xl font-extrabold tracking-tighter text-white lg:text-6xl">
            Free for everyone.<br /><span className="text-red-500">Pro for defenders.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-slate-400">
            The data stays open — Pro is about speed, curation, and feeds your firewall can trust unattended.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Free */}
          <motion.div {...anim(0.1)} className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
            <div className="mb-6 flex items-center gap-2 text-slate-300">
              <Zap className="h-5 w-5" />
              <span className="text-sm font-bold uppercase tracking-widest">Community</span>
            </div>
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-white">$0</span>
              <span className="text-sm text-slate-500">forever</span>
            </div>
            <ul className="space-y-3">
              {FREE.map(([label, on]) => <FeatureRow key={label} label={label} on={on} />)}
            </ul>
            <div className="mt-8 rounded-xl border border-white/5 bg-black/30 p-4 text-xs text-slate-500">
              Raw lists, daily sync, no auth. Grab them from the{' '}
              <a href="/threatfeed" className="text-slate-300 hover:underline">Threat Feed</a> page or GitHub.
            </div>
          </motion.div>

          {/* Pro */}
          <motion.div {...anim(0.2)} className="relative rounded-2xl border border-red-500/40 bg-red-500/[0.04] p-8 shadow-glow-ruby">
            <div className="absolute -top-3 right-6 rounded-full border border-amber-500/40 bg-[#0A0A0A] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
              $25 / month
            </div>
            <div className="mb-6 flex items-center gap-2 text-white">
              <Crown className="h-5 w-5 text-amber-400" />
              <span className="text-sm font-bold uppercase tracking-widest">Pro</span>
            </div>
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-white">$25</span>
              <span className="text-sm text-slate-500">/ month · cancel anytime</span>
            </div>
            <ul className="space-y-3">
              {PRO.map(([label, on]) => <FeatureRow key={label} label={label} on={on} />)}
            </ul>
            <a
              href={`mailto:${PRO_EMAIL}?subject=Threatbase%20Pro&body=Hi%2C%20I%27d%20like%20to%20activate%20Threatbase%20Pro.%0AKey%20prefix%3A%20(my%20API%20key%20prefix%20from%20Profile)`}
              className="mt-8 flex h-14 w-full items-center justify-center rounded-xl bg-red-600 text-sm font-bold text-white shadow-glow-ruby transition-all hover:bg-red-500 active:scale-[0.98]"
            >
              Email to activate
            </a>
            <p className="mt-4 text-center text-[11px] text-slate-500">
              Manual onboarding: generate an API key in <a href="/profile" className="text-slate-300 hover:underline">Profile</a>,
              send us its prefix, pay via PayPal/Wise invoice — your Pro URL arrives with a fresh key, usually same day.
            </p>
          </motion.div>
        </div>

        <motion.p {...anim(0.3)} className="mt-10 text-center text-xs text-slate-600">
          One seat = one token URL usable across your network devices. Non-commercial / research use of Community feeds stays free and MIT-licensed.
        </motion.p>
      </div>
    </IsoPageShell>
  )
}
