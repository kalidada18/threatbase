import { useState } from 'react'
import { motion } from 'framer-motion'
import { multiRingLayout, convexHull } from './traceGeometry'
import { MAX_RINGS, nodeKey, type GraphNode, type GraphState } from './traceState'
import { edgeLabel, viaLabel, weightLabel } from './labels'

const W = 720, H = 460

/** Short display label for a graph node. Hashes (any length) render as the
 *  type initial; long non-hash values truncate; ≤14 chars render in full. */
function nodeLabel(n: GraphNode): string {
  if (/^(md5|sha1|sha256)$/.test(n.type)) return n.type.slice(0, 7).toUpperCase()
  return n.value.length > 14 ? n.value.slice(0, 14) + '…' : n.value
}

const alpha = (w: number) => 0.25 + 0.75 * Math.min(1, (w || 0) / 8)
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
  const rootPos = root ? positions.get(nodeKey(root.type, root.value)) : undefined
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
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px] mx-auto" role="group" aria-label={`Relation graph: ${graph.nodes.size - 1} nodes around ${queryValue}`}>
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
                <polygon points={padded} stroke="hsl(var(--chart-1) / 0.12)" fill="hsl(var(--chart-1) / 0.04)" strokeWidth="1" />
                <text x={top.x} y={top.y - 26} textAnchor="middle" fontSize="9" fill="rgba(148,163,184,0.8)" className="font-mono select-none">
                  {via.length > 20 ? via.slice(0, 20) + '…' : via}
                </text>
              </g>
            )
          })}
          {graph.edges.map((e, i) => {
            const a = positions.get(e.from), b = positions.get(e.to)
            if (!a || !b) return null
            const deep = b.node.ring >= MAX_RINGS
            const hot = hover && (e.from === nodeKey(hover.type, hover.value) || e.to === nodeKey(hover.type, hover.value))
            return (
              <motion.g key={'e' + i}
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={`hsl(var(--chart-1) / ${alpha(e.weight) * (deep ? 0.55 : 1)})`}
                  strokeWidth="1" strokeDasharray={deep ? '4 3' : undefined} />
                {/* labels only for the hovered node's edges — 100+ midpoint
                    labels at 9px are unreadable noise (deviation from brief) */}
                {hot && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} textAnchor="middle" fontSize="9"
                    fill="rgba(203,213,225,0.9)" className="font-mono select-none">{edgeLabel(e.edge)}</text>
                )}
              </motion.g>
            )
          })}
          {[...positions].filter(([, p]) => p.node.ring > 0).map(([k, p]) => (
            <motion.g key={k}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500/60" tabIndex={0} role="button"
              aria-label={`${p.node.value} (${p.node.type}, ${p.node.expanded ? 'expanded' : p.node.ring >= MAX_RINGS ? 'maximum depth' : 'expand into graph'})`}
              onMouseEnter={() => setHover(p.node)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.node)} onBlur={() => setHover(null)}
              onClick={() => { onSelectNode?.(k); onPivot(p.node.type, p.node.value) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onSelectNode?.(k); onPivot(p.node.type, p.node.value) } }}
              initial={{ x: p.x, y: p.y, opacity: 0, scale: 0.5 }}
              animate={{ x: p.x, y: p.y, opacity: ringOpacity(p.node.ring), scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
              <circle cx={0} cy={0} r={8}
                fill={p.node.malicious === true ? 'hsl(var(--chart-1))' : 'rgba(15,23,42,0.9)'}
                stroke={p.node.malicious === true ? 'hsl(351 90% 70%)' : 'rgba(148,163,184,0.6)'}
                strokeWidth="1.5" strokeDasharray={!p.node.expanded && p.node.ring < MAX_RINGS ? '2 2' : undefined} />
              {selectedKey === k && (
                <circle cx={0} cy={0} r={12} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="1.5" aria-hidden="true" />
              )}
              {p.node.malicious === true && (
                <text x={0} y={3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">!</text>
              )}
              <text x={0} y={22} textAnchor="middle"
                fontSize="10" fill="rgba(148,163,184,0.9)" className="font-mono select-none">{nodeLabel(p.node)}</text>
            </motion.g>
          ))}
          {expandingKey && positions.get(expandingKey) && (() => {
            const p = positions.get(expandingKey)!
            return <circle cx={p.x} cy={p.y} r={13} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="2"
              strokeDasharray="20 62" className="animate-spin"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }} aria-hidden="true" />
          })()}
          {rootPos && (
            <>
              <circle cx={rootPos.x} cy={rootPos.y} r={14} fill="rgba(8,11,18,0.95)" stroke="hsl(var(--chart-1))" strokeWidth="2" />
              <text x={rootPos.x} y={rootPos.y + 30} textAnchor="middle" fontSize="12" fill="#e2e8f0" className="font-mono select-none">
                {queryValue.length > 18 ? queryValue.slice(0, 18) + '…' : queryValue}
                <title>{queryValue}</title>
              </text>
            </>
          )}
        </svg>
        {hover && (
          <div className="absolute top-2 left-2 glass-card rounded-md px-3 py-2 text-xs font-mono text-slate-300 pointer-events-none max-w-[60%]" role="status">
            <span className="text-white break-all">{hover.value}</span>{' '}
            <span className="text-slate-400">[{hover.type}]</span>
            <div className="text-slate-400">
              {edgeLabel(hover.edge) || 'linked'}{hover.via ? ` · via ${viaLabel(hover.edge, hover.via)}` : ''} · {weightLabel(hover.weight)} link
            </div>
            {!hover.expanded && (
              <div className="text-red-200/80">{hover.ring >= MAX_RINGS ? 'max depth, table view only' : 'expand to investigate'}</div>
            )}
          </div>
        )}
      </div>
      {/* Mobile fallback list only — on lg the cockpit's RelationsTable carries
          the dense view (Task F replaced the desktop <details> list with it). */}
      <details className="md:hidden mt-2">
        <summary className="font-mono text-[11px] uppercase tracking-wider text-slate-400 cursor-pointer">Relation list ({Math.max(0, graph.nodes.size - 1)})</summary>
        <NodeTable graph={graph} onPivot={onPivot} />
      </details>
    </section>
  )
}

function NodeTable({ graph, onPivot }: { graph: GraphState; onPivot: (type: GraphNode['type'], value: string) => void }) {
  const nodes = [...graph.nodes.values()].filter((n) => n.ring > 0)
  return (
    <ul className="mt-2 divide-y divide-white/[0.04]">
      {nodes.map((n) => (
        <li key={nodeKey(n.type, n.value)} className="flex items-center gap-3 py-1.5">
          <button onClick={() => onPivot(n.type, n.value)} disabled={n.expanded || n.ring >= MAX_RINGS}
            className="font-mono text-[11px] text-slate-300 hover:text-red-200 disabled:opacity-50 text-left truncate flex-1">
            {n.malicious === true && <span aria-hidden className="text-red-400 mr-1">!</span>}{n.value}
          </button>
          <span className="font-mono text-[10px] uppercase text-slate-400 shrink-0">{n.type}</span>
          <span className="font-mono text-[9px] text-slate-400 shrink-0">{edgeLabel(n.edge) || 'linked'}{n.via ? ` · ${viaLabel(n.edge, n.via)}` : ''}{n.expanded ? ' · expanded' : ''}</span>
        </li>
      ))}
    </ul>
  )
}
