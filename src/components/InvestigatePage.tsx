import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CircleAlert, CircleDashed, CircleSlash, Lock, RefreshCw, Search, ShieldAlert, ShieldCheck, TriangleAlert, HelpCircle, type LucideIcon } from 'lucide-react'
import IsoPageShell from './layout/IsoPageShell'
import { useSEO } from '@/useSEO'
import { useAuth } from '@/AuthContext'
import { useInvestigation } from '@/useInvestigation'
import { fetchDossier } from '@/investigateFetch'
import { usePro } from '@/usePro'
import { useCountUp } from '@/lib/useCountUp'
import { refang, sniffType, hasDefangMarks } from '@/lib/indicator'
import type { Dossier, IndicatorType, TimelinePoint } from '@/investigationTypes'
import TraceGraph from './investigate/TraceGraph'
import TraceCluster from './investigate/TraceCluster'
import ActivityCalendar from './investigate/ActivityCalendar'
import InvestigationConsole from './investigate/InvestigationConsole'
import { SourceTile, buildRoster, type RosterTile } from './investigate/SourceRoster'
import { BehaviorSection, NarrativeSection, PulsesSection } from './investigate/BehaviorPanel'
import RelationsTable, { inspectNode } from './investigate/RelationsTable'
import { IocLink } from './investigate/IocLink'
import { Chip, EV_ICON, ConfidencePill } from './investigate/states'
import { edgeLabel, hostingLabel, labelDominantSource, labelSource, viaLabel, weightLabel } from './investigate/labels'
import { tagLabel, tagTone } from './investigate/tagLabel'
import { formatAgo, formatDay, formatRelative } from './investigate/formatRelative'
import { cockpitBand, cockpitContainer } from './motion/primitives'
import {
  MAX_RINGS, collapseGraph, deserializePivotStack, mergeRelationsIntoGraph,
  nodeKey, restoreQueue, serializePivotStack, type GraphState,
} from './investigate/traceState'

// Re-export so existing deep-imports of IocLink keep working; the component
// itself lives in a dependency-light module the entry-point pages can import
// without pulling the dossier chunks into their bundles.
export { IocLink }

/** FREE_TRIAL — owner 2026-09-12: Deep Investigation is open to every visitor
 *  for pre-launch testing. The server mirrors this (index.ts); rate limits and
 *  the refresh cooldown stay as the abuse guard. Flip to false when Pro goes paid. */
const FREE_TRIAL = true

const STATUS: Record<Dossier['verdict']['status'], { label: string; icon: LucideIcon; cls: string }> = {
  malicious: { label: 'MALICIOUS', icon: ShieldAlert, cls: 'text-red-200 border-red-500/40 bg-red-500/10' },
  high_risk: { label: 'HIGH RISK', icon: TriangleAlert, cls: 'text-red-200/90 border-red-500/35 bg-red-500/10' },
  suspicious: { label: 'SUSPICIOUS', icon: Search, cls: 'text-red-200/80 border-red-500/25 border-dashed bg-red-500/5' },
  clean: { label: 'CLEAN', icon: ShieldCheck, cls: 'text-emerald-200/90 border-emerald-500/30 bg-emerald-500/10' },
  unknown: { label: 'UNKNOWN', icon: HelpCircle, cls: 'text-slate-300 border-white/15 bg-white/[0.04]' },
}

const TYPE_LABEL: Record<IndicatorType, string> = {
  ipv4: 'IPv4', ipv6: 'IPv6', domain: 'Domain', url: 'URL', md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256',
}

/** One ok/skipped/failed vocabulary for evidence chips (EV_ICON in states). */

/** Animate the risk gauge: arc draws, number counts up. */
function RiskGauge({ risk }: { risk: number }) {
  const R = 34
  const frac = Math.min(100, Math.max(0, risk)) / 100
  const shown = useCountUp(Math.round(risk), 900)
  return (
    <div className="relative w-[88px] h-[88px] shrink-0" role="img" aria-label={`Risk score ${Math.round(risk)} of 100`}>
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        {frac > 0 && (
          <motion.circle
            cx="44" cy="44" r={R} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="7" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: frac }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono font-bold text-2xl text-white tabular-nums leading-none">
        {shown}
        <span className="sr-only">/100</span>
      </div>
      <div className="absolute inset-x-0 -bottom-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400">risk</div>
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
  const btn = 'font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 border border-white/10 rounded-full px-3.5 py-1.5 hover:text-red-200 hover:border-red-500/30 transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40'
  return (
    <div className="no-print flex gap-2">
      <button type="button" onClick={() => window.print()} className={btn}>Print / PDF</button>
      <button type="button" onClick={downloadJson} className={btn}>Download JSON</button>
    </div>
  )
}

/** Verdict banner: status word + gauge first, honest tally line, meta rail right. */
function VerdictBanner({ d, refreshing, onRefresh }: { d: Dossier; refreshing: boolean; onRefresh: () => void }) {
  const st = STATUS[d.verdict.status] ?? STATUS.unknown
  const risk = typeof d.verdict.score === 'number' ? d.verdict.score : typeof d.verdict.risk === 'number' ? d.verdict.risk : null
  const riskKind = typeof d.verdict.score === 'number' ? 'risk' : 'feed risk'
  const ttl = formatRelative(d.stale_at)
  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-b from-red-500/25 to-transparent">
      <div className="glass-card rounded-xl p-4 lg:p-5 flex flex-col md:flex-row gap-4 md:items-center">
        <div className="flex-1 min-w-0">
          <div className={`inline-flex items-center gap-2 font-mono font-bold tracking-wider border rounded-full px-3 py-1 ${st.cls}`}>
            <st.icon size={12} strokeWidth={2} aria-hidden />{st.label}
          </div>
          <p className="font-mono text-[12px] text-slate-300 mt-2.5 tabular-nums">
            {d.verdict.malicious_by} of {d.verdict.total_engines} sources with an opinion
            {d.verdict.dominant_source && <span className="text-slate-400"> · primary signal: {labelDominantSource(d.verdict.dominant_source)}</span>}
            {typeof d.verdict.feed_count === 'number' && d.verdict.feed_count > 0 && (
              <span className="text-slate-400"> · on {d.verdict.feed_count} internal feeds</span>
            )}
          </p>
          {d.verdict.confidence && <div className="mt-2"><ConfidencePill level={d.verdict.confidence} /></div>}
          <div className="font-mono text-[10px] text-slate-400 mt-2.5 tabular-nums flex items-center gap-2 flex-wrap">
            <span>
              {d.cached && d.generated_at ? `report from ${formatDay(d.generated_at)} · ${formatAgo(d.generated_at)}` : d.cached ? 'cached report' : 'live query'}
              {typeof d.investigated_by === 'number' && ` · ${d.investigated_by} investigation${d.investigated_by === 1 ? '' : 's'}`}
              {d.cached && ttl && ttl !== 'expired' && ` · expires ${ttl}`}
            </span>
            {d.cached && (
              !d.refresh_blocked ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-red-300 border border-red-500/30 bg-red-500/10 rounded-full px-2.5 py-0.5 hover:text-red-200 hover:border-red-500/50 transition-colors active:scale-[0.98]"
                >
                  <RefreshCw size={10} aria-hidden className={refreshing ? 'animate-spin' : undefined} />{refreshing ? 'refreshing' : 'refresh now'}
                </button>
              ) : (
                <span className="text-slate-400">{d.refresh_retry_at ? `cooldown · retry ${formatRelative(d.refresh_retry_at) || 'in 1 h'}` : '1 h cooldown'}</span>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {risk !== null && <RiskGauge risk={risk} />}
          <div className="hidden lg:flex flex-col items-end gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400">{riskKind}</span>
            <ReportActions d={d} />
          </div>
        </div>
      </div>
      {/* actions ride below the banner on small screens */}
      <div className="lg:hidden px-4 pb-4"><ReportActions d={d} /></div>
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
              <span className="text-slate-200 shrink-0">{formatDay(t.date) || t.date.slice(0, 10)}</span>
              <span className="text-red-400/90 shrink-0">{t.count}×</span>
              <span className="truncate" title={t.sources.map(labelSource).join(', ')}>
                {t.sources.length > 1 ? `${labelSource(t.sources[0])} +${t.sources.length - 1} more` : labelSource(t.sources[0])}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[11px] text-slate-400">No dated sightings.</p>
      )}
    </section>
  )
}

/** Raw source evidence — the "every detail" backstop, receded below the
 *  narrative so the normalized dossier reads first. Absent on pre-F cached
 *  copies → section hidden. */
function EvidenceAccordion({ d }: { d: Dossier }) {
  const ev = d.evidence
  if (!ev?.length) return null
  const rollup = {
    ok: ev.filter((s) => s.ok).length,
    skipped: ev.filter((s) => !s.ok && s.skipped).length,
    failed: ev.filter((s) => !s.ok && !s.skipped).length,
  }
  return (
    <section aria-label="Raw source evidence">
      <div className="eyebrow mb-2">Raw source evidence</div>
      <p className="font-mono text-[10px] text-slate-400 tabular-nums mb-2">
        {rollup.ok} responded · {rollup.skipped} not applicable · {rollup.failed} failed
      </p>
      <div className="grid sm:grid-cols-2 gap-1">
        {ev.map((s, i) => (
          // 'unknown' can repeat when several settled rejections occur — index in the key
          <details key={`${s.source}-${i}`} className="bg-white/[0.02] border border-white/[0.06] rounded-md px-2 py-1">
            <summary className="font-mono text-[11px] text-slate-300 cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis">
              {(() => { const Icon = EV_ICON[s.ok ? 'ok' : s.skipped ? 'skipped' : 'failed']; return <Icon size={10} strokeWidth={2} aria-hidden className="inline-block align-[-1px] mr-1.5" /> })()}
              <span>{labelSource(s.source)}</span>{' '}
              <span className="text-slate-400">{s.ok ? 'responded' : s.skipped ? 'not applicable' : 'failed'}</span>
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto font-mono text-[10px] leading-tight text-slate-400 whitespace-pre-wrap break-all">
              {JSON.stringify(s, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  )
}

/** Footprint band: the raw intelligence read first. Masthead, identity,
 *  per-source roster, community pulses. */
function FootprintBand({ d }: { d: Dossier }) {
  const id = d.identity
  const torExit = !!id && id.hosting_type === 'vps/cloud' && (d.verdict.tags ?? []).some((t) => /tor/i.test(t))
  const idEmpty = !!id && !(id.asn || id.isp || id.country || id.city || id.region || id.reverse_dns || id.registered || id.hosting_type !== 'unknown') && !(d.verdict.tags?.length)
  const roster: RosterTile[] = useMemo(() => {
    const fromEv = buildRoster(d.evidence)
    if (fromEv.length) return fromEv
    // pre-F cached copies carry only the three source lists
    return [
      ...(d.sources_ok ?? []).map((s) => ({ key: s, name: labelSource(s), state: 'clean' as const })),
      ...(d.sources_skipped ?? []).map((s) => ({ key: s, name: labelSource(s), state: 'skipped' as const })),
      ...(d.sources_failed ?? []).map((s) => ({ key: s, name: labelSource(s), state: 'failed' as const })),
    ]
  }, [d])
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
      <div className="lg:col-span-8 space-y-2">
        <div className="glass-card rounded-xl p-4">
          <div className="eyebrow mb-2">Indicator</div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl md:text-3xl font-bold text-white tabular-nums break-all leading-tight">{d.query.value}</span>
            <Chip tone="neutral" className="shrink-0">{TYPE_LABEL[d.query.type] ?? d.query.type.toUpperCase()}</Chip>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="eyebrow mb-2">Footprint</div>
          {id ? (
            idEmpty ? (
              <p className="font-mono text-[12px] text-slate-300">No geolocation data.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-6">
                <IdRow label="ASN" value={id.asn} />
                <IdRow label="ISP" value={id.isp} />
                <IdRow label="Location" value={[id.city, id.region, id.country].filter(Boolean).join(', ') || (id.country_code ?? null)} />
                <IdRow label="rDNS" value={id.reverse_dns} />
                <IdRow label="Registered" value={id.registered ? formatDay(id.registered) : null} />
                <IdRow label="Hosting" value={id.hosting_type !== 'unknown' ? hostingLabel(id.hosting_type) : null} />
              </div>
            )
          ) : (
            <p className="font-mono text-[12px] text-slate-300">No identity data returned.</p>
          )}
          {(d.verdict.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {torExit && <Chip tone="red">tor exit</Chip>}
              {(d.verdict.tags ?? []).slice(0, 12).map((t) => <Chip key={t} tone={tagTone(t)}>{tagLabel(t)}</Chip>)}
            </div>
          )}
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="eyebrow mb-2">Intel sources</div>
          {roster.length ? (
            <div className="flex flex-wrap gap-1.5">{roster.map((t) => <SourceTile key={t.key} tile={t} />)}</div>
          ) : (
            <p className="font-mono text-[12px] text-slate-300">Per-source detail unavailable for this cached report.</p>
          )}
        </div>
      </div>
      <div className="lg:col-span-4 space-y-2">
        {d.verdict.tags?.length ? (
          <div className="glass-card rounded-xl p-4">
            <div className="eyebrow mb-2">All flags</div>
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-auto">
              {d.verdict.tags.map((t) => <Chip key={t} tone={tagTone(t)}>{tagLabel(t)}</Chip>)}
            </div>
          </div>
        ) : null}
        <div className="glass-card rounded-xl p-4">
          <PulsesSection d={d} />
        </div>
      </div>
    </div>
  )
}

/** Node inspector (relations band, right column). Shows the SELECTED graph
 *  node — or the root when nothing is picked, so the panel is never empty.
 *  Nodes without a fetched sub-dossier still get their full relation-row set. */
function NodeInspector({
  d, graph, selectedKey, pivotError, expandingKey, onSelect, onExpand,
}: {
  d: Dossier
  graph: GraphState | null
  selectedKey: string | null
  pivotError: { key: string; msg: string } | null
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
  const selNodeKey = nodeKey(node.type, node.value)
  const showError = pivotError && pivotError.key === selNodeKey
  return (
    <section aria-label="Node inspector" className="glass-card rounded-xl p-3 h-full overflow-auto">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="eyebrow">Inspector</span>
        {!isRoot && (
          <button type="button" onClick={() => onSelect(null)} className="font-mono text-[10px] uppercase text-slate-300 hover:text-white active:scale-[0.98] transition-colors">root</button>
        )}
      </div>
      <div className="font-mono text-[13px] text-white break-all leading-snug">{node.value}</div>
      <div className="font-mono text-[10px] uppercase text-slate-400 mt-0.5">
        {node.type} · {node.ring === 0 ? 'root' : `${node.ring} hop${node.ring === 1 ? '' : 's'}`}{node.edge ? ` · ${edgeLabel(node.edge)}` : ''}{node.via ? ` · via ${viaLabel(node.edge, node.via)}` : ''} · {weightLabel(node.weight)} link
      </div>
      <div className="font-mono text-[11px] mt-2 tabular-nums">
        {vb ? (
          <span className={mal ? 'text-red-300' : 'text-slate-300'}>{vb}</span>
        ) : (
          <span className="text-slate-300">No verdict yet.{' '}
            <button
              type="button"
              onClick={() => onExpand(node.type, node.value)}
              disabled={node.expanded || node.ring >= MAX_RINGS || expanding}
              className="text-red-400 hover:text-red-300 underline underline-offset-2 disabled:text-slate-400 disabled:no-underline active:scale-[0.98] inline-flex items-center gap-1"
            >
              {expanding && <RefreshCw size={10} className="animate-spin" aria-hidden />}
              {node.expanded ? 'verdict unavailable' : node.ring >= MAX_RINGS ? 'max depth' : expanding ? 'expanding…' : 'expand to investigate'}
            </button>
          </span>
        )}
      </div>
      {/* U6: pivot expansion failures surface here for the FAILED node only — icon+text, never silent. */}
      {showError && (
        <p className="font-mono text-[11px] text-slate-300 mt-2 flex items-start gap-1.5">
          <CircleAlert size={12} strokeWidth={2} aria-hidden className="text-red-400 shrink-0 mt-0.5" />
          <span className="break-all">{pivotError.msg}</span>
        </p>
      )}
      <div className="mt-3 border-t border-white/[0.06] pt-2">
        <div className="font-mono text-[11px] uppercase tracking-widest text-slate-400 mb-1">relations ({rows.length})</div>
        {rows.length ? (
          <ul className="divide-y divide-white/[0.04] font-mono text-[11px] text-slate-300">
            {rows.map((r, i) => (
              <li key={`${r.edge}-${i}`} className="py-1 grid grid-cols-[auto_1fr_auto] gap-x-2 items-baseline">
                <span className="text-slate-400 uppercase text-[10px]">{edgeLabel(r.edge)}</span>
                <span className="text-slate-300 truncate" title={r.via}>{viaLabel(r.edge, r.via)}</span>
                <span className="tabular-nums text-right"><span className="text-slate-200">{weightLabel(r.weight)}</span> · {r.last_seen || r.first_seen ? formatDay(r.last_seen ?? r.first_seen ?? '') : 'no date'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-[11px] text-slate-400">None in this dossier.</p>
        )}
      </div>
    </section>
  )
}

/** Label/value dossier row (footprint card): scans top-to-bottom, empty fields drop. */
const IdRow = ({ label, value }: { label: string; value?: string | null }) => (
  value ? (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-white/[0.04] last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 shrink-0">{label}</span>
      <span className="font-mono text-[13px] text-slate-100 text-right break-all min-w-0">{value}</span>
    </div>
  ) : null
)

/** The dossier, in the contract order: verdict → raw intelligence + footprint
 *  → normalized analysis (behavior/calendar/relations) → AI summary last, raw
 *  JSON receded beneath it. Bands reveal in DOM order via the cockpit variants. */
function ReportView({
  d, graph, expandingKey, pivotError, refreshing, onExpand, onCollapse, onRefresh, onNavigate,
}: {
  d: Dossier
  graph: GraphState | null
  expandingKey: string | null
  pivotError: { key: string; msg: string } | null
  refreshing: boolean
  onExpand: (type: IndicatorType, value: string) => void
  onCollapse: (depth: number) => void
  onRefresh: () => void
  onNavigate: (value: string) => void
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const b = d.behavior
  const behaviorEmpty = !(b && (b.ports?.length || b.tags?.length || b.first_seen || b.last_seen))
  const relsEmpty = !(d.relations?.length)
  return (
    // ponytail: rows below are the hard-coded cockpit — upgrade path is a
    // user-configurable panel toggle set, add when operators ask to hide panels.
    <motion.div
      variants={cockpitContainer} initial="hidden" animate="show"
      className="space-y-2 w-full max-w-[1400px]"
    >
      <motion.div variants={cockpitBand}><VerdictBanner d={d} refreshing={refreshing} onRefresh={onRefresh} /></motion.div>

      <motion.div variants={cockpitBand}><FootprintBand d={d} /></motion.div>

      {/* Threat Trace: persistent campaign-cluster preview (hidden while the
          graph has nothing on this indicator — honest, grows with usage). */}
      <TraceCluster q={d.query.value} onNavigate={onNavigate} />

      {!behaviorEmpty && (
        <motion.div variants={cockpitBand} className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
          <div className="glass-card rounded-xl p-3 lg:col-span-5"><BehaviorSection d={d} /></div>
          {(d.timeline?.length ?? 0) > 0 && (
            <div className="glass-card rounded-xl p-3 lg:col-span-4"><ActivityCalendar timeline={d.timeline!} /></div>
          )}
          {(d.timeline?.length ?? 0) > 0 && (
            <div className="glass-card rounded-xl p-3 lg:col-span-3"><TimelineStrip timeline={d.timeline ?? []} /></div>
          )}
        </motion.div>
      )}

      {/* Relations band mounts unconditionally: the inspector always has the
          root to show, and the graph carries its honest no-relations line. */}
      <motion.div variants={cockpitBand} className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
        <section className="glass-card rounded-xl p-3 lg:col-span-8" aria-label="Trace network">
          <div className="eyebrow mb-2">Trace network · {d.relations?.length ?? 0}</div>
          {graph && graph.pivotStack.length > 1 && <PivotBreadcrumb graph={graph} onCollapse={onCollapse} />}
          {relsEmpty ? (
            <div className="flex items-center justify-center gap-3 py-10">
              <CircleDashed size={24} strokeWidth={1.5} aria-hidden className="text-slate-400 shrink-0" />
              <p className="font-mono text-[12px] text-slate-300">No relations reported for this indicator.</p>
            </div>
          ) : graph ? (
            <TraceGraph graph={graph} onPivot={onExpand} expandingKey={expandingKey} selectedKey={selectedKey} onSelectNode={setSelectedKey} />
          ) : null}
          {!relsEmpty && (
            <div className="mt-3 border-t border-white/[0.06] pt-2">
              <RelationsTable relations={d.relations ?? []} selectedKey={selectedKey} onSelect={setSelectedKey} />
            </div>
          )}
        </section>
        <div className="lg:col-span-4">
          <NodeInspector d={d} graph={graph} selectedKey={selectedKey} pivotError={pivotError} expandingKey={expandingKey} onSelect={setSelectedKey} onExpand={onExpand} />
        </div>
      </motion.div>

      {behaviorEmpty && relsEmpty && (
        <motion.div variants={cockpitBand} className="glass-card rounded-xl p-3 flex items-center justify-center gap-3">
          <CircleDashed size={24} strokeWidth={1.5} aria-hidden className="text-slate-400 shrink-0" />
          <p className="font-mono text-[12px] text-slate-300">No behavior or relation data for this indicator.</p>
        </motion.div>
      )}

      {/* AI summary last, over the intelligence above it. */}
      <motion.div variants={cockpitBand}><NarrativeSection d={d} /></motion.div>

      {(d.evidence?.length ?? 0) > 0 && (
        <motion.div variants={cockpitBand} className="glass-card rounded-xl p-3"><EvidenceAccordion d={d} /></motion.div>
      )}
    </motion.div>
  )
}

/** Breadcrumb strip above the graph: root › pivot › pivot… click to collapse. */
function PivotBreadcrumb({ graph, onCollapse }: { graph: GraphState; onCollapse: (depth: number) => void }) {
  return (
    <nav className="flex items-center gap-1 text-xs font-mono text-slate-300 mb-2 overflow-x-auto" aria-label="Pivot trail">
      {graph.pivotStack.map((key, i) => {
        const v = key.slice(key.indexOf(':') + 1)
        const label = v.length > 24 ? v.slice(0, 24) + '…' : v
        const last = i === graph.pivotStack.length - 1
        return (
          <span key={`${key}-${i}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span aria-hidden className="text-slate-400">›</span>}
            {last
              ? <span aria-current="page" className="text-white truncate max-w-32">{label}</span>
              : <button onClick={() => onCollapse(i)} className="hover:text-white transition-colors truncate max-w-32">{label}</button>}
          </span>
        )
      })}
    </nav>
  )
}

function NonRoutable({ d }: { d: Dossier }) {
  // KV may still hold a pre-trial cached note with an em-dash; normalize at read.
  const note = (d.note || 'This address is private or reserved. It cannot be investigated.').replace(/\s—\s/g, ', ')
  return (
    <div className="glass-card rounded-2xl p-8 text-center max-w-md mx-auto">
      <div className="flex justify-center mb-3 text-slate-300"><CircleSlash size={24} strokeWidth={1.5} aria-hidden /></div>
      <div className="font-mono text-sm text-slate-200 mb-2 break-all">{d.query.value}</div>
      <p className="text-sm text-slate-300">{note}</p>
    </div>
  )
}

/** Pro gate shell: one centered glass card for every non-'pro' state. */
const GateCard = ({ children }: { children: ReactNode }) => (
  <div className="glass-card rounded-2xl p-8 text-center max-w-md mx-auto">
    {children}
  </div>
)

const GateLink = ({ children, href }: { children: ReactNode; href: string }) => (
  <Link
    to={href}
    className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-200 border border-white/15 rounded-full px-5 py-2.5 hover:text-white hover:border-white/30 transition-colors active:scale-[0.98]"
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
  const [params, setParams] = useSearchParams()
  const { status: proStatus, refetch } = usePro()
  const { user, session } = useAuth()
  const q = params.get('q')?.trim() || ''
  const wantsRefresh = params.get('refresh') === '1'
  // Re-submitting the identical q bumps `attempt` instead of being a no-op —
  // the hook refetches on nonce change so "search again" is always a live query.
  const [attempt, setAttempt] = useState(0)
  const { dossier, loading, error } = useInvestigation(q || null, wantsRefresh, attempt)
  const [term, setTerm] = useState(q)
  // Route key is pathname-only, so q changes don't remount — keep the box in
  // sync with the URL (pivots from Task 6, back/forward).
  useEffect(() => setTerm(q), [q])

  // Live type detection: the chip tells you what we WILL look up before you commit.
  const trimmed = term.trim()
  const detected = useMemo(() => (trimmed ? sniffType(trimmed) : null), [trimmed])
  const defanged = trimmed ? hasDefangMarks(trimmed) && !!detected : false

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = term.trim()
    if (!v || !sniffType(v)) return
    const norm = refang(v).toLowerCase()
    if (norm === q) { setAttempt((n) => n + 1); pushCrumb(norm); return }
    pushCrumb(norm)
    navigate(`/investigate?q=${encodeURIComponent(norm)}`)
  }

  // Crumb = sessionStorage value trail (survives the new in-graph pivots too).
  // Functional update so async callers (expandNode) never see stale state.
  const [crumbs, setCrumbs] = useState<string[]>(() => {
    try { const x = JSON.parse(sessionStorage.getItem('inv:crumbs') || '[]'); return Array.isArray(x) ? x : [] } catch { return [] }
  })
  const pushCrumb = useCallback((value: string) => {
    setCrumbs((prev) => {
      const next = [...prev.filter((c) => c !== value), value].slice(-6)
      sessionStorage.setItem('inv:crumbs', JSON.stringify(next))
      return next
    })
  }, [])

  // --- In-graph expansion (Task D) -----------------------------------------
  // graphRef is the single source of truth read/written from async code
  // (amendment #9: never touch graphState inside closures). setGraphState only
  // receives pre-computed values, so stale-closure clobbering can't happen.
  const [graphState, setGraphState] = useState<GraphState | null>(null)
  const graphRef = useRef<GraphState | null>(null)
  const [expandingNode, setExpandingNode] = useState<string | null>(null)
  const [pivotError, setPivotError] = useState<{ key: string; msg: string } | null>(null) // U6: failed pivots must not be a dead click
  const busyRef = useRef(false)
  // Generation counter: an expansion that resolves after a new dossier landed
  // must not commit into the fresh graph or touch the URL (cross-dossier leak).
  const genRef = useRef(0)

  /** Fetch the node's dossier and merge its relations in as the next ring.
   *  No-op while another expansion is in flight (keeps rl_inv headroom).
   *  `push=false` replaces the URL instead of adding history (restore loop).
   *  Defined before the rebuild effect because the restore loop calls it. */
  const expandNode = useCallback(async (type: IndicatorType, value: string, push = true) => {
    const cur = graphRef.current
    if (!cur || busyRef.current) return
    const key = nodeKey(type, value)
    const node = cur.nodes.get(key)
    if (!node || node.expanded || node.ring >= MAX_RINGS) return
    busyRef.current = true
    setExpandingNode(key)
    setPivotError(null)
    const gen = genRef.current
    try {
      const r = await fetchDossier(value, { token: session?.access_token })
      if (gen !== genRef.current) return // a new dossier landed mid-flight — drop it
      if (!r.ok) { setPivotError({ key, msg: `Couldn't expand: ${r.status === 429 ? "rate limited, try again in a minute" : 'upstream failed, try again'}` }); return }
      const pd = r.body as Dossier | null
      if (!pd || !pd.query) { setPivotError({ key, msg: "Couldn't expand: no dossier returned" }); return }
      if (pd.note) { setPivotError({ key, msg: 'Private or reserved address, nothing to expand' }); return }
      const now = graphRef.current!
      // Re-read after the await: a breadcrumb collapse mid-flight prunes this
      // node — committing at the stale ring would orphan edges and mis-depth.
      const cur = now.nodes.get(key)
      if (!cur) return
      let next = mergeRelationsIntoGraph(now, pd.relations ?? [], key, cur.ring + 1)
      const fresh = next.nodes.get(key)
      if (fresh) next.nodes.set(key, { ...fresh, expanded: true, malicious: (pd.verdict?.malicious_by ?? 0) > 0, mal_by: pd.verdict?.malicious_by, engines: pd.verdict?.total_engines })
      next = { ...next, pivotStack: [...next.pivotStack, key] }
      graphRef.current = next
      setGraphState(next)
      syncPivotsParam(next.pivotStack, push)
      pushCrumb(value) // keep the sessionStorage trail current for back-nav affordance
    } catch {
      if (gen !== genRef.current) return
      // graph simply doesn't grow, but the inspector says why (U6)
      setPivotError({ key, msg: "Couldn't expand: network error, try again" })
    } finally {
      busyRef.current = false
      setExpandingNode(null)
    }
  }, [session?.access_token, pushCrumb])

  // (Re)build the graph from the root dossier — and restore any ?pivots= trail.
  useEffect(() => {
    genRef.current++
    setPivotError(null)
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
          // Wait out any in-flight expansion (a StrictMode double-run keeps the
          // first run's busy flag held until its fetch resolves and the gen
          // guard drops it — a no-op early-return would strand the trail).
          while (busyRef.current) { await new Promise((r) => setTimeout(r, 50)); if (cancelled) return }
          const sep = key.indexOf(':')
          // replace, not push: restoring a shared link shouldn't add 7 back-stops
          await expandNode(key.slice(0, sep) as IndicatorType, key.slice(sep + 1), false)
        }
      })()
      return () => { cancelled = true }
    }
  }, [dossier]) // params + expandNode read at effect time only; expandNode identity must not rebuild the root graph

  const syncPivotsParam = (stack: string[], push: boolean) => {
    const next = new URLSearchParams(window.location.search)
    if (stack.length > 1) next.set('pivots', serializePivotStack(stack))
    else next.delete('pivots')
    // Router owns history (raw pushState desynced useSearchParams from the URL).
    setParams(next, { replace: !push })
  }

  /** Breadcrumb click: drop everything deeper than `depth`. The URL must follow
   *  (replace) or a reload/share replays the collapsed-away pivots. */
  const collapseToDepth = useCallback((depth: number) => {
    const cur = graphRef.current
    if (!cur) return
    const next = collapseGraph(cur, depth)
    graphRef.current = next
    setGraphState(next)
    syncPivotsParam(next.pivotStack, false)
  }, []) // syncPivotsParam reads only setParams/URLSearchParams; stable enough

  // Back/forward: when the URL trail shrinks below the on-screen graph (and it
  // is a prefix of it), replay the collapse so view and URL agree. Growing
  // forward needs refetches and is left to the pivot links themselves.
  useEffect(() => {
    const cur = graphRef.current
    if (!cur) return
    const urlStack = deserializePivotStack(params.get('pivots') ?? '')
    if (urlStack.length >= 1 && urlStack.length < cur.pivotStack.length &&
        cur.pivotStack.slice(0, urlStack.length).every((k, i) => k === urlStack[i])) {
      const next = collapseGraph(cur, urlStack.length - 1)
      graphRef.current = next
      setGraphState(next)
    }
  }, [params])

  // Force-refresh drops the server cache for this indicator (1/IP/hour; the
  // endpoint serves the cached copy with refresh_blocked when it's used up).
  const onRefresh = () => navigate(`/investigate?q=${encodeURIComponent(q)}&refresh=1`)

  // ?refresh=1 is a command, not state: strip it once the result settles so
  // reload/Back don't re-issue (or mis-cooldown) the refresh.
  useEffect(() => {
    if (!wantsRefresh || loading) return
    if (!dossier && !error) return
    const next = new URLSearchParams(window.location.search)
    next.delete('refresh')
    navigate(`/investigate?${next.toString()}`, { replace: true })
  }, [wantsRefresh, loading, dossier, error, navigate])

  // Keep the last successful dossier for the CURRENT query on screen while a
  // re-run is in flight: refreshing must not destroy the report you're
  // refreshing. A new q (or an error) falls through to the console instead.
  // Compare against the REFANGED q — a shared ?q=evil[.]com is what the server
  // normalized to 'evil.com', and a raw compare would blank the report.
  const shown = q && dossier && !error && nodeKey(dossier.query.type, dossier.query.value) === nodeKey(dossier.query.type, refang(q).toLowerCase()) ? dossier : null
  const hasReport = !!(shown && !shown.note)

  const search = (
    <form onSubmit={submit} className={`no-print max-w-xl mx-auto ${hasReport ? 'mb-3' : 'mb-6'}`}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="8.8.8.8 · evil.example.com · e3b0c442…"
            aria-label="Indicator to investigate"
            spellCheck={false}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4 font-mono text-lg text-white caret-red-500 placeholder:text-slate-400 focus:border-red-500/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40"
          />
          {/* live type chip: what the server will actually look up */}
          {trimmed && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {detected ? <Chip tone="neutral">{TYPE_LABEL[detected]}</Chip> : <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">not recognized</span>}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!!trimmed && !detected}
          className="shrink-0 self-stretch rounded-xl px-5 font-mono text-[11px] uppercase tracking-[0.2em] font-bold text-white bg-red-600 hover:bg-red-500 active:scale-[0.98] transition-colors disabled:opacity-40 disabled:hover:bg-red-600"
        >
          Investigate
        </button>
      </div>
      {defanged && (
        <p className="mt-1.5 font-mono text-[10px] text-slate-400">
          defanged input · looking up <span className="text-slate-200">{refang(trimmed).toLowerCase()}</span>
        </p>
      )}
    </form>
  )

  // Pro gate. FREE_TRIAL opens Deep Investigation to everyone for pre-launch
  // testing; the paywall code below stays for the flip back to paid Pro.
  if (proStatus !== 'pro' && !FREE_TRIAL) {
    return (
      <IsoPageShell>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl mb-8 text-center"
        >
          <div className="eyebrow mb-6">Deep Investigation</div>
        </motion.div>
        {proStatus === 'checking' && (
          <div className="space-y-4 max-w-md mx-auto" aria-busy="true">
            <div className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-2/3 mx-auto rounded-xl bg-white/[0.04] animate-pulse" style={{ animationDelay: '60ms' }} />
            <div className="h-4 w-1/2 mx-auto rounded-xl bg-white/[0.04] animate-pulse" style={{ animationDelay: '120ms' }} />
          </div>
        )}
        {proStatus === 'not-pro' && (
          <GateCard>
            <h2 className="text-2xl font-extrabold tracking-tight text-white mb-3"><Lock size={16} aria-hidden className="inline-block mr-2 -mt-1" />A Pro feature</h2>
            <p className="text-sm text-slate-300 mb-2">
              Trace everything an IP, domain, URL or hash touched. 12 intel sources,
              a weighted verdict, an AI analyst summary and a shareable dossier.
            </p>
            <p className="text-sm text-slate-300 mb-6">
              Pro is on manual onboarding right now:{' '}
              <a
                href="mailto:threatbasepro@gmail.com"
                className="text-red-400 hover:text-red-300 underline underline-offset-2 break-all"
              >
                Email threatbasepro@gmail.com
              </a>{' '}
              to unlock it.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <GateLink href="/pricing">See pricing</GateLink>
            </div>
            {!user && (
              <p className="text-xs text-slate-400 mt-4">Sign in first (top right) to check your access.</p>
            )}
          </GateCard>
        )}
        {proStatus === 'signed-out' && (
          <GateCard>
            <h2 className="text-2xl font-extrabold tracking-tight text-white mb-3">Sign in to check your access</h2>
            <p className="text-sm text-slate-300 mb-6">
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
            <div className="flex justify-center mb-3 text-red-400"><TriangleAlert size={24} strokeWidth={1.5} aria-hidden /></div>
            <h2 className="text-xl font-extrabold tracking-tight text-white mb-3">
              Couldn&rsquo;t verify your access. Check your connection.
            </h2>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white bg-red-600 hover:bg-red-500 rounded-full px-5 py-2.5 transition-colors active:scale-[0.98]"
            >
              <RefreshCw size={12} aria-hidden /> Retry
            </button>
          </GateCard>
        )}
      </IsoPageShell>
    )
  }

  return (
    <IsoPageShell>
      {/* Cockpit mode: with a dossier on screen the hero collapses to a
          one-line header so the dense grid starts at the top of the viewport. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className={`no-print mx-auto text-center ${hasReport ? 'max-w-3xl mb-4' : 'max-w-3xl mb-8'}`}
      >
        {hasReport ? (
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <span className="eyebrow">Deep Investigation</span>
            <span className="font-mono text-sm text-slate-200 break-all">{q}</span>
            {FREE_TRIAL && <Chip tone="neutral">free trial</Chip>}
          </div>
        ) : (
          <>
            <div className="eyebrow mb-6">Deep Investigation</div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter text-white mb-6">
              Everything it <span className="text-liquid-red">touched</span>.
            </h1>
            {FREE_TRIAL && (
              <p className="text-sm text-slate-300 -mt-3 mb-2">
                Free trial for everyone while we improve · <Link to="/pricing" className="text-red-400 hover:text-red-300 underline underline-offset-2">Pro is coming</Link>
              </p>
            )}
          </>
        )}
      </motion.div>

      {search}

      {!q && (
        <p className="text-center text-slate-400 text-sm font-mono">
          Paste an IP, domain, URL or hash. Defanged input like hxxp:// or evil[.]com is fixed automatically.
        </p>
      )}

      <AnimatePresence mode="wait">
        {q && loading && !shown && (
          <motion.div key="console" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
            <InvestigationConsole q={q} />
          </motion.div>
        )}

        {q && !loading && error && (
          <motion.div
            key="error" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass-card rounded-2xl p-6 text-center max-w-md mx-auto border border-red-500/20"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400 mb-2 inline-flex items-center gap-1.5 justify-center"><CircleAlert size={12} strokeWidth={2} aria-hidden />Investigation failed</div>
            <p className="text-sm text-slate-300 break-words">{error}</p>
            <button
              type="button"
              onClick={() => {
                const v = (term || q).trim()
                const norm = refang(v).toLowerCase()
                if (norm === q) setAttempt((n) => n + 1)
                else navigate(`/investigate?q=${encodeURIComponent(norm)}`)
              }}
              className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white bg-red-600 hover:bg-red-500 rounded-full px-5 py-2.5 transition-colors active:scale-[0.98]"
            >
              <RefreshCw size={12} aria-hidden /> Retry
            </button>
          </motion.div>
        )}

        {shown && (
          <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {shown.note ? <NonRoutable d={shown} /> : (
              // key by the indicator: a new q remounts the cockpit and drops the
              // selectedKey (row 4/inspector selection belongs to the old dossier)
              <ReportView key={shown.query.value} d={shown} graph={graphState} expandingKey={expandingNode} pivotError={pivotError} refreshing={loading} onExpand={expandNode} onCollapse={collapseToDepth} onRefresh={onRefresh} onNavigate={(v) => navigate(`/investigate?q=${encodeURIComponent(v)}`)} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
