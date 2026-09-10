import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { useInvestigation } from '@/useInvestigation'
import type { Dossier } from '@/investigationTypes'

/** "2026-09-02T14:05:00" -> "2d ago" — same clamp as TopAptPage's. */
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000))
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / (24 * 60))}d ago`
}

const Chip = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'red' }) => (
  <span
    className={`font-mono text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 border ${
      tone === 'red'
        ? 'text-red-200/90 border-red-500/30 bg-red-500/10'
        : 'text-slate-400 border-white/10 bg-white/[0.03]'
    }`}
  >
    {children}
  </span>
)

/** Any IOC value becomes a pivot link into the investigation page. */
export function IocLink({ type: _type, value, children }: { type?: string; value: string; children?: ReactNode }) {
  return (
    <Link
      to={`/investigate?q=${encodeURIComponent(value)}`}
      className="font-mono text-[11px] text-slate-400 hover:text-red-200 transition-colors underline decoration-white/10 underline-offset-2"
    >
      {children ?? value}
    </Link>
  )
}

const STATUS: Record<Dossier['verdict']['status'], { label: string; icon: string; cls: string }> = {
  malicious: { label: 'MALICIOUS', icon: '!', cls: 'text-red-400 border-red-500/40 bg-red-500/10' },
  suspicious: { label: 'SUSPICIOUS', icon: '!', cls: 'text-red-300/80 border-red-500/25 bg-red-500/5' },
  clean: { label: 'CLEAN', icon: '✓', cls: 'text-slate-200 border-white/15 bg-white/[0.04]' },
  unknown: { label: 'UNKNOWN', icon: '?', cls: 'text-slate-400 border-white/10 bg-white/[0.02]' },
}

/** Single-hue risk gauge — hsl(var(--chart-1)) intensity is severity itself;
 *  the number rides the arc so it never reads color-alone. */
function RiskGauge({ risk }: { risk: number }) {
  const R = 34, C = 2 * Math.PI * R
  const frac = Math.min(100, Math.max(0, risk)) / 100
  return (
    <div className="relative w-[88px] h-[88px] shrink-0" role="img" aria-label={`Risk score ${Math.round(risk)} of 100`}>
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={R} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${frac * C} ${C}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono font-bold text-white tabular-nums leading-none">
        {Math.round(risk)}
        <span className="sr-only">/100</span>
      </div>
      <div className="absolute inset-x-0 -bottom-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">risk</div>
    </div>
  )
}

function SourceStrip({ d }: { d: Dossier }) {
  const chips: { label: string; cls: string }[] = [
    ...(d.sources_ok ?? []).map((s) => ({ label: s, cls: 'text-slate-400 border-white/10 bg-white/[0.03]' })),
    ...(d.sources_skipped ?? []).map((s) => ({ label: `${s} · off`, cls: 'text-slate-600 border-dashed border-white/10' })),
    ...(d.sources_failed ?? []).map((s) => ({ label: `⚠ ${s} · failed`, cls: 'text-red-300/80 border-red-500/30 bg-red-500/10' })),
  ]
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mr-1">sources</span>
      {chips.map((c) => (
        <span key={c.label} className={`font-mono text-[10px] rounded-full px-2.5 py-1 border ${c.cls}`}>{c.label}</span>
      ))}
    </div>
  )
}

function ReportView({ d }: { d: Dossier }) {
  const st = STATUS[d.verdict.status] ?? STATUS.unknown
  const id = d.identity
  const torExit = !!id && id.hosting_type === 'vps/cloud' && (d.verdict.tags ?? []).some((t) => /tor/i.test(t))
  return (
    <div className="space-y-8">
      {/* Verdict tile */}
      <div className="glass-card rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-8 items-center">
        <div className="text-center md:text-left">
          <div className={`inline-flex items-center gap-2 font-mono font-bold tracking-wider border rounded-full px-4 py-1.5 ${st.cls}`}>
            <span aria-hidden>{st.icon}</span>{st.label}
          </div>
          <div className="font-mono text-[11px] text-slate-500 mt-3 tabular-nums">
            {d.verdict.malicious_by} of {d.verdict.total_engines} sources flag it
          </div>
        </div>
        {typeof d.verdict.risk === 'number' && <RiskGauge risk={d.verdict.risk} />}
        {id && (
          <div className="flex flex-wrap gap-1.5 justify-center md:justify-start md:ml-auto max-w-md">
            {id.asn && <Chip>{id.asn}</Chip>}
            {(id.country || id.city) && <Chip>{[id.city, id.country].filter(Boolean).join(', ')}</Chip>}
            {id.isp && <Chip>{id.isp}</Chip>}
            {id.hosting_type !== 'unknown' && <Chip>{id.hosting_type}</Chip>}
            {id.reverse_dns && <Chip>{id.reverse_dns}</Chip>}
            {torExit && <Chip tone="red">tor exit</Chip>}
          </div>
        )}
      </div>

      {/* Honesty strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SourceStrip d={d} />
        <span className="font-mono text-[10px] text-slate-500 tabular-nums">
          {d.cached ? `report from ${ago(d.generated_at ?? '')}` : 'live'}
          {typeof d.investigated_by === 'number' && ` · ${d.investigated_by} investigation${d.investigated_by === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Blocks filled by Task 6 */}
      {/* trace-graph */}
      {/* calendar */}
      {/* behavior */}
      {/* narrative */}
    </div>
  )
}

function NonRoutable({ d }: { d: Dossier }) {
  return (
    <div className="glass-card rounded-2xl p-8 text-center max-w-md mx-auto">
      <div className="font-mono text-3xl text-slate-400 mb-3" aria-hidden>⊘</div>
      <div className="font-mono text-sm text-slate-300 mb-2 break-all">{d.query.value}</div>
      <p className="text-sm text-slate-500">{d.note || 'This address is private or reserved — it cannot be investigated.'}</p>
    </div>
  )
}

export default function InvestigatePage() {
  useSEO({
    title: 'Deep Investigation | Threatbase',
    description: 'Trace everything a public IP, domain, URL or file hash touched — verdicts, relations, behavior and an AI summary.',
    path: '/investigate',
  })
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() || ''
  const { dossier, loading, error } = useInvestigation(q || null)
  const [term, setTerm] = useState(q)
  // Route key is pathname-only, so q changes don't remount — keep the box in
  // sync with the URL (pivots from Task 6, back/forward).
  useEffect(() => setTerm(q), [q])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = term.trim()
    if (v) navigate(`/investigate?q=${encodeURIComponent(v)}`)
  }

  const search = (
    <form onSubmit={submit} className="max-w-xl mx-auto mb-10">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="8.8.8.8 · evil.example.com · e3b0c442…"
        aria-label="Indicator to investigate"
        spellCheck={false}
        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4 font-mono text-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/40"
      />
    </form>
  )

  return (
    <IsoPageShell>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto text-center mb-8"
      >
        <div className="eyebrow mb-6">Deep Investigation</div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter text-white mb-6">
          Everything it <span className="text-liquid-red">touched</span>.
        </h1>
      </motion.div>

      {search}

      {!q && (
        <p className="text-center text-slate-500 text-sm font-mono">
          Paste any IP, domain, URL or hash. Shared results at this URL.
        </p>
      )}

      {q && loading && (
        <div className="space-y-4 max-w-3xl mx-auto">
          <div className="h-32 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-8 w-2/3 mx-auto rounded-xl bg-white/[0.04] animate-pulse" style={{ animationDelay: '60ms' }} />
          <div className="h-64 rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: '120ms' }} />
        </div>
      )}

      {q && !loading && error && (
        <div className="glass-card rounded-2xl p-6 text-center max-w-md mx-auto border-red-500/20">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400 mb-2">⚠ investigation failed</div>
          <p className="text-sm text-slate-400 break-words">{error}</p>
        </div>
      )}

      {q && !loading && !error && dossier && (
        dossier.note ? <NonRoutable d={dossier} /> : <ReportView d={dossier} />
      )}
    </IsoPageShell>
  )
}
