import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, CircleAlert, CircleDashed, CircleSlash, HelpCircle, Lock, Minus, RefreshCw, Search, ShieldAlert, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import './investigate/raku.css'
import { useSEO } from '@/useSEO'
import { useAuth } from '@/AuthContext'
import { useInvestigation } from '@/useInvestigation'
import { usePro } from '@/usePro'
import type { Dossier, IndicatorType, TimelinePoint } from '@/investigationTypes'
import TraceGraph from './investigate/TraceGraph'
import ActivityCalendar from './investigate/ActivityCalendar'
import { BehaviorSection, NarrativeSection, PulsesSection } from './investigate/BehaviorPanel'
import RelationsTable, { inspectNode } from './investigate/RelationsTable'
import { IocLink } from './investigate/IocLink'
import { StageLabel } from './investigate/StageLabel'
import { formatRelative } from './investigate/formatRelative'
import { tagLabel, tagTone } from './investigate/tagLabel'
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

/** The firing log of the dossier pipeline — the same stages number every
 *  section header, so the reader sees the report as a deliberate process.
 *  Every line is a fact of the server pipeline, not marketing. */
const FIRING_STAGES = [
  { n: '01', name: 'COLLECT', note: '54 OSINT feeds queried' },
  { n: '02', name: 'VERDICT', note: 'recency-decayed weighting' },
  { n: '03', name: 'IDENTITY', note: 'ASN, geo, rDNS, hosting' },
  { n: '04', name: 'NARRATE', note: 'machine analyst summary' },
  { n: '05', name: 'TRACE', note: 'relations graph, pivotable' },
  { n: '06', name: 'ACTIVITY', note: '90-day sighting calendar' },
  { n: '07', name: 'BEHAVIOR', note: 'ports, tags, first/last seen' },
  { n: '08', name: 'PROOF', note: 'raw per-source evidence' },
]

/** Glazed chip: small mono tag on the shard. Red-tone = iron (a hard claim). */
const Chip = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'red' }) => (
  <span
    className={`metric text-[10px] uppercase tracking-[0.14em] border px-2 py-0.5 rounded-[2px] ${
      tone === 'red'
        ? 'text-[#7d2f1c] border-[#a4432c]/45 bg-[#a4432c]/10'
        : 'text-[#584f42] border-[#6e675c]/35 bg-[#6e675c]/10'
    }`}
  >
    {children}
  </span>
)

const STATUS: Record<Dossier['verdict']['status'], { label: string; icon: LucideIcon; cls: string }> = {
  malicious: { label: 'MALICIOUS', icon: ShieldAlert, cls: 'text-[#a4432c]' },
  high_risk: { label: 'HIGH RISK', icon: TriangleAlert, cls: 'text-[#a4432c]' },
  suspicious: { label: 'SUSPICIOUS', icon: Search, cls: 'text-[#8a5a3c]' },
  clean: { label: 'CLEAN', icon: ShieldCheck, cls: 'text-[#33604a]' },
  unknown: { label: 'UNKNOWN', icon: HelpCircle, cls: 'text-[#584f42]' },
}

/** One ok/skipped/failed vocabulary for evidence chips + source strip.
 *  ok = copper flash, skipped = ash, failed = iron (a defect in the kiln). */
const EV_ICON: Record<'ok' | 'skipped' | 'failed', LucideIcon> = {
  ok: Check, skipped: Minus, failed: CircleAlert,
}
const EV_CLS: Record<'ok' | 'skipped' | 'failed', string> = {
  ok: 'text-[#33604a]', skipped: 'text-[#584f42]', failed: 'text-[#a4432c]',
}

/** Iron risk gauge — the arc's own length is severity; the number rides it so
 *  it never reads color-alone. Not ember: severity is not a live control. */
function RiskGauge({ risk }: { risk: number }) {
  const R = 34, C = 2 * Math.PI * R
  const frac = Math.min(100, Math.max(0, risk)) / 100
  return (
    <div className="relative w-[88px] h-[88px] shrink-0" role="img" aria-label={`Risk score ${Math.round(risk)} of 100`}>
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(110,103,92,0.25)" strokeWidth="7" />
        {/* zero-length dash + round linecap still paints a dot at 0 — only draw above zero */}
        {frac > 0 && (
          <circle
            cx="44" cy="44" r={R} fill="none" stroke="#a4432c" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${frac * C} ${C}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center metric font-bold text-2xl text-[#241f17] leading-none">
        {Math.round(risk)}
        <span className="sr-only">/100</span>
      </div>
      <div className="absolute inset-x-0 -bottom-1 text-center metric text-[9px] uppercase tracking-[0.2em] text-[#584f42]">risk</div>
    </div>
  )
}

/** Print + JSON download affordances — native, zero deps. Ghost controls:
 *  only the Investigate submit wears ember. */
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
  return (
    <div className="no-print flex justify-end gap-2 mb-4">
      <button type="button" onClick={() => window.print()} className="ghost-btn">Print / PDF</button>
      <button type="button" onClick={downloadJson} className="ghost-btn">Download JSON</button>
    </div>
  )
}

/** Compact chronological strip beside the calendar — newest 8 sighting days. */
function TimelineStrip({ timeline }: { timeline: TimelinePoint[] }) {
  const recent = timeline.slice(-8).reverse()
  return (
    <section aria-label="Timeline">
      <StageLabel n="06" name="TIMELINE" />
      {recent.length ? (
        <ul className="divide-y divide-[#6e675c]/20 metric text-[12px] text-[#584f42]">
          {recent.map((t) => (
            <li key={t.date} className="flex gap-2 py-1 tabular-nums">
              <span className="text-[#241f17] shrink-0">{t.date.slice(0, 10)}</span>
              <span className="text-[#a4432c] shrink-0">{t.count}×</span>
              <span className="truncate" title={t.sources.join(', ')}>{t.sources.join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="metric text-[11px] text-[#584f42]">no dated sightings</p>
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
      <StageLabel n="08" name="PROOF" />
      <div className="grid sm:grid-cols-2 gap-1">
        {ev.map((s, i) => {
          // 'unknown' can repeat when several settled rejections occur — index in the key
          const st = s.ok ? 'ok' : s.skipped ? 'skipped' : 'failed'
          const Icon = EV_ICON[st]
          return (
            <details key={`${s.source}-${i}`} className="rounded-[2px] border border-[#6e675c]/25 bg-[#6e675c]/5 px-2 py-1">
              <summary className="metric text-[11px] text-[#584f42] cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis">
                <Icon size={10} strokeWidth={2} aria-hidden className={`inline-block align-[-1px] mr-1.5 ${EV_CLS[st]}`} />
                <span className="text-[#241f17]">{s.source}</span>{' '}
                <span>{st === 'failed' && s.error ? `failed · ${s.error}` : st}</span>
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto metric text-[10px] leading-tight text-[#584f42] whitespace-pre-wrap break-all">
                {JSON.stringify(s, null, 2)}
              </pre>
            </details>
          )
        })}
      </div>
    </section>
  )
}

/** Source strip: which feeds fired, which skipped, which failed — the honest
 *  states up front, not buried. Names only, with counts; the accordion has why. */
function SourceStrip({ d }: { d: Dossier }) {
  const ok = d.sources_ok ?? []
  const skipped = d.sources_skipped ?? []
  const failed = d.sources_failed ?? []
  if (!ok.length && !skipped.length && !failed.length) return null
  const item = (list: string[], cls: string) =>
    list.map((s) => <li key={s} className={`metric text-[10px] ${cls}`}>{s}</li>)
  return (
    <>
      <div className="metric text-[9px] uppercase tracking-[0.24em] text-[#584f42] mb-1.5">
        {ok.length} fired{skipped.length ? ` · ${skipped.length} skipped` : ''}{failed.length ? ` · ${failed.length} failed` : ''}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 max-h-24 overflow-auto" aria-label="Source status">
        {item(ok, 'text-[#33604a]')}
        {item(skipped, 'text-[#584f42] line-through decoration-[#6e675c]/50')}
        {item(failed, 'text-[#a4432c]')}
      </ul>
    </>
  )
}

/** Whether any per-source status exists (drives the COLLECT shard). */
const hasSourceStatus = (d: Dossier) =>
  (d.sources_ok?.length ?? 0) > 0 || (d.sources_skipped?.length ?? 0) > 0 || (d.sources_failed?.length ?? 0) > 0

/** Node inspector (graph row, right shard). Shows the SELECTED graph node —
 *  or the root when nothing is picked, so the panel is never empty. Nodes
 *  without a fetched sub-dossier still get their full relation-row set. */
function NodeInspector({
  d, graph, selectedKey, pivotError, expandingKey, onSelect, onExpand,
}: {
  d: Dossier
  graph: GraphState | null
  selectedKey: string | null
  pivotError: string | null
  expandingKey: string | null
  onSelect: (key: string | null) => void
  onExpand: (type: IndicatorType, value: string) => void
}) {
  const rootKey = graph ? graph.pivotStack[0] : null
  const selKey = selectedKey ?? rootKey
  const node = (selKey && graph?.nodes.get(selKey)) || (rootKey ? graph!.nodes.get(rootKey) ?? null : null)
  const { rows, verdict } = inspectNode(node, d.relations ?? [])
  if (!node) return null
  const isRoot = node.ring === 0
  const expanding = expandingKey === nodeKey(node.type, node.value)
  const mal = isRoot ? d.verdict.malicious_by > 0 : !!node.malicious
  const vb = isRoot ? `${d.verdict.malicious_by}/${d.verdict.total_engines} sources flag it` : verdict
  return (
    <section aria-label="Node inspector" className="shard shard-b rounded-none p-4 h-full overflow-auto">
      <div className="flex items-center justify-between gap-2 mb-2">
        <StageLabel n="05" name="INSPECT" />
        {!isRoot && (
          <button type="button" onClick={() => onSelect(null)} className="metric text-[10px] uppercase text-[#584f42] hover:text-[#ff6a2b] active:scale-[0.98] transition-colors shrink-0">root</button>
        )}
      </div>
      <div className="metric text-[13px] text-[#241f17] break-all leading-snug">{node.value}</div>
      <div className="metric text-[10px] uppercase text-[#584f42] mt-0.5">
        {node.type} · ring {node.ring}{node.edge ? ` · ${node.edge.replace(/_/g, ' ')}` : ''}{node.via ? ` · via ${node.via}` : ''} · weight {node.weight}
      </div>
      <div className="metric text-[11px] mt-2 tabular-nums">
        {vb ? (
          <span className={mal ? 'st-iron' : 'st-ash'}>{vb}</span>
        ) : (
          <span className="text-[#584f42]">No verdict yet.{' '}
            <button
              type="button"
              onClick={() => onExpand(node.type, node.value)}
              disabled={node.expanded || node.ring >= MAX_RINGS || expanding}
              className="text-[#241f17] underline decoration-[#a4432c]/60 underline-offset-2 hover:text-[#a4432c] disabled:text-[#584f42] disabled:no-underline disabled:cursor-not-allowed active:scale-[0.98] inline-flex items-center gap-1"
            >
              {expanding && <RefreshCw size={10} className="animate-spin" aria-hidden />}
              {node.expanded ? 'verdict unavailable' : node.ring >= MAX_RINGS ? 'max depth' : expanding ? 'expanding…' : 'expand to investigate'}
            </button>
          </span>
        )}
      </div>
      {/* U6: pivot expansion failures surface here — icon+text, never silent. */}
      {pivotError && (
        <p className="metric text-[11px] text-[#a4432c] mt-2 flex items-start gap-1.5">
          <CircleAlert size={12} strokeWidth={2} aria-hidden className="shrink-0 mt-0.5" />
          <span className="break-all">{pivotError}</span>
        </p>
      )}
      <div className="mt-3 border-t border-[#6e675c]/25 pt-2">
        <div className="metric text-[10px] uppercase tracking-widest text-[#584f42] mb-1">relations ({rows.length})</div>
        {rows.length ? (
          <ul className="divide-y divide-[#6e675c]/20 metric text-[11px] text-[#584f42]">
            {rows.map((r, i) => (
              <li key={`${r.edge}-${i}`} className="py-1 grid grid-cols-[auto_1fr_auto] gap-x-2 items-baseline">
                <span className="text-[#241f17] uppercase text-[10px]">{r.edge.replace(/_/g, ' ')}</span>
                <span className="truncate" title={r.via}>{r.via || 'n/a'}</span>
                <span className="tabular-nums">{r.weight}·{(r.last_seen ?? r.first_seen ?? 'n/a').slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="metric text-[11px] text-[#584f42]">none in this dossier</p>
        )}
      </div>
    </section>
  )
}

/** Label/value dossier row (identity shard): scans top-to-bottom, empty fields drop. */
const IdRow = ({ label, value }: { label: string; value?: string | null }) => (
  value ? (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-[#6e675c]/20 last:border-b-0">
      <span className="metric text-[10px] uppercase tracking-[0.16em] text-[#584f42] shrink-0">{label}</span>
      <span className="metric text-[11px] text-[#241f17] text-right break-all min-w-0">{value}</span>
    </div>
  ) : null
)

/** Staged settlement: each section of the dossier glazes over in firing order,
 *  one deliberate settle per stage (transform+opacity only, honors reduced). */
function Stage({ idx, reduce, children, className = '' }: { idx: number; reduce: boolean | null; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: Math.min(0.6, idx * 0.09), ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Dossier surface (Raku Smoke Flash): every detail on one scrolling record —
 *  verdict, identity, narrative, graph+inspector, calendar/timeline/behavior,
 *  full relations table, pulses, raw evidence. Asymmetric by law: the vessel
 *  sits off-axis (5/3/4, 8/4, 5/3/4), panels stagger their top edge, and no
 *  row mirrors another. Below lg the same shards stack. */
function ReportView({
  d, graph, expandingKey, pivotError, refreshing, onExpand, onCollapse, onRefresh,
}: {
  d: Dossier
  graph: GraphState | null
  expandingKey: string | null
  pivotError: string | null
  refreshing: boolean
  onExpand: (type: IndicatorType, value: string) => void
  onCollapse: (depth: number) => void
  onRefresh: () => void
}) {
  const st = STATUS[d.verdict.status] ?? STATUS.unknown
  const id = d.identity
  const reduce = useReducedMotion()
  const torExit = !!id && id.hosting_type === 'vps/cloud' && (d.verdict.tags ?? []).some((t) => /tor/i.test(t))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const b = d.behavior
  const behaviorEmpty = !(b && (b.ports?.length || b.tags?.length || b.first_seen || b.last_seen))
  const relsEmpty = !(d.relations?.length)
  const idEmpty = !!id && !(id.asn || id.isp || id.country || id.city || id.region || id.reverse_dns || id.registered || id.hosting_type !== 'unknown') && !(d.verdict.tags?.length)
  return (
    // ponytail: rows below are the hard-coded firing order — upgrade path is a
    // user-configurable panel toggle set, add when operators ask to hide panels.
    <div className="w-full max-w-[1400px]">
      <ReportActions d={d} />

      {/* Row 1 — verdict 5 | identity 3 | narrative 4, off-axis and staggered */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3 items-start">
        <Stage idx={0} reduce={reduce} className="lg:col-span-5">
          <div className="shard rounded-none p-5 flex items-start gap-5">
            <div className="min-w-0">
              <StageLabel n="02" name="VERDICT" />
              <div className={`flex items-center gap-2 metric font-bold text-[11px] tracking-[0.24em] uppercase ${st.cls}`}>
                <st.icon size={14} strokeWidth={2} aria-hidden />{st.label}
              </div>
              <div className="metric text-[12px] text-[#241f17] mt-3 tabular-nums">
                {d.verdict.malicious_by} of {d.verdict.total_engines} sources flag it
              </div>
              {/* Confidence as a handwritten margin annotation with a leader rule. */}
              {typeof d.verdict.score === 'number' && d.verdict.confidence && (
                <div className="mt-2 flex items-center gap-2">
                  <span aria-hidden className="h-px w-6 bg-[#6e675c]/60 -rotate-[18deg]" />
                  <span className="text-[12px] italic text-[#584f42]">
                    {d.verdict.confidence} confidence{d.verdict.dominant_source ? `, led by ${d.verdict.dominant_source}` : ''}
                  </span>
                </div>
              )}
              <div className="metric text-[10px] text-[#584f42] mt-3 tabular-nums flex items-center gap-2 flex-wrap">
                <span>
                  {d.cached ? `report from ${ago(d.generated_at ?? '')}` : 'fired live'}
                  {typeof d.investigated_by === 'number' && ` · ${d.investigated_by} investigation${d.investigated_by === 1 ? '' : 's'}`}
                  {d.cached && ` · refreshes ${formatRelative(d.stale_at)}`}
                </span>
                {d.cached && (
                  !d.refresh_blocked ? (
                    <button
                      type="button"
                      onClick={onRefresh}
                      className="inline-flex items-center gap-1.5 metric text-[10px] uppercase tracking-[0.2em] text-[#584f42] border border-[#6e675c]/40 rounded-[2px] px-2 py-0.5 hover:text-[#ff6a2b] hover:border-[#ff6a2b]/50 transition-colors active:scale-[0.98]"
                    >
                      <RefreshCw size={10} aria-hidden className={refreshing ? 'animate-spin' : undefined} />{refreshing ? 'refiring' : 'refire'}
                    </button>
                  ) : (
                    <span className="text-[#584f42]">1 h cooldown</span>
                  )
                )}
              </div>
            </div>
            {(typeof d.verdict.score === 'number' ? d.verdict.score : typeof d.verdict.risk === 'number' ? d.verdict.risk : null) !== null && (
              <RiskGauge risk={(typeof d.verdict.score === 'number' ? d.verdict.score : d.verdict.risk) as number} />
            )}
          </div>
          {hasSourceStatus(d) && (
            <div className="shard rounded-none p-4 mt-3">
              <StageLabel n="01" name="COLLECT" />
              <SourceStrip d={d} />
            </div>
          )}
        </Stage>

        <Stage idx={1} reduce={reduce} className="lg:col-span-3 lg:mt-10">
          <div className="shard shard-b rounded-none p-5">
            <StageLabel n="03" name="IDENTITY" />
            {id ? (
              idEmpty ? (
                /* U8: every identity field null → one honest line, not a grid of dashes */
                <p className="metric text-[11px] text-[#584f42]">No geolocation data</p>
              ) : (
                <>
                  <div>
                    <IdRow label="ASN" value={id.asn} />
                    <IdRow label="ISP" value={id.isp} />
                    <IdRow label="Location" value={[id.city, id.region, id.country].filter(Boolean).join(', ') || null} />
                    <IdRow label="rDNS" value={id.reverse_dns} />
                    <IdRow label="Registered" value={id.registered?.slice(0, 10)} />
                  </div>
                  {(id.hosting_type !== 'unknown' || torExit || (d.verdict.tags ?? []).length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {id.hosting_type !== 'unknown' && <Chip>{id.hosting_type}</Chip>}
                      {torExit && <Chip tone="red">tor exit</Chip>}
                      {(d.verdict.tags ?? []).slice(0, 12).map((t) => <Chip key={t} tone={tagTone(t)}>{tagLabel(t)}</Chip>)}
                    </div>
                  )}
                </>
              )
            ) : (
              <p className="metric text-[11px] text-[#584f42]">no identity data returned</p>
            )}
          </div>
        </Stage>

        <Stage idx={2} reduce={reduce} className="lg:col-span-4 lg:mt-4">
          <NarrativeSection d={d} />
        </Stage>
      </div>

      {/* Row 2 — graph 8 | inspector 4 */}
      {graph && graph.nodes.size > 1 && (
        <Stage idx={3} reduce={reduce} className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3 items-start mt-4 lg:mt-10">
          <section className="shard shard-c rounded-none p-5 lg:col-span-8" aria-label="Trace network">
            <StageLabel n="05" name="TRACE" />
            {graph.pivotStack.length > 1 && <PivotBreadcrumb graph={graph} onCollapse={onCollapse} />}
            <TraceGraph graph={graph} onPivot={onExpand} expandingKey={expandingKey} selectedKey={selectedKey} onSelectNode={setSelectedKey} />
          </section>
          <div className="lg:col-span-4">
            <NodeInspector d={d} graph={graph} selectedKey={selectedKey} pivotError={pivotError} expandingKey={expandingKey} onSelect={setSelectedKey} onExpand={onExpand} />
          </div>
        </Stage>
      )}

      {/* Row 3 — calendar | timeline | behavior. U1: with nothing to say in
          either row 3's behavior card or row 4, one quiet line replaces both
          instead of two stretched voids. */}
      {behaviorEmpty && relsEmpty ? (
        <Stage idx={4} reduce={reduce} className="mt-10 flex items-center justify-center gap-3">
          <CircleDashed size={20} strokeWidth={1.5} aria-hidden className="text-[#6e675c] shrink-0" />
          <p className="metric text-[12px] text-[#a9a091]">No behavior or relation data for this indicator</p>
        </Stage>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3 items-start mt-4 lg:mt-14">
            {(d.timeline?.length ?? 0) > 0 && (
              <Stage idx={4} reduce={reduce} className="lg:col-span-5">
                <div className="shard rounded-none p-5"><ActivityCalendar timeline={d.timeline!} /></div>
              </Stage>
            )}
            <Stage idx={5} reduce={reduce} className={`${(d.timeline?.length ?? 0) > 0 ? 'lg:col-span-3 lg:mt-8' : 'lg:col-span-4'}`}>
              <div className="shard shard-b rounded-none p-5"><TimelineStrip timeline={d.timeline ?? []} /></div>
            </Stage>
            <Stage idx={6} reduce={reduce} className="lg:col-span-4 lg:mt-2">
              <div className="shard shard-c rounded-none p-5"><BehaviorSection d={d} /></div>
            </Stage>
          </div>

          {/* Row 4 — every relation, sortable/filterable, selection synced to graph */}
          <Stage idx={7} reduce={reduce} className="mt-4 lg:mt-14">
            <section aria-label="Relations" className="shard shard-b rounded-none p-5">
              <StageLabel n="05" name="RELATIONS" />
              {relsEmpty ? (
                <p className="metric text-[11px] text-[#584f42]">No relations reported for this indicator</p>
              ) : (
                <RelationsTable relations={d.relations ?? []} selectedKey={selectedKey} onSelect={setSelectedKey} />
              )}
            </section>
          </Stage>
        </>
      )}

      {/* Row 5 — pulses + raw evidence backstop */}
      {((d.pulses?.length ?? 0) > 0 || (d.evidence?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3 items-start mt-4 lg:mt-14">
          {(d.pulses?.length ?? 0) > 0 && (
            <Stage idx={8} reduce={reduce} className="lg:col-span-4">
              <div className="shard shard-c rounded-none p-5"><PulsesSection d={d} /></div>
            </Stage>
          )}
          {(d.evidence?.length ?? 0) > 0 && (
            <Stage idx={9} reduce={reduce} className="lg:col-span-8 lg:mt-6">
              <div className="shard rounded-none p-5"><EvidenceAccordion d={d} /></div>
            </Stage>
          )}
        </div>
      )}
    </div>
  )
}

/** Breadcrumb strip above the graph: root › pivot › pivot… click to collapse. */
function PivotBreadcrumb({ graph, onCollapse }: { graph: GraphState; onCollapse: (depth: number) => void }) {
  return (
    <nav className="flex items-center gap-1 text-xs metric text-[#584f42] mb-2 overflow-x-auto" aria-label="Pivot trail">
      {graph.pivotStack.map((key, i) => {
        const v = key.slice(key.indexOf(':') + 1)
        const label = v.length > 24 ? v.slice(0, 24) + '…' : v
        const last = i === graph.pivotStack.length - 1
        return (
          <span key={`${key}-${i}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span aria-hidden className="text-[#6e675c]">›</span>}
            {last
              ? <span aria-current="page" className="text-[#241f17] truncate max-w-32">{label}</span>
              : <button onClick={() => onCollapse(i)} className="hover:text-[#ff6a2b] transition-colors truncate max-w-32">{label}</button>}
          </span>
        )
      })}
    </nav>
  )
}

function NonRoutable({ d }: { d: Dossier }) {
  return (
    <div className="shard rounded-none p-8 text-center max-w-md">
      <div className="flex justify-center mb-3 text-[#584f42]"><CircleSlash size={24} strokeWidth={1.5} aria-hidden /></div>
      <div className="metric text-sm text-[#241f17] mb-2 break-all">{d.query.value}</div>
      <p className="text-sm text-[#584f42]">{d.note || 'This address is private or reserved. It cannot be investigated.'}</p>
    </div>
  )
}

/** Pro gate shell: one glaze shard for every non-'pro' state. */
const GateCard = ({ children }: { children: ReactNode }) => (
  <div className="shard shard-b rounded-none p-8 text-center max-w-md">
    {children}
  </div>
)

const GateLink = ({ children, href }: { children: ReactNode; href: string }) => (
  <Link
    to={href}
    className="ghost-btn !px-6 !py-2.5 !text-[11px]"
  >
    {children}
  </Link>
)

export default function InvestigatePage() {
  useSEO({
    title: 'Deep Investigation | Threatbase',
    description: 'Trace everything a public IP, domain, URL or file hash touched: verdicts, relations, behavior and an AI summary.',
    path: '/investigate',
  })
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { status: proStatus, refetch } = usePro()
  const { user } = useAuth()
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
  const [pivotError, setPivotError] = useState<string | null>(null) // U6: failed pivots must not be a dead click
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
    setPivotError(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/investigate?q=${encodeURIComponent(value)}`)
      if (!res.ok) { setPivotError(`Couldn't expand ${value}: ${res.status === 429 ? "rate-limited, try again in a minute" : 'upstream failed, try again'}`); return }
      const pd: Dossier | null = await res.json().catch(() => null)
      if (!pd || !pd.query) { setPivotError(`Couldn't expand ${value}: no dossier returned`); return }
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
      // graph simply doesn't grow, but the inspector says why (U6)
      setPivotError(`Couldn't expand ${value}: network error, try again`)
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

  // Keep the last successful dossier for the CURRENT query on screen while a
  // re-run is in flight: refreshing must not destroy the report you're
  // refreshing. A new q (or an error) falls through to the skeleton instead.
  const shown = q && dossier && !error && dossier.query.value.toLowerCase() === q.toLowerCase() ? dossier : null
  const hasReport = !!(shown && !shown.note)

  const search = (
    <form onSubmit={submit} className={`no-print flex gap-2 ${hasReport ? 'max-w-xl mb-6' : 'max-w-2xl'}`}>
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="8.8.8.8 · evil.example.com · e3b0c442…"
        aria-label="Indicator to investigate"
        spellCheck={false}
        className="query-input min-w-0 flex-1 px-5 py-4 metric text-lg"
      />
      {/* U7: Enter worked; clicking where a button should be did nothing. */}
      <button type="submit" className="ember-btn shrink-0 self-stretch">
        Investigate
      </button>
    </form>
  )

  // Pro gate (hooks above already ran — safe to branch here).
  if (proStatus !== 'pro') {
    return (
      <div className="raku-root">
        <div className="relative z-10 flex flex-col px-6 pt-28 pb-24">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl mb-10"
          >
            <div className="kiln max-w-xs"><span><span className="kiln-n">STAGE 00</span><span aria-hidden className="mx-2 opacity-60">·</span>DEEP INVESTIGATION</span></div>
          </motion.div>
          {proStatus === 'checking' && (
            <div className="space-y-4 max-w-md" aria-busy="true">
              <div className="cool-skel h-24" />
              <div className="cool-skel h-4 w-2/3" />
              <div className="cool-skel h-4 w-1/2" />
            </div>
          )}
          {proStatus === 'not-pro' && (
            <GateCard>
              <h2 className="text-2xl font-bold tracking-tight text-[#241f17] mb-3"><Lock size={16} aria-hidden className="inline-block mr-2 -mt-1" />A Pro feature</h2>
              <p className="text-sm text-[#584f42] mb-2">
                Trace everything an IP, domain, URL or hash touched. 12 intel sources,
                a weighted verdict, an AI analyst summary and a shareable dossier.
              </p>
              <p className="text-sm text-[#584f42] mb-6">
                Pro is on manual onboarding right now:{' '}
                <a
                  href="mailto:threatbasepro@gmail.com"
                  className="text-[#a4432c] underline decoration-[#a4432c]/40 underline-offset-2 hover:decoration-[#a4432c] break-all"
                >
                  Email threatbasepro@gmail.com
                </a>{' '}
                to unlock it.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <GateLink href="/pricing">See pricing</GateLink>
              </div>
              {!user && (
                <p className="text-xs text-[#584f42] mt-4">Sign in first (top right) to check your access.</p>
              )}
            </GateCard>
          )}
          {proStatus === 'signed-out' && (
            <GateCard>
              <h2 className="text-2xl font-bold tracking-tight text-[#241f17] mb-3">Sign in to check your access</h2>
              <p className="text-sm text-[#584f42] mb-6">
                Deep Investigation is a Pro feature. Use the sign-in buttons at the top
                right and we&rsquo;ll check what&rsquo;s on your account.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <GateLink href="/pricing">See pricing</GateLink>
              </div>
            </GateCard>
          )}
          {proStatus === 'unavailable' && (
            <GateCard>
              <div className="flex justify-center mb-3 text-[#a4432c]"><TriangleAlert size={24} strokeWidth={1.5} aria-hidden /></div>
              <h2 className="text-xl font-bold tracking-tight text-[#241f17] mb-3">
                Couldn&rsquo;t verify your access. Check your connection.
              </h2>
              <button
                type="button"
                onClick={refetch}
                className="ghost-btn !px-6 !py-2.5 !text-[11px] mx-auto"
              >
                <RefreshCw size={12} aria-hidden /> Retry
              </button>
            </GateCard>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="raku-root">
      <div className="relative z-10 flex flex-col px-6 pt-28 pb-24">
        {/* Off-axis vessel: with a dossier the header collapses to the firing
            line; the empty state is a two-column kiln, nothing centered. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className={`no-print ${hasReport ? 'max-w-3xl mb-5' : 'w-full max-w-[1400px] grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-12'}`}
        >
          {hasReport ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="kiln !mb-0 w-auto"><span><span className="kiln-n">STAGE 00</span><span aria-hidden className="mx-2 opacity-60">·</span>DEEP INVESTIGATION</span></span>
              <span className="metric text-sm text-[#a9a091] break-all">{q}</span>
            </div>
          ) : (
            <>
              <div className="lg:col-span-7">
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[#d8d2c4] mb-8">
                  Everything it<br />
                  <span className="relative inline-block text-[#e3ddce]">
                    touched
                    {/* brushstroke under the promise: one hand-drawn iron mark */}
                    <svg aria-hidden viewBox="0 0 220 10" className="absolute -bottom-2 left-0 w-full h-[10px]" preserveAspectRatio="none">
                      <path d="M3 7 C40 3 70 8 110 5 C150 2 185 7 217 4" stroke="#a4432c" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.85" />
                    </svg>
                  </span>
                  .
                </h1>
                {search}
                {!q && (
                  <p className="mt-4 text-[#a9a091] text-sm metric">
                    Paste an IP, domain, URL or hash. Every result has a shareable URL.
                  </p>
                )}
              </div>
              {/* Firing log right of axis: what the kiln actually does, staged. */}
              <div className="lg:col-span-4 lg:col-start-9 pb-2">
                <div className="kiln"><span><span className="kiln-n">THE FIRING LOG</span></span></div>
                <ol className="space-y-2.5">
                  {FIRING_STAGES.map((s) => (
                    <li key={s.n} className="grid grid-cols-[3.2rem_1fr] gap-2 items-baseline">
                      <span className="metric text-[10px] tracking-[0.2em] text-[#ff6a2b]">{s.n}</span>
                      <span>
                        <span className="metric text-[11px] tracking-[0.14em] uppercase text-[#d8d2c4]">{s.name}</span>
                        <span className="block text-[12px] text-[#a9a091]">{s.note}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </motion.div>

        {hasReport && search}

        {q && loading && !shown && (
          <div className="space-y-4 max-w-3xl w-full" aria-busy="true">
            <div className="kiln max-w-xs"><span><span className="kiln-n">FIRING</span><span aria-hidden className="mx-2 opacity-60">·</span>QUERYING 54 FEEDS</span></div>
            <div className="grid grid-cols-12 gap-3">
              <div className="cool-skel h-40 col-span-5" />
              <div className="cool-skel h-40 col-span-3 col-start-8" />
            </div>
            <div className="cool-skel h-64" />
          </div>
        )}

        {q && !loading && error && (
          <div className="shard shard-b rounded-none p-6 max-w-md text-center">
            <div className="metric text-[10px] uppercase tracking-[0.2em] text-[#a4432c] mb-2 inline-flex items-center gap-1.5 justify-center"><CircleAlert size={12} strokeWidth={2} aria-hidden />Investigation failed</div>
            <p className="text-sm text-[#584f42] break-words">{error}</p>
          </div>
        )}

        {shown && (
          shown.note ? <NonRoutable d={shown} /> : (
            // key by the indicator: a new q remounts the dossier and drops the
            // selectedKey (row 4/inspector selection belongs to the old dossier)
            <ReportView key={shown.query.value} d={shown} graph={graphState} expandingKey={expandingNode} pivotError={pivotError} refreshing={loading} onExpand={expandNode} onCollapse={collapseToDepth} onRefresh={onRefresh} />
          )
        )}
        {crumbs.length > 1 && (
          <nav aria-label="Investigation trail" className="no-print flex flex-wrap gap-2 mt-14">
            {crumbs.map((c) => (
              // ponytail: co-IP ISP-on-hover deferred — needs per-relation geo fan-out; plain pivot link for now
              <span key={c} className="border border-[#6e675c]/35 rounded-[2px] px-2.5 py-1">
                <IocLink key={c} value={c}>{c.length > 24 ? c.slice(0, 24) + '…' : c}</IocLink>
              </span>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
