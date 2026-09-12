/** Dense relations table (Task F cockpit row 4) — every relation, not top-N,
 *  with client-side sort + filter and selection synced to the trace graph.
 *  Sort/filter/inspector logic is pure + exported for unit tests. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Relation } from '@/investigationTypes'
import { nodeKey, type GraphNode } from './traceState'
import { IocLink } from './IocLink'
import { Chip } from './states'
import { edgeLabel, viaLabel, weightLabel } from './labels'
import { formatAgo, formatDay } from './formatRelative'

export type SortKey = 'type' | 'value' | 'edge' | 'via' | 'weight' | 'first_seen' | 'last_seen' | 'verdict'

const lc = (v: string | undefined | null) => (v ?? '').toLowerCase()

/** Sort by any column; weight + verdict numeric-ish, the rest string compare.
 *  Ties fall back to value so ordering is deterministic for keyboard nav. */
export function sortRelations(rows: Relation[], key: SortKey, dir: 'asc' | 'desc' = 'desc'): Relation[] {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let c: number
    if (key === 'weight') c = a.weight - b.weight
    else if (key === 'verdict') c = (a.malicious === true ? 1 : 0) - (b.malicious === true ? 1 : 0)
    else c = lc(a[key]).localeCompare(lc(b[key]))
    return c * m || lc(a.value).localeCompare(lc(b.value))
  })
}

/** Substring match on value / type / edge / via — empty query returns all. */
export function filterRelations(rows: Relation[], query: string): Relation[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => [r.value, r.type, r.edge, r.via ?? ''].some((f) => f.toLowerCase().includes(q)))
}

/** Inspector projection (pure): the selected node plus its full row set from
 *  the relations table plus its verdict part. A node with no fetched
 *  sub-dossier still renders its graph + relation-row fields — never an
 *  empty panel. */
export function inspectNode(node: GraphNode | null, relations: Relation[]) {
  if (!node) return { node: null, rows: [] as Relation[], verdict: null as string | null }
  const rows = relations.filter((r) => r.type === node.type && lc(r.value) === lc(node.value))
  const verdict = typeof node.mal_by === 'number' ? `${node.mal_by}/${node.engines ?? 0} sources flag it` : null
  return { node, rows, verdict }
}

const COLS: { key: SortKey; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'value', label: 'Value' },
  { key: 'edge', label: 'Edge' },
  { key: 'via', label: 'Via' },
  { key: 'weight', label: 'Strength' },
  { key: 'first_seen', label: 'First' },
  { key: 'last_seen', label: 'Last' },
  { key: 'verdict', label: 'Verdict' },
]

export default function RelationsTable({
  relations, selectedKey, onSelect,
}: {
  relations: Relation[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'weight', dir: 'desc' })
  const rows = useMemo(() => sortRelations(filterRelations(relations ?? [], q), sort.key, sort.dir), [relations, q, sort])
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  // Arrow-key selection moves through the *visible* rows; the shared selectedKey
  // highlights the matching graph node too (and vice versa via scrollIntoView).
  const keys = rows.map((r) => nodeKey(r.type, r.value))
  const selIdx = selectedKey ? keys.indexOf(selectedKey) : -1
  useEffect(() => {
    if (!selectedKey) return
    const el = bodyRef.current?.querySelector(`[data-k="${selectedKey.replace(/"/g, '\\"')}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedKey, rows])

  const move = (delta: number) => {
    if (!rows.length) return
    const next = selIdx < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, selIdx + delta))
    if (keys[next] !== selectedKey) {
      onSelect(keys[next])
      // follow the highlight with DOM focus so Tab continues from the new row
      bodyRef.current?.querySelector<HTMLElement>(`[data-k="${keys[next].replace(/"/g, '\\"')}"]`)?.focus()
    }
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  return (
    <div onKeyDown={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    }}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter relations…"
          aria-label="Filter relations"
          spellCheck={false}
          className="bg-white/[0.03] border border-white/10 rounded-md px-2.5 py-1 font-mono text-[12px] text-slate-200 caret-red-500 placeholder:text-slate-400 focus:border-red-500/40 w-52"
        />
        <span className="font-mono text-[10px] text-slate-400 tabular-nums" role="status">
          {rows.length} of {relations?.length ?? 0} relations · use arrow keys to select
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-white/[0.06]">
        <table role="grid" className="w-full text-left text-[12px]">
          <thead className="text-slate-400 uppercase text-[10px] tracking-wider bg-white/[0.02]">
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className="px-2 py-1.5 font-semibold" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button type="button" onClick={() => toggleSort(c.key)} className="hover:text-slate-200 transition-colors inline-flex items-center gap-1">
                    {c.label}
                    <span aria-hidden className="text-red-400 w-2.5 inline-flex">
                      {sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={10} strokeWidth={2.5} /> : <ArrowDown size={10} strokeWidth={2.5} />) : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef} className="text-slate-200 divide-y divide-white/[0.04]">
            {rows.map((r, i) => {
              const k = nodeKey(r.type, r.value)
              const sel = k === selectedKey
              return (
                <tr
                  key={k + i} data-k={k} tabIndex={selIdx < 0 && i === 0 ? 0 : sel ? 0 : -1}
                  aria-selected={sel}
                  onClick={() => onSelect(k)}
                  className={`cursor-pointer ${sel ? 'bg-red-500/10 outline outline-1 -outline-offset-1 outline-red-500/40' : 'hover:bg-white/[0.03]'}`}
                >
                  <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">{r.type.toUpperCase()}</td>
                  <td className="px-2 py-1.5 break-all max-w-[300px]"><IocLink value={r.value} className="text-[12px]">{r.value}</IocLink></td>
                  <td className="px-2 py-1.5 text-slate-300">{edgeLabel(r.edge)}</td>
                  <td className="px-2 py-1.5 text-slate-400 max-w-[180px] truncate" title={r.via ?? undefined}>{viaLabel(r.edge, r.via)}</td>
                  <td className="px-2 py-1.5">
                    <Chip tone={r.weight >= 4 ? 'red' : 'neutral'} className="normal-case">
                      <span title={`${r.weight} corroborating links`}>{weightLabel(r.weight)}</span>
                    </Chip>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-slate-400">
                    {r.first_seen ? <time dateTime={r.first_seen}>{formatDay(r.first_seen)}</time> : 'never'}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-slate-300">
                    {r.last_seen ? <time dateTime={r.last_seen} title={formatDay(r.last_seen)}>{formatAgo(r.last_seen)}</time> : 'never'}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.malicious === true ? (
                      <span className="text-red-400 font-medium">flagged</span>
                    ) : r.malicious === false ? (
                      <span className="text-emerald-400/90">clean</span>
                    ) : (
                      <span className="text-slate-400">no opinion</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-2 py-3 text-slate-400 text-center">No relations {q ? 'match the filter.' : 'reported.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
