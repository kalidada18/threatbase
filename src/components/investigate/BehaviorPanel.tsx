import type { Dossier, Narrative } from '@/investigationTypes'

const ACTIONS: Record<Narrative['recommended_action'], { label: string; icon: string; cls: string }> = {
  block: { label: 'Block', icon: '⛔', cls: 'text-red-300 border-red-500/40 bg-red-500/10' },
  monitor: { label: 'Monitor', icon: '👁', cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  investigate_further: { label: 'Investigate Further', icon: '🔍', cls: 'text-sky-300 border-sky-500/40 bg-sky-500/10' },
  safe_to_ignore: { label: 'Safe', icon: '✓', cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
}

function ActionChip({ action }: { action: Narrative['recommended_action'] }) {
  const a = ACTIONS[action] ?? ACTIONS.investigate_further
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 border ${a.cls}`}>
      <span aria-hidden>{a.icon}</span>{a.label}
    </span>
  )
}

/** Structured analyst card (Task C). Legacy string narratives render as the
 *  old paragraph — stale KV dossiers live up to 24 h after deploy. */
export function NarrativeCard({ n }: { n: Narrative }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="text-lg font-mono text-white leading-snug mb-4">{n.verdict_sentence}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip action={n.recommended_action} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">confidence: {n.confidence}</span>
      </div>
      {n.why_malicious.length > 0 && (
        <ul className="mt-3 space-y-1">
          {n.why_malicious.map((reason, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-300">
              <span className="text-red-500 shrink-0">▸</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      {n.mitre_techniques.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {n.mitre_techniques.map((t) => (
            <a key={t} href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
              target="_blank" rel="noopener noreferrer"
              className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded font-mono text-xs text-slate-300 hover:border-red-500 transition-colors">
              {t}
            </a>
          ))}
        </div>
      )}
      {n.infrastructure_notes && (
        <p className="mt-3 text-sm text-slate-400 italic">{n.infrastructure_notes}</p>
      )}
    </div>
  )
}

/** AI narrative section — branches on the legacy string shape (stale pre-C KV)
 *  exactly like NarrativeCard's callers must. Exported for the cockpit's row 1.
 *  A null narrative is prod-reachable (any OpenRouter failure → null), so it
 *  renders an honest placeholder rather than leaving the col-span-5 slot dead. */
export function NarrativeSection({ d }: { d: Dossier }) {
  if (!d.narrative) {
    return (
      <section aria-label="AI summary">
        <div className="eyebrow mb-2">Analyst summary (AI)</div>
        <div className="glass-card rounded-2xl p-5 flex items-start gap-2.5">
          <span aria-hidden className="text-slate-500 mt-0.5">ⓘ</span>
          <p className="text-sm text-slate-400 leading-relaxed">
            AI summary unavailable — the structured facts below stand on their own.
          </p>
        </div>
      </section>
    )
  }
  return (
    <section aria-label="AI summary">
      <div className="eyebrow mb-2">Analyst summary (AI)</div>
      {typeof d.narrative === 'string' ? (
        /* legacy pre-C dossier still cached in KV (<24 h) — plain paragraph, same as before */
        <p className="text-sm text-slate-300 leading-relaxed glass-card rounded-2xl p-5">{d.narrative}</p>
      ) : (
        <NarrativeCard n={d.narrative} />
      )}
      <p className="font-mono text-[9px] text-slate-600 mt-2">Machine-generated from the facts above — verify before acting.</p>
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
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="text-slate-500 uppercase text-[9px] tracking-wider bg-white/[0.02]">
              <tr><th className="px-3 py-2">Port</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Banner</th></tr>
            </thead>
            <tbody className="text-slate-300 divide-y divide-white/[0.04]">
              {[...b.ports].sort((x, y) => x.port - y.port).map((p) => (
                <tr key={p.port}>
                  <td className="px-3 py-2 tabular-nums">{p.port}</td>
                  <td className="px-3 py-2">{p.service || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-[280px] truncate" title={p.banner}>{p.banner || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500 font-mono">no open ports reported</p>
      )}
      {b && b.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {b.tags.map((t) => (
            <span key={t} className="font-mono text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 border text-red-200/90 border-red-500/30 bg-red-500/10">{t}</span>
          ))}
        </div>
      )}
      {b && (b.first_seen || b.last_seen) && (
        <p className="font-mono text-[10px] text-slate-500 mt-3 tabular-nums">
          first seen {b.first_seen?.slice(0, 10) ?? '—'} · last seen {b.last_seen?.slice(0, 10) ?? '—'}
        </p>
      )}
    </section>
  )
}

/** Pulse source links — http(s) only, javascript:/data: never. */export function PulsesSection({ d }: { d: Dossier }) {
  if (!(d.pulses?.length ?? 0)) return null
  return (
    <section aria-label="Source pulses">
      <div className="eyebrow mb-2">Community reports</div>
      <ul className="space-y-1.5">
        {d.pulses!.map((p) => (
          <li key={p.url}>
            {/^https?:\/\//i.test(p.url) ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                className="font-mono text-[11px] text-slate-400 hover:text-red-200 underline decoration-white/10 underline-offset-2">
                {p.title} <span className="text-slate-600">· {p.modified.slice(0, 10)}</span>
              </a>
            ) : (
              <span className="font-mono text-[11px] text-slate-500">{p.title} <span className="text-slate-600">· {p.modified.slice(0, 10)}</span></span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

