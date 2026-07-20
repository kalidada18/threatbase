import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ExternalLink, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSEO } from '@/useSEO'
import { useIsDesktop } from '@/lib/useMediaQuery'
import supabaseClient from '@/supabaseClient'
import AnimatedShaderBackground from '@/components/ui/animated-shader-background'
import { Sparkles } from '@/components/ui/sparkles'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'

type Source = { name: string; desc: string; url: string }

const SOURCES: Source[] = [
  { name: 'Spamhaus', desc: 'DROP / EDROP hijacked & malicious netblocks', url: 'https://www.spamhaus.org/' },
  { name: 'FireHOL', desc: 'Curated IP blocklist aggregation (levels 1–3)', url: 'https://iplists.firehol.org/' },
  { name: 'Abuse.ch', desc: 'Feodo Tracker, ThreatFox, URLhaus & SSLBL', url: 'https://abuse.ch/' },
  { name: 'AbuseIPDB', desc: 'Community-reported IP abuse confidence scores', url: 'https://www.abuseipdb.com/' },
  { name: 'Emerging Threats', desc: 'Compromised hosts & firewall block rules', url: 'https://rules.emergingthreats.net/' },
  { name: 'SANS DShield', desc: 'Internet Storm Center attack sensor feed', url: 'https://www.dshield.org/' },
  { name: 'Blocklist.de', desc: 'Fail2ban-sourced brute-force & abuse reports', url: 'https://www.blocklist.de/' },
  { name: 'CINS Army', desc: 'CI Army low-noise malicious IP scoring', url: 'https://cinsscore.com/' },
  { name: 'IPsum', desc: 'Aggregated threat intelligence by source count', url: 'https://github.com/stamparm/ipsum' },
  { name: 'Binary Defense', desc: 'Community banlist of hostile systems', url: 'https://www.binarydefense.com/' },
  { name: 'GreenSnow', desc: 'Attackers detected probing servers worldwide', url: 'https://greensnow.co/' },
  { name: 'Tor Project', desc: 'Authoritative Tor exit-node lists', url: 'https://www.torproject.org/' },
  { name: 'OpenPhish', desc: 'Real-time phishing URL intelligence', url: 'https://openphish.com/' },
  { name: 'MalwareBazaar', desc: 'Malware sample hash sharing (abuse.ch)', url: 'https://bazaar.abuse.ch/' },
  { name: 'StevenBlack Hosts', desc: 'Unified malware & ad host blocklists', url: 'https://github.com/StevenBlack/hosts' },
  { name: 'DataPlane.org', desc: 'SSH, SIP & VNC abuse telemetry', url: 'https://dataplane.org/' },
]

export default function ThanksPage() {
  const [topReporter, setTopReporter] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const isDesktop = useIsDesktop()
  // Heavy GPU work (WebGL aurora + particle field) is desktop-only. On phones
  // it pegged the main thread and froze the page; a static ambient wash stands in.
  const showHeavyFx = isDesktop && !prefersReducedMotion

  useEffect(() => {
    async function fetchTopReporter() {
      if (!supabaseClient) return
      try {
        const { data, error } = await supabaseClient
          .from('top_contributors')
          .select('reporter_alias')
          .order('reports_count', { ascending: false })
          .limit(1)
          .single()
        if (!error && data) setTopReporter(data.reporter_alias)
      } catch (err) {
        console.error('Failed to fetch top reporter:', err)
      }
    }
    fetchTopReporter()
  }, [])

  useSEO({
    title: 'Intel Sources — Threatbase | Open Source Threat Intelligence Credits',
    description: 'Threatbase is powered by the global cybersecurity community. Credits to Spamhaus, FireHOL, Emerging Threats, Abuse.ch, SANS DShield, and 15+ open-source threat intelligence providers.',
    path: '/thanks',
  })

  return (
    <main className="min-h-[100dvh] pt-28 md:pt-32 pb-32 relative bg-app overflow-hidden font-sans selection:bg-red-500/30">
      {/* Animated aurora shader — desktop only (Three.js is too heavy for phones). */}
      {showHeavyFx ? (
        <AnimatedShaderBackground className="opacity-40" />
      ) : (
        /* Static ruby ambient wash that mirrors the shader's mood at zero cost. */
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 60% at 50% -10%, rgba(207,23,51,0.18), transparent 60%), radial-gradient(80% 50% at 50% 0%, rgba(174,182,196,0.06), transparent 65%)',
          }}
        />
      )}
      {/* Readability overlay + texture on top of the shader (matches --app-bg #080b12) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#080b12]/60 via-[#080b12]/90 to-[#080b12] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-px bg-gradient-to-r from-transparent via-red-500/25 to-transparent" />

      <div className="mx-auto max-w-5xl px-6 lg:px-12 relative z-10">

        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center flex flex-col items-center"
        >
          <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-[10rem] font-black tracking-tighter text-white leading-[0.9]">
            Intel<br /><span className="text-metal">Sources.</span>
          </h1>

          <p className="mt-8 text-slate-400 text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            Threatbase is powered by the security community. We credit the maintainers who share open intelligence.
          </p>
        </motion.div>

        {/* Film-credit style marquee */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative mt-20"
        >
          <div className="relative h-[80px] w-full">
            <InfiniteSlider className="flex h-full w-full items-center" duration={60} gap={64}>
              {SOURCES.map((s) => (
                <span
                  key={s.name}
                  className="whitespace-nowrap font-mono text-sm md:text-base font-medium tracking-[0.1em] text-slate-500 uppercase transition-colors hover:text-white"
                >
                  {s.name}
                </span>
              ))}
            </InfiniteSlider>
            <ProgressiveBlur
              className="pointer-events-none absolute top-0 left-0 h-full w-[120px] md:w-[200px]"
              direction="left"
              blurIntensity={1}
            />
            <ProgressiveBlur
              className="pointer-events-none absolute top-0 right-0 h-full w-[120px] md:w-[200px]"
              direction="right"
              blurIntensity={1}
            />
          </div>

          <div className="relative -mt-4 h-24 w-full overflow-hidden [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
            <div className="absolute inset-0 before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_bottom_center,var(--gradient-color),transparent_60%)] before:opacity-20" />
            <div className="absolute -left-1/2 top-1/2 z-10 aspect-[1/0.5] w-[200%] rounded-[100%] border-t border-red-500/10 bg-[#080b12]" />
            {showHeavyFx && (
              <Sparkles
                density={120}
                size={1.5}
                className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(ellipse_at_center,white,transparent_80%)]"
                color="#cf1733"
              />
            )}
          </div>
        </motion.div>

        {/* Top contributor highlight */}
        {topReporter && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className="mt-16 max-w-md mx-auto"
          >
            <div className="glass-card flex flex-col items-center justify-center px-8 py-10 text-center overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(207, 23, 51, 0.1), transparent 60%)' }}
              />
              <div className="relative mb-5 shrink-0 rounded-full border border-red-500/25 bg-red-500/[0.08] p-3.5 shadow-glow-ruby">
                <Trophy className="h-5 w-5 text-red-400" />
              </div>
              <div className="relative text-[10px] font-bold uppercase tracking-[0.24em] text-platinum-400">Top Contributor</div>
              <div className="relative mt-3 font-mono text-2xl text-metal tracking-tight">@{topReporter}</div>
            </div>
          </motion.div>
        )}

        {/* Editorial Source List */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-20 max-w-4xl mx-auto"
        >
          <div className="divider-metal mx-auto mb-14 w-40" />
          <div className="flex flex-col divide-y divide-white/5 border-y border-white/5">
            {SOURCES.map((s, idx) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col md:flex-row md:items-center justify-between py-8 px-4 transition-colors hover:bg-white/[0.015]"
              >
                <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-8 lg:gap-16">
                  <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white transition-colors group-hover:text-red-400 md:w-56 shrink-0">
                    {s.name}
                  </h3>
                  <p className="text-sm md:text-base text-slate-400">
                    {s.desc}
                  </p>
                </div>
                <div className="hidden md:flex shrink-0 ml-4 items-center justify-center w-10 h-10 rounded-full border border-white/5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:bg-red-500/10 group-hover:border-red-500/20 group-hover:text-red-400">
                  <ExternalLink className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>
        </motion.div>

        {/* Footer note + CTA */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-32 text-center"
        >
          <Link
            to="/report"
            className="group inline-flex items-center gap-3 border-b border-red-500/30 pb-1 text-sm font-bold uppercase tracking-[0.15em] text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
          >
            Contribute an Indicator
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </motion.div>

      </div>
    </main>
  )
}
