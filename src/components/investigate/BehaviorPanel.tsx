import type { ComponentType } from 'react'
import { ChevronRight, ExternalLink, Eye, Info, Search, Ban, Check, type LucideProps } from 'lucide-react'
import type { Dossier, Narrative } from '@/investigationTypes'
import { Chip, ConfidencePill } from './states'
import { tagLabel, tagTone } from './tagLabel'
import { TECHNIQUE_NAMES } from './labels'
import { formatAgo, formatDay } from './formatRelative'

const ACTIONS: Record<Narrative['recommended_action'], { label: string; icon: ComponentType<LucideProps>; cls: string }> = {
  block: { label: 'Block', icon: Ban, cls: 'text-red-200/90 border-red-500/30 bg-red-500/10' },
  monitor: { label: 'Monitor', icon: Eye, cls: 'text-slate-300 border-white/15 bg-white/[0.04]' },
  investigate_further: { label: 'Investigate Further', icon: Search, cls: 'text-slate-300 border-white/15 bg-white/[0.04]' },
  safe_to_ignore: { label: 'Safe', icon: Check, cls: 'text-emerald-200/90 border-emerald-500/25 bg-emerald-500/5' },
}

function ActionChip({ action }: { action: Narrative['recommended_action'] }) {
  const a = ACTIONS[action] ?? ACTIONS.investigate_further
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 border ${a.cls}`}>
      <a.icon size={12} strokeWidth={2} aria-hidden />{a.label}
    </span>
  )
}

/** Structured analyst card (Task C). Legacy string narratives render as the
 *  old paragraph — stale KV dossiers live up to 24 h after deploy. */
export function NarrativeCard({ n }: { n: Narrative }) {
  return (
    <div className="glass-card rounded-xl p-5">
      <p className="text-xl font-bold text-white leading-snug mb-4">{n.verdict_sentence}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip action={n.recommended_action} />
        <ConfidencePill level={n.confidence} />
      </div>
      {n.why_malicious.length > 0 && (
        <ul className="mt-3 space-y-1">
          {n.why_malicious.map((reason, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-300">
              <ChevronRight size={14} strokeWidth={2} aria-hidden className="text-red-400 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      {n.mitre_techniques.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {n.mitre_techniques.map((t) => (
            <a key={t} href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
              target="_blank" rel="noopener noreferrer" aria-label={`${TECHNIQUE_NAMES[t.split('.')[0]] ?? 'ATT&CK technique'} ${t}`}>
              <Chip className="hover:border-red-500/50 transition-colors">
                {TECHNIQUE_NAMES[t.split('.')[0]] ? `${t} ${TECHNIQUE_NAMES[t.split('.')[0]]}` : t}
                <ExternalLink size={10} strokeWidth={2} aria-hidden className="opacity-70" />
              </Chip>
            </a>
          ))}
        </div>
      )}
      {n.infrastructure_notes && (
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">{n.infrastructure_notes}</p>
      )}
    </div>
  )
}

/** AI narrative section — branches on the legacy string shape (stale pre-C KV)
 *  exactly like NarrativeCard's callers must. A null narrative is prod-reachable
 *  (any OpenRouter failure → null), so it renders an honest placeholder; the
 *  dossier's reading order puts this LAST, over the facts above it. */
export function NarrativeSection({ d }: { d: Dossier }) {
  if (!d.narrative) {
    return (
      <section aria-label="AI summary">
        <div className="eyebrow mb-2">Analyst summary (AI)</div>
        <div className="glass-card rounded-xl p-5 flex items-start gap-2.5">
          <Info size={12} strokeWidth={2} aria-hidden className="text-slate-400 shrink-0 mt-1" />
          <div>
            <p className="text-sm text-slate-200 leading-relaxed">
              {d.verdict.malicious_by} of {d.verdict.total_engines} sources flagged it.
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              No AI summary generated. The structured intelligence above stands on its own.
            </p>
          </div>
        </div>
      </section>
    )
  }
  return (
    <section aria-label="AI summary">
      <div className="eyebrow mb-2">Analyst summary (AI)</div>
      {typeof d.narrative === 'string' ? (
        /* legacy pre-C dossier still cached in KV (<24 h): plain paragraph, same as before */
        <p className="text-sm text-slate-200 leading-relaxed glass-card rounded-xl p-5">{d.narrative}</p>
      ) : (
        <NarrativeCard n={d.narrative} />
      )}
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mt-2">Machine-generated from the facts above. Verify before acting.</p>
    </section>
  )
}

/** Ports + merged tags + first/last seen. */
export function BehaviorSection({ d }: { d: Dossier }) {
  const b = d.behavior
  return (
    <section aria-label="Behavior">
      <div className="eyebrow mb-2">Behavior</div>
      {b && b.ports.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-white/[0.06]">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="text-slate-400 uppercase text-[9px] tracking-wider bg-white/[0.02]">
              <tr><th className="px-3 py-2">Port</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Banner</th></tr>
            </thead>
            <tbody className="text-slate-200 divide-y divide-white/[0.04]">
              {[...b.ports].sort((x, y) => x.port - y.port).map((p) => (
                <tr key={p.port}>
                  <td className="px-3 py-2 tabular-nums">{p.port}</td>
                  <td className="px-3 py-2">{p.service || 'n/a'}</td>
                  <td className="px-3 py-2 text-slate-400 max-w-[280px] truncate" title={p.banner}>{p.banner || 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400 font-mono">No open ports reported.</p>
      )}
      {b && b.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {b.tags.map((t) => (
            <Chip key={t} tone={tagTone(t)}>{tagLabel(t)}</Chip>
          ))}
        </div>
      )}
      {b && (b.first_seen || b.last_seen) && (
        <p className="font-mono text-[11px] text-slate-400 mt-3 tabular-nums">
          first seen {b.first_seen ? <time dateTime={b.first_seen}>{formatDay(b.first_seen)}</time> : 'never'}
          {' '}· last seen {b.last_seen ? <time dateTime={b.last_seen} title={formatDay(b.last_seen)}>{formatAgo(b.last_seen)}</time> : 'never'}
        </p>
      )}
    </section>
  )
}

/** Pulse source links — http(s) only, javascript:/data: never. */
export function PulsesSection({ d }: { d: Dossier }) {
  if (!(d.pulses?.length ?? 0)) return null
  return (
    <section aria-label="Community reports">
      <div className="eyebrow mb-2">Community reports</div>
      <ul className="space-y-1.5">
        {d.pulses!.map((p) => (
          <li key={p.url}>
            {/^https?:\/\//i.test(p.url) ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-slate-300 hover:text-red-200 underline decoration-white/10 underline-offset-2 inline-flex items-start gap-1.5">
                <span>{p.title}</span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">· {formatDay(p.modified)}</span>
                <ExternalLink size={10} strokeWidth={2} aria-hidden className="mt-1 opacity-70" />
              </a>
            ) : (
              <span className="text-[12px] text-slate-300">{p.title} <span className="font-mono text-[10px] text-slate-400">· {formatDay(p.modified)}</span></span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
