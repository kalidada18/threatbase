import { CircleAlert, CircleDashed, Minus, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { SourceResult } from '@/investigationTypes'
import { labelSource } from './labels'

export type RosterState = 'pending' | 'flags' | 'clean' | 'skipped' | 'failed'

export type RosterTile = { key: string; name: string; state: RosterState; detail?: string }

/** Fan-out order in functions/api/investigate/index.ts. The console shows
 *  these while a fresh investigation runs; the settled roster is derived from
 *  d.evidence (never this const) so truth wins over theater. Note: the onsite
 *  adapter's results carry source:'threatbase' (not 'onsite') — this rank key
 *  must match what evidence rows actually say. */
export const FANOUT_ORDER = ['threatbase', 'otx', 'geo', 'rdap', 'shodan', 'virustotal', 'malwarebazaar', 'feodo', 'urlhaus', 'greynoise', 'spamhaus', 'ripestat']

/** evidence[] → settled tiles in fan-out order (unknown extra sources appended).
 *  States are derived ONLY from evidence rows: a source 'flags' when its
 *  trimmed data carries a malicious part, else 'clean'. No theater. */
export function buildRoster(evidence: SourceResult[] | undefined): RosterTile[] {
  if (!evidence?.length) return []
  const tiles: RosterTile[] = evidence.map((s) => {
    let state: RosterState
    let detail: string | undefined
    if (!s.ok) {
      state = s.skipped ? 'skipped' : 'failed'
      if (!s.skipped && s.error) detail = s.error
    } else {
      const parts = (s.data as { parts?: { malicious?: boolean }[] } | undefined)?.parts
      state = parts?.some((p) => p.malicious === true) ? 'flags' : 'clean'
    }
    return { key: s.source, name: labelSource(s.source), state, detail }
  })
  const rank = new Map(FANOUT_ORDER.map((k, i) => [k, i]))
  return tiles.sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99))
}

const TILE_STATE: Record<RosterState, { cls: string; label: string }> = {
  pending: { cls: 'text-slate-400 border-white/10 bg-white/[0.02]', label: 'querying' },
  flags: { cls: 'text-red-200 border-red-500/30 bg-red-500/10', label: 'flagged' },
  clean: { cls: 'text-emerald-200/90 border-emerald-500/25 bg-emerald-500/5', label: 'responded' },
  skipped: { cls: 'text-slate-400 border-white/10 bg-white/[0.02]', label: 'not applicable' },
  failed: { cls: 'text-red-300/80 border-red-500/25 bg-red-500/5', label: 'failed' },
}

function TileIcon({ state }: { state: RosterState }) {
  if (state === 'flags') return <ShieldAlert size={11} strokeWidth={2} aria-hidden className="text-red-400 shrink-0" />
  if (state === 'clean') return <ShieldCheck size={11} strokeWidth={2} aria-hidden className="text-emerald-400 shrink-0" />
  if (state === 'skipped') return <Minus size={11} strokeWidth={2} aria-hidden className="text-slate-400 shrink-0" />
  if (state === 'failed') return <CircleAlert size={11} strokeWidth={2} aria-hidden className="text-red-400 shrink-0" />
  return <CircleDashed size={11} strokeWidth={2} aria-hidden className="text-slate-400 shrink-0 animate-pulse" />
}

/** One per-source tile: vendor name + honest state. Shared by the loading
 *  console (pending tiles) and the footprint band (settled tiles). */
export function SourceTile({ tile }: { tile: RosterTile }) {
  const s = TILE_STATE[tile.state]
  return (
    <span title={tile.detail ? `${s.label} · ${tile.detail}` : undefined}
      className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide ${s.cls}`}>
      <TileIcon state={tile.state} />
      <span className="truncate max-w-[120px]" title={tile.name}>{tile.name}</span>
      <span className="uppercase tracking-wider text-[9px] opacity-80">{s.label}</span>
    </span>
  )
}
