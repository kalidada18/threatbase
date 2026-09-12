/** Threat Trace write-path: every fresh dossier's relations are upserted into
 *  the persistent campaign graph (public.trace_edges, Supabase). Called
 *  fire-and-forget from the investigate handler — a trace write must NEVER
 *  delay or fail the dossier response. Node keys use the nodeKey canon
 *  (type:value lowercased) shared with the cockpit graph (traceState.ts).
 *  Merge policy (min first_seen / max last_seen / union sources) lives in the
 *  upsert_trace_edge SQL function, so this file just maps rows to args. */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../../src/lib/supabaseConfig'
import type { Dossier, Relation } from './_lib'

const keyOf = (type: string, value: string) => `${type}:${value.toLowerCase()}`
const day = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null)

export async function recordTrace(d: Dossier, env: any): Promise<void> {
  const url = env.SUPABASE_URL || SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return // local dev without service key: graph stays as-is
  const root = keyOf(d.query.type, d.query.value)
  const rows = (d.relations ?? []).map((r: Relation) => ({
    a_key: root, b_key: keyOf(r.type, r.value),
    a_type: d.query.type, a_value: d.query.value,
    b_type: r.type, b_value: r.value,
    edge: r.edge, via: r.via ?? null, weight: r.weight,
    first_seen: day(r.first_seen), last_seen: day(r.last_seen), source: r.via ?? 'investigate',
  }))
  if (!rows.length) return
  try {
    const admin = createClient(url, key)
    // Per-row RPC: the merge (GREATEST weight / LEAST first / union sources) is
    // SQL-side in upsert_trace_edge; REST upsert would overwrite instead.
    // allSettled + fire-and-forget caller bound the cost to this fan-out.
    await Promise.allSettled(rows.map((r) =>
      admin.rpc('upsert_trace_edge', {
        p_a_key: r.a_key, p_b_key: r.b_key, p_a_type: r.a_type, p_a_value: r.a_value,
        p_b_type: r.b_type, p_b_value: r.b_value, p_edge: r.edge, p_via: r.via,
        p_weight: r.weight, p_first_seen: r.first_seen, p_last_seen: r.last_seen, p_source: r.source,
      })))
  } catch { /* trace is best-effort */ }
}

/** 2-hop neighborhood read for /api/trace. Returns raw rows; the endpoint
 *  assembles nodes/edges. [] on any failure — the trace degrades to "unknown". */
export async function neighborhood(seed: string, env: any, limit = 80): Promise<any[]> {
  const url = env.SUPABASE_URL || SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return []
  try {
    const admin = createClient(url, key)
    const { data, error } = await admin.rpc('trace_neighborhood', { p_seed: seed, p_limit: limit })
    if (error) return []
    return data ?? []
  } catch { return [] }
}
