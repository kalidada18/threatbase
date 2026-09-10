import type { Dossier } from '@/investigationTypes'

/** Ports + merged tags + first/last seen + AI narrative + pulse source links. */
export default function BehaviorPanel({ d }: { d: Dossier }) {
  const b = d.behavior
  return (
    <div className="space-y-8">
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

      {d.narrative && (
        <section aria-label="AI summary">
          <div className="eyebrow mb-2">Analyst summary (AI)</div>
          <p className="text-sm text-slate-300 leading-relaxed glass-card rounded-2xl p-5">{d.narrative}</p>
          <p className="font-mono text-[9px] text-slate-600 mt-2">Machine-generated from the facts above — verify before acting.</p>
        </section>
      )}

      {(d.pulses?.length ?? 0) > 0 && (
        <section aria-label="Source pulses">
          <div className="eyebrow mb-2">Community reports</div>
          <ul className="space-y-1.5">
            {d.pulses!.map((p) => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[11px] text-slate-400 hover:text-red-200 underline decoration-white/10 underline-offset-2">
                  {p.title} <span className="text-slate-600">· {p.modified.slice(0, 10)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
