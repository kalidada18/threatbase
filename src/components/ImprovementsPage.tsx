import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, History } from 'lucide-react'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { fmt, DATA_RAMP, timeAgo } from '../utils'

const REPO = 'kalidada18/threatbase'

/**
 * Repo pulse: live public GitHub API data (stars/forks/issues + language mix),
 * rendered in the flat ledger style. Two unauthenticated calls on mount, no
 * polling; renders nothing on failure so the changelog never depends on it.
 */
function RepoPulse() {
  const [repo, setRepo] = useState<any>(null)
  const [langs, setLangs] = useState<{ name: string; bytes: number }[]>([])

  useEffect(() => {
    let cancelled = false
    const GH = { headers: { Accept: 'application/vnd.github+json' } }
    fetch(`https://api.github.com/repos/${REPO}`, GH)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setRepo(d) })
      .catch(() => {})
    fetch(`https://api.github.com/repos/${REPO}/languages`, GH)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return
        setLangs(
          Object.entries(d)
            .map(([name, bytes]) => ({ name, bytes: bytes as number }))
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 6)
        )
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!repo) return null

  const stats = [
    { label: 'Stars', value: fmt(repo.stargazers_count ?? 0) },
    { label: 'Forks', value: fmt(repo.forks_count ?? 0) },
    { label: 'Open issues', value: fmt(repo.open_issues_count ?? 0) },
    { label: 'Last push', value: repo.pushed_at ? timeAgo(repo.pushed_at) : 'N/A' },
  ]

  const total = langs.reduce((s, l) => s + l.bytes, 0)
  let acc = 0

  return (
    <div className="mx-auto mb-16 flex w-full max-w-3xl flex-col gap-8 rounded-2xl border border-white/[0.06] bg-[#0a0e17]/60 px-6 py-6 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="eyebrow mb-4">Repo pulse</div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3">
          {stats.map(s => (
            <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-white/[0.04] pb-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{s.label}</dt>
              <dd className="font-mono text-sm font-medium text-white tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-6">
          {/* Hand-rolled donut: r chosen so circumference = 100, dasharray = pct */}
          <svg viewBox="0 0 42 42" className="h-24 w-24 -rotate-0 shrink-0" role="img" aria-label="Language share donut">
            <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5.5" />
            {langs.map((l, i) => {
              const pct = (l.bytes / total) * 100
              const el = (
                <circle
                  key={l.name}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="none"
                  stroke={DATA_RAMP[Math.min(i, DATA_RAMP.length - 1)]}
                  strokeWidth="5.5"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={25 - acc}
                />
              )
              acc += pct
              return el
            })}
          </svg>
          <ul className="space-y-1.5">
            {langs.map((l, i) => (
              <li key={l.name} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DATA_RAMP[Math.min(i, DATA_RAMP.length - 1)] }} />
                {l.name}
                <span className="ml-auto pl-3 font-mono tabular-nums text-slate-500">{Math.round((l.bytes / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Improvements changelog, curated from the git history (feed-update commits
 * excluded). Newest first. Keep entries to user-visible improvements —
 * infrastructure noise belongs in commit messages, not here.
 */
const IMPROVEMENTS: { date: string; title: string; items: string[] }[] = [
  {
    date: '2026-09-05',
    title: 'Hunt Console, Threat Feed & Scan Report',
    items: [
      'The homepage is now a focused IOC console: one search bar, one verdict, example hunts for every indicator type.',
      'New /threatfeed page unifies database totals, downloadable feeds, and landscape analytics, with a live threat-intel panel (the canvas world map retired in favour of data, not pixels).',
      'Scan report rebuilt: verdict colours now mean what they show, a segmented confidence meter replaces the single bar, and 11+ corroborating feeds lock confidence at 100%.',
      'Inline registration data (RDAP) for IPs and domains replaces the external whois link.',
      'Community comments on any indicator: signed-in users file field reports and can delete their own.',
      'How It Works is now a pure CSS & SVG animated explainer, embedded in About.',
      'Contributors leaderboard rebuilt as a flat ledger with relative-share bars; medal artwork removed.',
    ],
  },
  {
    date: '2026-09-03',
    title: 'Batch Scanning API',
    items: [
      'New POST /api/v1/scan endpoint scans up to 100 indicators in a single request.',
      'Each indicator is validated against its declared type (ipv4, ipv6, domain, url, md5, sha1, sha256) before it is scanned.',
      'A malformed indicator no longer fails the whole batch; it returns as a per-item error while every valid indicator still resolves.',
      'Stricter IPv6 and hash-length validation on both the single and batch scan paths.',
    ],
  },
  {
    date: '2026-09-03',
    title: 'Top APT Leaderboard',
    items: [
      'New /top-apt page ranks the most active APT groups by fresh campaign intelligence.',
      'Each group expands to the campaigns attributed to it, every claim linked to its source pulse.',
      '24-hour and 7-day activity windows, with sponsor attribution and known aliases per group.',
      'Leaderboard refreshes automatically with the feed pipeline run.',
      'Top APT added to the main navigation.',
    ],
  },
  {
    date: '2026-09-02',
    title: 'IOC Decay & Feed Freshness',
    items: [
      'Every indicator now carries first-seen / last-seen timestamps across all feeds.',
      'Age-based decay: indicators unseen for 90+ days drop a severity tier and gain a Stale tag; unseen for 365+ days are removed entirely.',
      'New feed-health monitor flags upstream sources that stop producing novel IOCs for 3+ consecutive runs.',
      'Feed updates can now be triggered on any schedule via the workflow_dispatch API.',
      'New Hall of Shame page ranks the 100 worst IPs by how many independent sources flagged them.',
      'Hall of Shame added to the main navigation.',
      'Search deep links (?search=indicator) now scan reliably on fresh loads and in-app navigation.',
      'Every feed file now ships a SHA-256 checksum in manifest.json, so blocklists can be verified after download.',
      'Improvements added to the main navigation.',
    ],
  },
  {
    date: '2026-08-31',
    title: 'Motion System',
    items: [
      'Site-wide motion primitives: page transitions, tilt cards, and animated marketing surfaces with full reduced-motion support.',
    ],
  },
  {
    date: '2026-08-30',
    title: 'Brand & CI Reliability',
    items: [
      'Enforced a single brand system (colour, type, spacing) across every surface.',
      'Fixed feed-push races that could fail the automated update workflow.',
    ],
  },
  {
    date: '2026-08-29',
    title: 'Security & Feed Scale',
    items: [
      'Reporting endpoints now require a verified user identity — insecure insert fallbacks removed.',
      'API keys validated with elevated privileges only on server-side routes.',
      'Giant domain & hash feeds committed as plain Git objects; accumulated Git LFS pointer lines purged from the data.',
      'Scanner loading state replaced with an animated radar sweep.',
    ],
  },
  {
    date: '2026-08-17',
    title: 'Chunked Feeds & Severity Colours',
    items: [
      'Oversized domain and hash feeds split into numbered chunks for reliable delivery.',
      'Scan-result category colours now driven directly by severity.',
    ],
  },
  {
    date: '2026-08-16',
    title: 'Release-Asset Feeds',
    items: [
      'Large feeds published as GitHub release assets with Git LFS removed from the delivery path.',
      'Accent palette unified site-wide after a full visual audit.',
    ],
  },
  {
    date: '2026-07-25',
    title: 'Server-Side Reporting',
    items: [
      'Report submission moved server-side with Cloudflare Turnstile verification and rate limiting.',
      'Threat-intel feed browser and standalone scanner utility shipped.',
    ],
  },
  {
    date: '2026-07-20',
    title: 'Automated Feed Pipeline',
    items: [
      'Hash feed initialised and wired to a scheduled GitHub Actions update workflow.',
      'Indicator classification utilities and the scan-result panel with community reports launched.',
    ],
  },
  {
    date: '2026-06-22',
    title: 'Threat Map & Testing',
    items: [
      'Flat world threat map with a top-attackers panel showing live community reports.',
      'Vitest test harness added and the Supabase client migrated to TypeScript.',
    ],
  },
  {
    date: '2026-06-21',
    title: 'Security Hardening & Redesign',
    items: [
      'Fixed IDOR, XSS, CORS and data-leakage vulnerabilities across the API.',
      'Invalid indicators blocked before a scan ever starts.',
      'Shader background optimised to cut GPU usage; subpages redesigned on the new visual system.',
    ],
  },
  {
    date: '2026-06-20',
    title: 'Live Threat Data',
    items: [
      'Real-data threat map and a live attack ticker replacing static placeholders.',
      'Category-split IP blocklists (brute-force, C2, botnet, spam, tor…) published.',
      'Dead upstream feeds removed and stale feed URLs corrected.',
    ],
  },
  {
    date: '2026-06-18',
    title: 'Public API & Docs',
    items: [
      'Authenticated API endpoints for scanning and reporting, documented at /api.',
      'Turnstile verification added to community reports.',
      'Scanner now shows a graded confidence score with copy-to-clipboard results.',
      'Dashboard stats auto-poll so feed counts stay live without refreshes.',
    ],
  },
  {
    date: '2026-06-17',
    title: 'First Public Footing',
    items: [
      'README rewritten; contributor leaderboard redesigned.',
      'Deployment pipeline fixed for Cloudflare Pages SPA routing.',
    ],
  },
]

export default function ImprovementsPage() {
  useSEO({
    title: 'Improvements | Threatbase Changelog',
    description: 'The Threatbase improvement log: feed decay, security hardening, new APIs, and UI milestones — dated.',
    path: '/improvements',
  })

  const reduce = useReducedMotion()

  return (
    <IsoPageShell color="207, 23, 51">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto text-center mb-16"
      >
        <div className="eyebrow mb-6">Improvements</div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter text-white mb-6">
          What we&apos;ve <span className="text-liquid-red">shipped.</span>
        </h1>
        <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
          Every improvement to Threatbase&apos;s feeds, API, and interface — in the open, with dates.
        </p>
      </motion.div>

      <RepoPulse />

      <div className="relative max-w-3xl mx-auto w-full">
        {/* spine */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.07]" />

        {IMPROVEMENTS.map((entry, i) => (
          <motion.div
            key={`${entry.date}-${entry.title}`}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
            className="relative pl-10 pb-12 last:pb-0"
          >
            <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-red-500/60 bg-slate-950" />
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
              <time className="font-mono text-sm text-red-400" dateTime={entry.date}>
                {entry.date}
              </time>
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{entry.title}</h2>
            </div>
            <ul className="space-y-2">
              {entry.items.map((item) => (
                <li key={item} className="text-slate-400 leading-relaxed flex gap-3">
                  <History className="h-4 w-4 shrink-0 mt-1 text-red-500/50" strokeWidth={1.8} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {i === 0 && (
              <Link
                to="/api"
                className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                Try it in the API
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </motion.div>
        ))}
      </div>
    </IsoPageShell>
  )
}
