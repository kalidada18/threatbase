import { useState } from 'react'
import type { Relation } from '@/investigationTypes'
import { ringLayout } from './traceGeometry'

const W = 720, H = 460

/** Short display label for a relation node. Hashes (any length) render as the
 *  type initial; long non-hash values truncate; ≤14 chars render in full. */
function nodeLabel(r: Relation): string {
  if (/^(md5|sha1|sha256)$/.test(r.type)) return r.type.slice(0, 7).toUpperCase()
  return r.value.length > 14 ? r.value.slice(0, 14) + '…' : r.value
}

const alpha = (w: number) => 0.25 + 0.75 * Math.min(1, (w || 0) / 8)

export default function TraceGraph({
  relations, queryValue, onPivot,
}: { relations: Relation[]; queryValue: string; onPivot: (type: Relation['type'], value: string) => void }) {
  const [hover, setHover] = useState<Relation | null>(null)
  const { cx, cy, pos } = ringLayout(relations, W, H)
  return (
    <section aria-label="Trace graph">
      <div className="relative hidden md:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Relation graph: ${relations.length} nodes around ${queryValue}`}>
          {pos.map((p) => (
            <line key={'e' + p.r.type + ':' + p.r.value} x1={cx} y1={cy} x2={p.x} y2={p.y}
              stroke={`rgba(206,22,50,${alpha(p.r.weight)})`} strokeWidth="1" />
          ))}
          {pos.map((p) => (
            <g key={p.r.type + ':' + p.r.value}
              className="cursor-pointer" tabIndex={0} role="button"
              aria-label={`${p.r.value} (${p.r.type}) — investigate`}
              onMouseEnter={() => setHover(p.r)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.r)} onBlur={() => setHover(null)}
              onClick={() => onPivot(p.r.type, p.r.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onPivot(p.r.type, p.r.value) }}>
              <circle cx={p.x} cy={p.y} r={8}
                fill={p.r.malicious === true ? 'hsl(351 80% 45%)' : 'rgba(15,23,42,0.9)'}
                stroke={p.r.malicious === true ? 'hsl(351 90% 70%)' : 'rgba(148,163,184,0.6)'} strokeWidth="1.5" />
              {p.r.malicious === true && (
                <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">!</text>
              )}
              <text x={p.x} y={p.y + (p.r.malicious === true ? 22 : 19)} textAnchor="middle"
                fontSize="10" fill="rgba(148,163,184,0.9)" className="font-mono select-none">{nodeLabel(p.r)}</text>
            </g>
          ))}
          <circle cx={cx} cy={cy} r={14} fill="rgba(2,6,23,0.95)" stroke="hsl(351 80% 45%)" strokeWidth="2" />
          <text x={cx} y={cy + 30} textAnchor="middle" fontSize="12" fill="#e2e8f0" className="font-mono select-none">
            {queryValue.length > 18 ? queryValue.slice(0, 18) + '…' : queryValue}
            <title>{queryValue}</title>
          </text>
        </svg>
        {hover && (
          <div className="absolute top-2 left-2 glass-card rounded-lg px-3 py-2 text-xs font-mono text-slate-300 pointer-events-none max-w-[60%]" role="status">
            <span className="text-white break-all">{hover.value}</span>{' '}
            <span className="text-slate-500">[{hover.type}]</span>
            <div className="text-slate-400">
              {hover.edge.replace(/_/g, ' ')}{hover.via ? ` · ${hover.via}` : ''} · weight {hover.weight}
              {(hover.first_seen || hover.last_seen) && ` · seen ${String(hover.first_seen ?? hover.last_seen).slice(0, 10)}→${String(hover.last_seen ?? hover.first_seen).slice(0, 10)}`}
            </div>
          </div>
        )}
      </div>
      <details className="md:hidden mt-2">
        <summary className="font-mono text-[11px] uppercase tracking-wider text-slate-400 cursor-pointer">Relation list ({relations.length})</summary>
        <RelationTable relations={relations} onPivot={onPivot} />
      </details>
      <details className="hidden md:block mt-1">
        <summary className="font-mono text-[10px] uppercase tracking-wider text-slate-600 cursor-pointer">Table view</summary>
        <RelationTable relations={relations} onPivot={onPivot} />
      </details>
    </section>
  )
}

function RelationTable({ relations, onPivot }: { relations: Relation[]; onPivot: (type: Relation['type'], value: string) => void }) {
  return (
    <ul className="mt-2 divide-y divide-white/[0.04]">
      {relations.map((r) => (
        <li key={`${r.type}:${r.value}`} className="flex items-center gap-3 py-1.5">
          <button onClick={() => onPivot(r.type, r.value)}
            className="font-mono text-[11px] text-slate-300 hover:text-red-200 text-left truncate flex-1">
            {r.malicious === true && <span aria-hidden className="text-red-400 mr-1">!</span>}{r.value}
          </button>
          <span className="font-mono text-[9px] uppercase text-slate-600 shrink-0">{r.type}</span>
          <span className="font-mono text-[9px] text-slate-500 shrink-0">{r.edge.replace(/_/g, ' ')}{r.via ? ` · ${r.via}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}
