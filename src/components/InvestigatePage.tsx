import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { useInvestigation } from '@/useInvestigation'
import type { Dossier, IndicatorType, TimelinePoint } from '@/investigationTypes'
import TraceGraph from './investigate/TraceGraph'
import ActivityCalendar from './investigate/ActivityCalendar'
import { BehaviorSection, NarrativeSection, PulsesSection } from './investigate/BehaviorPanel'
import RelationsTable, { inspectNode } from './investigate/RelationsTable'
import { IocLink } from './investigate/IocLink'
import { formatRelative } from './investigate/formatRelative'
import {
  MAX_RINGS, collapseGraph, deserializePivotStack, mergeRelationsIntoGraph,
  nodeKey, restoreQueue, serializePivotStack, type GraphState,
} from './investigate/traceState'

// Re-export so existing deep-imports of IocLink keep working; the component
// itself lives in a dependency-light module the entry-point pages can import
// without pulling the dossier chunks into their bundles.
export { IocLink }

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

const STATUS: Record<Dossier['verdict']['status'], { label: string; icon: string; cls: string }> = {
  malicious: { label: 'MALICIOUS', icon: '!', cls: 'text-red-400 border-red-500/40 bg-red-500/10' },
  high_risk: { label: 'HIGH RISK', icon: '!', cls: 'text-red-300/90 border-red-500/35 bg-red-500/10' },
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

/** Print + JSON download affordances — native, zero deps. */
function ReportActions({ d }: { d: Dossier }) {
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `threatbase-${d.query.type}-${d.query.value.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const btn = 'font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 border border-white/10 rounded-full px-3.5 py-1.5 hover:text-red-200 hover:border-red-500/30 transition-colors'
  return (
    <div className="no-print flex justify-center md:justify-end gap-2 mb-3">
      <button type="button" onClick={() => window.print()} className={btn}>Print / PDF</button>
      <button type="button" onClick={downloadJson} className={btn}>Download JSON</button>
    </div>
  )
}

/** Compact chronological strip beside the calendar — newest 8 sighting days. */
function TimelineStrip({ timeline }: { timeline: TimelinePoint[] }) {
  const recent = timeline.slice(-8).reverse()
  return (
    <section aria-label="Timeline">
      <div className="eyebrow mb-2">Timeline</div>
      {recent.length ? (
        <ul className="divide-y divide-white/[0.04] font-mono text-[12px] text-slate-400">
          {recent.map((t) => (
            <li key={t.date} className="flex gap-2 py-1 tabular-nums">
              <span className="text-slate-300 shrink-0">{t.date.slice(0, 10)}</span>
              <span className="text-red-400/80 shrink-0">{t.count}×</span>
              <span className="truncate" title={t.sources.join(', ')}>{t.sources.join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[11px] text-slate-500">no dated sightings</p>
      )}
    </section>
  )
}

/** Raw source evidence — the "every detail" backstop. One <details> per
 *  SourceResult, pretty JSON in <pre> (React-escaped; never
 *  dangerouslySetInnerHTML). Absent on pre-F cached copies → section hidden. */
function EvidenceAccordion({ d }: { d: Dossier }) {
  const ev = d.evidence
  if (!ev?.length) return null
  return (
    <section aria-label="Raw source evidence">
      <div className="eyebrow mb-2">Raw source evidence</div>
      <div className="grid sm:grid-cols-2 gap-1">
        {ev.map((s, i) => (
          // 'unknown' can repeat when several settled rejections occur — index in the key
          <details key={`${s.source}-${i}`} className="bg-white/[0.02] border border-white/[0.06] rounded-md px-2 py-1">
            <summary className="font-mono text-[11px] text-slate-400 cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis">
              {s.ok ? '✓' : s.skipped ? '—' : '⚠'} {s.source}{' '}
              <span className="text-slate-600">{s.ok ? 'ok' : s.skipped ? 'skipped' : `failed${s.error ? ` · ${s.error}` : ''}`}</span>
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto font-mono text-[10px] leading-tight text-slate-500 whitespace-pre-wrap break-all">
              {JSON.stringify(s, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  )
}

/** Node inspector (cockpit row 2, cols 9–12). Shows the SELECTED graph node —
 *  or the root when nothing is picked, so the panel is never empty. Nodes
 *  without a fetched sub-dossier still get their full relation-row set. */
function NodeInspector({
  d, graph, selectedKey, onSelect, onExpand,
}: {
  d: Dossier
  graph: GraphState | null
  selectedKey: string | null
  onSelect: (key: string | null) => void
  onExpand: (type: IndicatorType, value: string) => void
}) {
  const rootKey = graph ? graph.pivotStack[0] : null
  const selKey = selectedKey ?? rootKey
  const node = (selKey && graph?.nodes.get(selKey)) || (rootKey ? graph!.nodes.get(rootKey) ?? null : null)
  const { rows, verdict } = inspectNode(node, d.relations ?? [])
  if (!node) return null
  const isRoot = node.ring === 0
  const vb = isRoot ? `${d.verdict.malicious_by}/${d.verdict.total_engines} sources flag it` : verdict
  const rootMal = isRoot ? d.verdict.malicious_by > 0 : !!node.malicious
  return (
    <section aria-label="Node inspector" className="glass-card rounded-xl p-3 h-full overflow-auto">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="eyebrow">Inspector</span>
        {!isRoot && (
          <button type="button" onClick={() => onSelect(null)} className="font-mono text-[10px] uppercase text-slate-500 hover:text-slate-300">root</button>
        )}
      </div>
      <div className="font-mono text-[13px] text-white break-all leading-snug">{node.value}</div>
      <div className="font-mono text-[10px] uppercase text-slate-500 mt-0.5">
        {node.type} · ring {node.ring}{node.edge ? ` · ${node.edge.replace(/_/g, ' ')}` : ''}{node.via ? ` · via ${node.via}` : ''} · weight {node.weight}
      </div>
      <div className="font-mono text-[11px] mt-2 tabular-nums">
        {vb ? (
          <span className="text-slate-300">
            <span aria-hidden className={rootMal ? 'text-red-400 mr-1' : 'text-slate-500 mr-1'}>{rootMal ? '●' : '○'}</span>
            {vb}
          </span>
        ) : (
          <span className="text-slate-500">no verdict yet —{' '}
            <button
              type="button"
              onClick={() => onExpand(node.type, node.value)}
              disabled={node.expanded || node.ring >= MAX_RINGS}
              className="text-red-400 hover:text-red-300 underline underline-offset-2 disabled:text-slate-600 disabled:no-underline"
            >
              {node.expanded ? 'verdict unavailable' : node.ring >= MAX_RINGS ? 'max depth' : 'expand to investigate'}
            </button>
          </span>
        )}
      </div>
      <div className="mt-3 border-t border-white/[0.06] pt-2">
        <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600 mb-1">relations ({rows.length})</div>
        {rows.length ? (
          <ul className="divide-y divide-white/[0.04] font-mono text-[11px] text-slate-400">
            {rows.map((r, i) => (
              <li key={`${r.edge}-${i}`} className="py-1 grid grid-cols-[auto_1fr_auto] gap-x-2 items-baseline">
                <span className="text-slate-500 uppercase text-[9px]">{r.edge.replace(/_/g, ' ')}</span>
                <span className="text-slate-500 truncate" title={r.via}>{r.via || '—'}</span>
                <span className="tabular-nums">{r.weight}·{(r.last_seen ?? r.first_seen ?? '—').slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-[11px] text-slate-600">none in this dossier</p>
        )}
      </div>
    </section>
  )
}

/** Dense analyst cockpit (Task F): every detail on one scrolling screen —
 *  verdict, identity, narrative, graph+inspector, calendar/timeline/behavior,
 *  full relations table, pulses, raw evidence. lg = 12-col grid; below lg the
 *  same panels stack (mobile fallback keeps the old vertical flow). */
function ReportView({
  d, graph, expandingKey, onExpand, onCollapse, onRefresh,
}: {
  d: Dossier
  graph: GraphState | null
  expandingKey: string | null
  onExpand: (type: IndicatorType, value: string) => void
  onCollapse: (depth: number) => void
  onRefresh: () => void
}) {
  const st = STATUS[d.verdict.status] ?? STATUS.unknown
  const id = d.identity
  const torExit = !!id && id.hosting_type === 'vps/cloud' && (d.verdict.tags ?? []).some((t) => /tor/i.test(t))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  return (
    // ponytail: rows below are the hard-coded cockpit — upgrade path is a
    // user-configurable panel toggle set, add when operators ask to hide panels.
    <div className="space-y-2 w-full max-w-[1400px]">
      <ReportActions d={d} />

      {/* Row 1 — verdict | identity | narrative, all visible at once */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        <div className="glass-card rounded-xl p-3 lg:col-span-4 flex items-center gap-4">
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-2 font-mono font-bold tracking-wider border rounded-full px-3 py-1 ${st.cls}`}>
              <span aria-hidden>{st.icon}</span>{st.label}
            </div>
            <div className="font-mono text-[11px] text-slate-500 mt-2 tabular-nums">
              {d.verdict.malicious_by} of {d.verdict.total_engines} sources flag it
              {typeof d.verdict.score === 'number' && d.verdict.confidence && (
                <span className="ml-1 text-slate-400">· conf {d.verdict.confidence.toUpperCase()}</span>
              )}
            </div>
            <div className="mt-2"><SourceStrip d={d} /></div>
            <div className="font-mono text-[10px] text-slate-500 mt-2 tabular-nums">
              {d.cached ? `report from ${ago(d.generated_at ?? '')}` : 'live'}
              {typeof d.investigated_by === 'number' && ` · ${d.investigated_by} investigation${d.investigated_by === 1 ? '' : 's'}`}
              {d.cached && (
                <span className="ml-1">
                  · refreshes {formatRelative(d.stale_at)}
                  {!d.refresh_blocked ? (
                    <button type="button" onClick={onRefresh} className="ml-1 text-red-500 hover:text-red-400 underline underline-offset-2">now</button>
                  ) : (
                    <span className="text-slate-600"> (1 h cooldown)</span>
                  )}
                </span>
              )}
            </div>
          </div>
          {(typeof d.verdict.score === 'number' ? d.verdict.score : typeof d.verdict.risk === 'number' ? d.verdict.risk : null) !== null && (
            <RiskGauge risk={(typeof d.verdict.score === 'number' ? d.verdict.score : d.verdict.risk) as number} />
          )}
        </div>

        <div className="glass-card rounded-xl p-3 lg:col-span-3">
          <div className="eyebrow mb-2">Identity</div>
          {id ? (
            <div className="flex flex-wrap gap-1.5">
              {id.asn && <Chip>{id.asn}</Chip>}
              {id.isp && <Chip>{id.isp}</Chip>}
              {(id.country || id.city) && <Chip>{[id.city, id.country].filter(Boolean).join(', ')}</Chip>}
              {id.hosting_type !== 'unknown' && <Chip>{id.hosting_type}</Chip>}
              {id.reverse_dns && <Chip>{id.reverse_dns}</Chip>}
              {id.registered && <Chip>reg {id.registered.slice(0, 10)}</Chip>}
              {torExit && <Chip tone="red">tor exit</Chip>}
              {(d.verdict.tags ?? []).slice(0, 12).map((t) => <Chip key={t} tone="red">{t}</Chip>)}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-slate-500">no identity data returned</p>
          )}
        </div>

        <div className="lg:col-span-5"><NarrativeSection d={d} /></div>
      </div>

      {/* Row 2 — graph + inspector */}
      {graph && graph.nodes.size > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <section className="glass-card rounded-xl p-3 lg:col-span-8" aria-label="Trace network">
            <div className="eyebrow mb-2">Trace network</div>
            {graph.pivotStack.length > 1 && <PivotBreadcrumb graph={graph} onCollapse={onCollapse} />}
            <TraceGraph graph={graph} onPivot={onExpand} expandingKey={expandingKey} selectedKey={selectedKey} onSelectNode={setSelectedKey} />
          </section>
          <div className="lg:col-span-4">
            <NodeInspector d={d} graph={graph} selectedKey={selectedKey} onSelect={setSelectedKey} onExpand={onExpand} />
          </div>
        </div>
      )}

      {/* Row 3 — calendar | timeline | behavior */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        {(d.timeline?.length ?? 0) > 0 && (
          <div className="glass-card rounded-xl p-3 lg:col-span-5"><ActivityCalendar timeline={d.timeline!} /></div>
        )}
        <div className="glass-card rounded-xl p-3 lg:col-span-3"><TimelineStrip timeline={d.timeline ?? []} /></div>
        <div className="glass-card rounded-xl p-3 lg:col-span-4"><BehaviorSection d={d} /></div>
      </div>

      {/* Row 4 — every relation, sortable/filterable, selection synced to graph */}
      <section className="glass-card rounded-xl p-3" aria-label="Relations">
        <div className="eyebrow mb-2">Relations · {d.relations?.length ?? 0}</div>
        <RelationsTable relations={d.relations ?? []} selectedKey={selectedKey} onSelect={setSelectedKey} />
      </section>

      {/* Row 5 — pulses + raw evidence backstop */}
      {((d.pulses?.length ?? 0) > 0 || (d.evidence?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          {(d.pulses?.length ?? 0) > 0 && <div className="glass-card rounded-xl p-3 lg:col-span-5"><PulsesSection d={d} /></div>}
          {(d.evidence?.length ?? 0) > 0 && <div className="glass-card rounded-xl p-3 lg:col-span-7"><EvidenceAccordion d={d} /></div>}
        </div>
      )}
    </div>
  )
}

/** Breadcrumb strip above the graph: root › pivot › pivot… click to collapse. */
function PivotBreadcrumb({ graph, onCollapse }: { graph: GraphState; onCollapse: (depth: number) => void }) {
  return (
    <nav className="flex items-center gap-1 text-xs font-mono text-slate-400 mb-2 overflow-x-auto" aria-label="Pivot trail">
      {graph.pivotStack.map((key, i) => {
        const v = key.slice(key.indexOf(':') + 1)
        const label = v.length > 24 ? v.slice(0, 24) + '…' : v
        const last = i === graph.pivotStack.length - 1
        return (
          <span key={`${key}-${i}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span aria-hidden className="text-slate-600">›</span>}
            {last
              ? <span aria-current="page" className="text-slate-200 truncate max-w-32">{label}</span>
              : <button onClick={() => onCollapse(i)} className="hover:text-white transition-colors truncate max-w-32">{label}</button>}
          </span>
        )
      })}
    </nav>
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
  const wantsRefresh = params.get('refresh') === '1'
  const { dossier, loading, error } = useInvestigation(q || null, wantsRefresh)
  const [term, setTerm] = useState(q)
  // Route key is pathname-only, so q changes don't remount — keep the box in
  // sync with the URL (pivots from Task 6, back/forward).
  useEffect(() => setTerm(q), [q])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = term.trim()
    if (v) navigate(`/investigate?q=${encodeURIComponent(v)}`)
  }

  // Crumb = sessionStorage value trail (survives the new in-graph pivots too).
  // Functional update so async callers (expandNode) never see stale state.
  const [crumbs, setCrumbs] = useState<string[]>(() => {
    try { const x = JSON.parse(sessionStorage.getItem('inv:crumbs') || '[]'); return Array.isArray(x) ? x : [] } catch { return [] }
  })
  const pushCrumb = (value: string) => {
    setCrumbs((prev) => {
      const next = [...prev.filter((c) => c !== value), value].slice(-6)
      sessionStorage.setItem('inv:crumbs', JSON.stringify(next))
      return next
    })
  }

  // --- In-graph expansion (Task D) -----------------------------------------
  // graphRef is the single source of truth read/written from async code
  // (amendment #9: never touch graphState inside closures). setGraphState only
  // receives pre-computed values, so stale-closure clobbering can't happen.
  const [graphState, setGraphState] = useState<GraphState | null>(null)
  const graphRef = useRef<GraphState | null>(null)
  const [expandingNode, setExpandingNode] = useState<string | null>(null)
  const busyRef = useRef(false)

  // (Re)build the graph from the root dossier — and restore any ?pivots= trail.
  useEffect(() => {
    if (!dossier || dossier.note) { graphRef.current = null; setGraphState(null); return }
    const rootKey = nodeKey(dossier.query.type, dossier.query.value)
    const initial: GraphState = {
      nodes: new Map([[rootKey, { type: dossier.query.type, value: dossier.query.value, malicious: dossier.verdict?.malicious_by > 0, weight: 100, ring: 0, expanded: true }]]),
      edges: [],
      pivotStack: [rootKey],
    }
    graphRef.current = mergeRelationsIntoGraph(initial, dossier.relations ?? [], rootKey, 1)
    setGraphState(graphRef.current)

    // Restore: re-fetch each trail pivot sequentially; index 0 is the root
    // (== current q, already fetched). Ref-based so the loop never reads stale
    // closure state.
    const pivots = deserializePivotStack(params.get('pivots') ?? '')
    if (pivots.length > 1) {
      let cancelled = false
      ;(async () => {
        for (const key of restoreQueue(pivots)) {
          if (cancelled) return
          const sep = key.indexOf(':')
          // replace, not push: restoring a shared link shouldn't add 7 back-stops
          await expandNode(key.slice(0, sep) as IndicatorType, key.slice(sep + 1), false)
        }
      })()
      return () => { cancelled = true }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier])

  const syncPivotsParam = (stack: string[], push: boolean) => {
    const u = new URL(window.location.href)
    if (stack.length > 1) u.searchParams.set('pivots', serializePivotStack(stack))
    else u.searchParams.delete('pivots')
    window.history[push ? 'pushState' : 'replaceState']({}, '', u.toString())
  }
  // Force-refresh drops the server cache for this indicator (1/IP/hour; the
  // endpoint serves the cached copy with refresh_blocked when it's used up).
  const onRefresh = () => navigate(`/investigate?q=${encodeURIComponent(q)}&refresh=1`)

  /** Fetch the node's dossier and merge its relations in as the next ring.
   *  No-op while another expansion is in flight (keeps rl_inv headroom).
   *  `push=false` replaces the URL instead of adding history (restore loop). */
  const expandNode = useCallback(async (type: IndicatorType, value: string, push = true) => {
    const cur = graphRef.current
    if (!cur || busyRef.current) return
    const key = nodeKey(type, value)
    const node = cur.nodes.get(key)
    if (!node || node.expanded || node.ring >= MAX_RINGS) return
    busyRef.current = true
    setExpandingNode(key)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/investigate?q=${encodeURIComponent(value)}`)
      if (!res.ok) return
      const pd: Dossier | null = await res.json().catch(() => null)
      if (!pd || !pd.query) return
      const now = graphRef.current!
      let next = mergeRelationsIntoGraph(now, pd.relations ?? [], key, node.ring + 1)
      const fresh = next.nodes.get(key)
      if (fresh) next.nodes.set(key, { ...fresh, expanded: true, malicious: (pd.verdict?.malicious_by ?? 0) > 0, mal_by: pd.verdict?.malicious_by, engines: pd.verdict?.total_engines })
      next = { ...next, pivotStack: [...next.pivotStack, key] }
      graphRef.current = next
      setGraphState(next)
      syncPivotsParam(next.pivotStack, push)
      pushCrumb(value) // keep the sessionStorage trail current for back-nav affordance
    } catch {
      // failed pivot fetch: graph simply doesn't grow; toast is overkill here
    } finally {
      busyRef.current = false
      setExpandingNode(null)
    }
  }, [])

  /** Breadcrumb click: drop everything deeper than `depth`. */
  const collapseToDepth = useCallback((depth: number) => {
    const cur = graphRef.current
    if (!cur) return
    const next = collapseGraph(cur, depth)
    graphRef.current = next
    setGraphState(next)
    syncPivotsParam(next.pivotStack, false)
  }, [])

  const search = (
    <form onSubmit={submit} className="no-print max-w-xl mx-auto mb-10">
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

  const hasReport = !!(q && !loading && !error && dossier && !dossier.note)
  return (
    <IsoPageShell>
      {/* Cockpit mode (Task F): with a dossier on screen the hero collapses to
          a one-line header so the dense grid starts at the top of the viewport. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className={`no-print mx-auto text-center ${hasReport ? 'max-w-3xl mb-4' : 'max-w-3xl mb-8'}`}
      >
        {hasReport ? (
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <span className="eyebrow">Deep Investigation</span>
            <span className="font-mono text-sm text-slate-300 break-all">{q}</span>
          </div>
        ) : (
          <>
            <div className="eyebrow mb-6">Deep Investigation</div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter text-white mb-6">
              Everything it <span className="text-liquid-red">touched</span>.
            </h1>
          </>
        )}
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
        dossier.note ? <NonRoutable d={dossier} /> : (
          // key by the indicator: a new q remounts the cockpit and drops the
          // selectedKey (row 4/inspector selection belongs to the old dossier)
          <ReportView key={dossier.query.value} d={dossier} graph={graphState} expandingKey={expandingNode} onExpand={expandNode} onCollapse={collapseToDepth} onRefresh={onRefresh} />
        )
      )}
      {crumbs.length > 1 && (
        <nav aria-label="Investigation trail" className="no-print flex flex-wrap gap-2 justify-center mt-10">
          {crumbs.map((c) => (
            // ponytail: co-IP ISP-on-hover deferred — needs per-relation geo fan-out; plain pivot link for now
            <IocLink key={c} value={c}>{c.length > 24 ? c.slice(0, 24) + '…' : c}</IocLink>
          ))}
        </nav>
      )}
    </IsoPageShell>
  )
}
