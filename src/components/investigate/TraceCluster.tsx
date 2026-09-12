/** Campaign cluster band: Threat Trace's persistent graph around the current
 *  indicator. Hidden while empty (honest — no theater), and it GROWS as the
 *  community investigates: "N indicators linked through M sightings".
 *  Read-only preview; deep-diving a node navigates to its own dossier. */
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Radar, Network } from 'lucide-react'
import { Chip } from './states'
import { edgeLabel, viaLabel, weightLabel } from './labels'
import { formatDay } from './formatRelative'
import { EASE_EXPO } from '../motion/primitives'

export type TraceEdge = { from: string; to: string; edge: string; via: string | null; weight: number; first_seen: string | null; last_seen: string | null; sources: string[] }
export type TraceNode = { key: string; type: string; value: string; degree: number; weight: number; last_seen: string | null }
export type TraceBody = { query: { type: string; value: string }; present: boolean; nodes: TraceNode[]; edges: TraceEdge[] }

/** Bare relative call — same convention as fetchDossier, no auth needed for a
 *  public graph read (and it must NOT consume the investigate token). */
export async function fetchTrace(q: string): Promise<TraceBody | null> {
  const r = await fetch(`${import.meta.env.BASE_URL}api/trace?q=${encodeURIComponent(q)}`)
  if (!r.ok) return null
  return (await r.json().catch(() => null)) as TraceBody | null
}

export function useTrace(q: string | null) {
  const [body, setBody] = useState<TraceBody | null>(null)
  useEffect(() => {
    setBody(null)
    if (!q) return
    let cancelled = false
    fetchTrace(q).then((b) => { if (!cancelled) setBody(b) }).catch(() => {})
    return () => { cancelled = true }
  }, [q])
  return body
}

/** The value half of a nodeKey canon (`type:value`). */
const valueOf = (key: string) => key.slice(key.indexOf(':') + 1)

export default function TraceCluster({ q, onNavigate }: { q: string; onNavigate: (value: string) => void }) {
  const body = useTrace(q)
  const reduce = useReducedMotion()
  if (!body || !body.present || !body.nodes.length) return null
  const sources = new Set(body.edges.flatMap((e) => e.sources ?? []))
  return (
    <motion.section
      aria-label="Campaign cluster"
      initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_EXPO }}
      className="glass-card rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <Network size={12} strokeWidth={2} aria-hidden className="text-red-400" />
        <span className="eyebrow">Campaign cluster</span>
        <Chip tone="neutral"><Radar size={10} strokeWidth={2} aria-hidden />Threat Trace</Chip>
      </div>
      <p className="font-mono text-[12px] text-slate-300 tabular-nums mb-3">
        {body.nodes.length} indicator{body.nodes.length === 1 ? '' : 's'} linked through {body.edges.length} graph edge{body.edges.length === 1 ? '' : 's'}
        {sources.size > 0 && <> · from {sources.size} source{sources.size === 1 ? '' : 's'} in our trail</>}
      </p>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {body.nodes.slice(0, 12).map((n) => (
          <li key={n.key}>
            <button
              type="button"
              onClick={() => onNavigate(n.value)}
              className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 hover:border-red-500/30 hover:bg-red-500/[0.04] transition-colors active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40"
              title={`Investigate ${n.value}`}
            >
              <span className="block font-mono text-[12px] text-slate-100 truncate">{n.value}</span>
              <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400 mt-0.5 truncate">
                {n.type} · {weightLabel(n.weight)} · {n.degree} edge{n.degree === 1 ? '' : 's'}
                {n.last_seen && <> · {formatDay(n.last_seen)}</>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {body.nodes.length > 12 && (
        <p className="font-mono text-[10px] text-slate-400 mt-2">+{body.nodes.length - 12} more in the trail · strongest shown first</p>
      )}
      {/* one edge sample proves it's real infrastructure, not decoration */}
      {body.edges[0] && (() => {
        const other = body.edges[0].from.includes(q.toLowerCase()) ? valueOf(body.edges[0].to) : valueOf(body.edges[0].from)
        return (
          <p className="font-mono text-[10px] text-slate-400 mt-2">
            nearest link: {other} · {edgeLabel(body.edges[0].edge)}
            {body.edges[0].via ? ` · via ${viaLabel(body.edges[0].edge, body.edges[0].via)}` : ''}
          </p>
        )
      })()}
    </motion.section>
  )
}
