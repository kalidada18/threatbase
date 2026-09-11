import type { ComponentType } from 'react'
import { Ban, Check, Eye, Info, Search, type LucideProps } from 'lucide-react'
import type { Dossier, Narrative } from '@/investigationTypes'
import { tagLabel, tagTone } from './tagLabel'
import { StageLabel } from './StageLabel'

const ACTIONS: Record<Narrative['recommended_action'], { label: string; icon: ComponentType<LucideProps>; cls: string }> = {
  block: { label: 'Block', icon: Ban, cls: 'text-[#a4432c] border-[#a4432c]/50' },
  monitor: { label: 'Monitor', icon: Eye, cls: 'text-[#8a5a3c] border-[#8a5a3c]/50' },
  investigate_further: { label: 'Investigate Further', icon: Search, cls: 'text-[#241f17] border-[#6e675c]/50' },
  safe_to_ignore: { label: 'Safe', icon: Check, cls: 'text-[#33604a] border-[#33604a]/50' },
}

function ActionChip({ action }: { action: Narrative['recommended_action'] }) {
  const a = ACTIONS[action] ?? ACTIONS.investigate_further
  return (
    <span className={`inline-flex items-center gap-1.5 metric text-[10px] uppercase tracking-[0.14em] border rounded-[2px] px-2.5 py-1 ${a.cls}`}>
      <a.icon size={12} strokeWidth={2} aria-hidden />{a.label}
    </span>
  )
}

/** Structured analyst card (Task C). Legacy string narratives render as the
 *  old paragraph — stale KV dossiers live up to 24 h after deploy. */
export function NarrativeCard({ n }: { n: Narrative }) {
  return (
    <div className="shard shard-c rounded-none p-5">
      <StageLabel n="04" name="NARRATE" />
      <p className="text-lg font-semibold text-[#241f17] leading-snug mb-4">{n.verdict_sentence}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip action={n.recommended_action} />
        <span className="metric text-[10px] uppercase tracking-[0.16em] text-[#584f42]">confidence: {n.confidence}</span>
      </div>
      {n.why_malicious.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {n.why_malicious.map((reason, i) => (
            <li key={i} className="frac text-sm text-[#241f17] leading-relaxed">{reason}</li>
          ))}
        </ul>
      )}
      {n.mitre_techniques.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {n.mitre_techniques.map((t) => (
            <a key={t} href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
              target="_blank" rel="noopener noreferrer"
              className="px-2 py-0.5 border border-[#6e675c]/40 rounded-[2px] metric text-xs text-[#584f42] hover:border-[#a4432c]/60 hover:text-[#a4432c] transition-colors">
              {t}
            </a>
          ))}
        </div>
      )}
      {n.infrastructure_notes && (
        <p className="mt-3 text-sm text-[#584f42] italic">{n.infrastructure_notes}</p>
      )}
      <p className="metric text-[11px] text-[#584f42] mt-4 border-t border-[#6e675c]/25 pt-2">Machine-generated from the facts on record. Verify before acting.</p>
    </div>
  )
}

/** AI narrative section — branches on the legacy string shape (stale pre-C KV)
 *  exactly like NarrativeCard's callers must. A null narrative is
 *  prod-reachable (any OpenRouter failure → null), so it renders an honest
 *  placeholder rather than leaving the slot dead. */
export function NarrativeSection({ d }: { d: Dossier }) {
  if (!d.narrative) {
    return (
      <section aria-label="AI summary">
        <div className="shard rounded-none p-5 flex items-start gap-2.5">
          <div className="min-w-0">
            <StageLabel n="04" name="NARRATE" />
            <div className="flex items-start gap-2.5">
              <Info size={13} strokeWidth={2} aria-hidden className="text-[#584f42] shrink-0 mt-1" />
              <div>
                <p className="text-sm text-[#241f17] leading-relaxed">
                  {d.verdict.malicious_by} of {d.verdict.total_engines} sources flag it.
                </p>
                <p className="text-sm text-[#584f42] leading-relaxed">
                  No AI summary generated. The structured facts on record stand on their own.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }
  return (
    <section aria-label="AI summary">
      {typeof d.narrative === 'string' ? (
        /* legacy pre-C dossier still cached in KV (<24 h): plain paragraph */
        <div className="shard rounded-none p-5">
          <StageLabel n="04" name="NARRATE" />
          <p className="text-sm text-[#241f17] leading-relaxed">{d.narrative}</p>
          <p className="metric text-[11px] text-[#584f42] mt-3">Machine-generated from the facts on record. Verify before acting.</p>
        </div>
      ) : (
        <NarrativeCard n={d.narrative} />
      )}
    </section>
  )
}

/** Ports + merged tags + first/last seen. */
export function BehaviorSection({ d }: { d: Dossier }) {
  const b = d.behavior
  return (
    <section aria-label="Behavior">
      <StageLabel n="07" name="BEHAVIOR" />
      {b && b.ports.length > 0 ? (
        <div className="overflow-x-auto rounded-[2px] border border-[#6e675c]/30">
          <table className="w-full text-left metric text-[11px]">
            <thead className="text-[#584f42] uppercase text-[9px] tracking-wider bg-[#6e675c]/10">
              <tr><th className="px-3 py-2">Port</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Banner</th></tr>
            </thead>
            <tbody className="text-[#241f17] divide-y divide-[#6e675c]/20">
              {[...b.ports].sort((x, y) => x.port - y.port).map((p) => (
                <tr key={p.port}>
                  <td className="px-3 py-2 tabular-nums">{p.port}</td>
                  <td className="px-3 py-2">{p.service || 'n/a'}</td>
                  <td className="px-3 py-2 text-[#584f42] max-w-[280px] truncate" title={p.banner}>{p.banner || 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#584f42] metric">no open ports reported</p>
      )}
      {b && b.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {b.tags.map((t) => (
            <span key={t} title={t} className={`metric text-[10px] uppercase tracking-[0.14em] rounded-[2px] px-2.5 py-1 border ${tagTone(t) === 'red' ? 'text-[#7d2f1c] border-[#a4432c]/45 bg-[#a4432c]/10' : 'text-[#584f42] border-[#6e675c]/35 bg-[#6e675c]/10'}`}>{tagLabel(t)}</span>
          ))}
        </div>
      )}
      {b && (b.first_seen || b.last_seen) && (
        <p className="metric text-[10px] text-[#584f42] mt-3 tabular-nums">
          first seen {b.first_seen?.slice(0, 10) ?? 'n/a'} · last seen {b.last_seen?.slice(0, 10) ?? 'n/a'}
        </p>
      )}
    </section>
  )
}

/** Pulse source links — http(s) only, javascript:/data: never. */export function PulsesSection({ d }: { d: Dossier }) {
  if (!(d.pulses?.length ?? 0)) return null
  return (
    <section aria-label="Source pulses">
      <StageLabel n="08" name="REPORTS" />
      <ul className="space-y-1.5">
        {d.pulses!.map((p) => (
          <li key={p.url}>
            {/^https?:\/\//i.test(p.url) ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                className="metric text-[11px] text-[#241f17] hover:text-[#a4432c] underline decoration-[#6e675c]/40 underline-offset-2">
                {p.title} <span className="text-[#584f42]">· {p.modified.slice(0, 10)}</span>
              </a>
            ) : (
              <span className="metric text-[11px] text-[#584f42]">{p.title} <span className="text-[#6e675c]">· {p.modified.slice(0, 10)}</span></span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
