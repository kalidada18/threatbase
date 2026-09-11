import { useState } from 'react'
import { multiRingLayout, convexHull } from './traceGeometry'
import { MAX_RINGS, type GraphNode, type GraphState } from './traceState'

const W = 720, H = 460

/** Raku palette on glaze: ink #241f17, iron #a4432c (flagged), soot node
 *  bodies, ash edges. Ember stays reserved for live interaction. */
const INK = '#241f17'
const IRON = '#a4432c'
const ASH = '#6e675c'

/** Short display label for a graph node. Hashes (any length) render as the
 *  type initial; long non-hash values truncate; ≤14 chars render in full. */
function nodeLabel(n: GraphNode): string {
  if (/^(md5|sha1|sha256)$/.test(n.type)) return n.type.slice(0, 7).toUpperCase()
  return n.value.length > 14 ? n.value.slice(0, 14) + '…' : n.value
}

const alpha = (w: number) => 0.3 + 0.7 * Math.min(1, (w || 0) / 8)
const ringOpacity = (ring: number) => (ring >= 3 ? 0.4 : ring === 2 ? 0.7 : 1)

export default function TraceGraph({
  graph, onPivot, expandingKey, selectedKey, onSelectNode,
}: {
  graph: GraphState
  onPivot: (type: GraphNode['type'], value: string) => void
  expandingKey: string | null
  selectedKey?: string | null
  onSelectNode?: (key: string | null) => void
}) {
  const [hover, setHover] = useState<GraphNode | null>(null)
  const { positions } = multiRingLayout(graph, W, H)
  const root = [...graph.nodes.values()].find((n) => n.ring === 0) ?? null
  const rootPos = root ? positions.get(`${root.type}:${root.value}`) : undefined
  const queryValue = root?.value ?? ''

  // Cluster detection: non-root nodes sharing a `via` pulse get a faint hull.
  const clusters = new Map<string, { x: number; y: number }[]>()
  for (const p of positions.values()) {
    if (p.node.ring === 0 || !p.node.via) continue
    if (!clusters.has(p.node.via)) clusters.set(p.node.via, [])
    clusters.get(p.node.via)!.push(p)
  }

  return (
    <section aria-label="Trace graph">
      <div className="relative hidden md:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px]" role="group" aria-label={`Relation graph: ${graph.nodes.size - 1} nodes around ${queryValue}`}>
          {/* cluster hulls first so nodes/edges paint on top */}
          {[...clusters].filter(([, pts]) => pts.length >= 2).map(([via, pts]) => {
            const hull = convexHull(pts)
            if (hull.length < 3) return null
            const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length
            const my = pts.reduce((s, p) => s + p.y, 0) / pts.length
            const padded = hull.map((p) => {
              const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy) || 1, s = (d + 20) / d
              return `${(mx + dx * s).toFixed(1)},${(my + dy * s).toFixed(1)}`
            }).join(' ')
            const top = pts.reduce((a, b) => (b.y < a.y ? b : a))
            return (
              <g key={'c' + via} aria-hidden="true">
                <polygon points={padded} stroke="rgba(164,67,44,0.25)" fill="rgba(164,67,44,0.05)" strokeWidth="1" />
                <text x={top.x} y={top.y - 26} textAnchor="middle" fontSize="9" fill={ASH} className="metric select-none">
                  {via.length > 20 ? via.slice(0, 20) + '…' : via}
                </text>
              </g>
            )
          })}
          {graph.edges.map((e, i) => {
            const a = positions.get(e.from), b = positions.get(e.to)
            if (!a || !b) return null
            const deep = b.node.ring >= MAX_RINGS
            const hot = hover && (e.from === `${hover.type}:${hover.value}` || e.to === `${hover.type}:${hover.value}`)
            return (
              <g key={'e' + i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={`rgba(110,103,92,${alpha(e.weight) * (deep ? 0.55 : 1)})`}
                  strokeWidth="1" strokeDasharray={deep ? '4 3' : undefined} />
                {/* labels only for the hovered node's edges — 100+ midpoint
                    labels at 9px are unreadable noise (deviation from brief) */}
                {hot && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} textAnchor="middle" fontSize="9"
                    fill={INK} className="metric select-none">{e.edge.replace(/_/g, ' ')}</text>
                )}
              </g>
            )
          })}
          {[...positions].filter(([, p]) => p.node.ring > 0).map(([k, p]) => (
            <g key={k} opacity={ringOpacity(p.node.ring)}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: '#ff6a2b' }} tabIndex={0} role="button"
              aria-label={`${p.node.value} (${p.node.type}, ${p.node.expanded ? 'expanded' : p.node.ring >= MAX_RINGS ? 'maximum depth' : 'expand into graph'})`}
              onMouseEnter={() => setHover(p.node)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.node)} onBlur={() => setHover(null)}
              onClick={() => { onSelectNode?.(k); onPivot(p.node.type, p.node.value) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onSelectNode?.(k); onPivot(p.node.type, p.node.value) } }}>
              <circle cx={p.x} cy={p.y} r={8}
                fill={p.node.malicious === true ? IRON : '#1f1b14'}
                stroke={p.node.malicious === true ? '#7d2f1c' : ASH}
                strokeWidth="1.5" strokeDasharray={!p.node.expanded && p.node.ring < MAX_RINGS ? '2 2' : undefined} />
              {selectedKey === k && (
                <circle cx={p.x} cy={p.y} r={12} fill="none" stroke={IRON} strokeWidth="1.5" strokeDasharray="3 3" aria-hidden="true" />
              )}
              {p.node.malicious === true && (
                <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#e3ddce">!</text>
              )}
              <text x={p.x} y={p.y + 22} textAnchor="middle"
                fontSize="10" fill={ASH} className="metric select-none">{nodeLabel(p.node)}</text>
            </g>
          ))}
          {expandingKey && positions.get(expandingKey) && (() => {
            const p = positions.get(expandingKey)!
            return <circle cx={p.x} cy={p.y} r={13} fill="none" stroke="#ff6a2b" strokeWidth="2"
              strokeDasharray="20 62" className="animate-spin"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }} aria-hidden="true" />
          })()}
          {rootPos && (
            <>
              {/* the vessel: soot body, iron rim, crackle mark */}
              <circle cx={rootPos.x} cy={rootPos.y} r={14} fill="#17140f" stroke={IRON} strokeWidth="2" />
              <path d={`M${rootPos.x - 6} ${rootPos.y - 8} l4 5 l-3 4 l5 6`} stroke="rgba(216,210,196,0.55)" strokeWidth="1" fill="none" aria-hidden="true" />
              <text x={rootPos.x} y={rootPos.y + 30} textAnchor="middle" fontSize="12" fill={INK} className="metric select-none">
                {queryValue.length > 18 ? queryValue.slice(0, 18) + '…' : queryValue}
                <title>{queryValue}</title>
              </text>
            </>
          )}
        </svg>
        {hover && (
          <div className="absolute top-2 left-2 shard rounded-none px-3 py-2 text-xs metric text-[#584f42] pointer-events-none max-w-[60%]" role="status">
            <span className="text-[#241f17] break-all">{hover.value}</span>{' '}
            <span className="text-[#6e675c]">[{hover.type}]</span>
            <div>
              {hover.edge?.replace(/_/g, ' ')}{hover.via ? ` · ${hover.via}` : ''} · weight {hover.weight}
            </div>
            {!hover.expanded && (
              <div className="text-[#a4432c]">{hover.ring >= MAX_RINGS ? 'max depth, table view only' : 'expand to investigate'}</div>
            )}
          </div>
        )}
      </div>
      {/* Mobile fallback list only — on lg the dossier's RelationsTable carries
          the dense view (Task F replaced the desktop <details> list with it). */}
      <details className="md:hidden mt-2">
        <summary className="metric text-[11px] uppercase tracking-wider text-[#584f42] cursor-pointer">Relation list ({Math.max(0, graph.nodes.size - 1)})</summary>
        <NodeTable graph={graph} onPivot={onPivot} />
      </details>
    </section>
  )
}

function NodeTable({ graph, onPivot }: { graph: GraphState; onPivot: (type: GraphNode['type'], value: string) => void }) {
  const nodes = [...graph.nodes.values()].filter((n) => n.ring > 0)
  return (
    <ul className="mt-2 divide-y divide-[#6e675c]/20">
      {nodes.map((n) => (
        <li key={`${n.type}:${n.value}`} className="flex items-center gap-3 py-1.5">
          <button onClick={() => onPivot(n.type, n.value)} disabled={n.expanded || n.ring >= MAX_RINGS}
            className="metric text-[11px] text-[#241f17] hover:text-[#a4432c] disabled:opacity-50 text-left truncate flex-1">
            {n.malicious === true && <span aria-hidden className="text-[#a4432c] mr-1">!</span>}{n.value}
          </button>
          <span className="metric text-[10px] uppercase text-[#584f42] shrink-0">{n.type}</span>
          <span className="metric text-[9px] text-[#584f42] shrink-0">{n.edge?.replace(/_/g, ' ')}{n.via ? ` · ${n.via}` : ''}{n.expanded ? ' · expanded' : ''}</span>
        </li>
      ))}
    </ul>
  )
}
