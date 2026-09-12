/** GET /api/trace?q=<indicator> — Threat Trace cluster read: the 2-hop
 *  neighborhood of the indicator in the persistent campaign graph fed by every
 *  investigation. Shareable by design (/trace?q=...). Free-trial posture
 *  mirrors /investigate (FREE_TRIAL const); rl_inv-style guard: own bucket. */
import { sniffType, refang, takeRateToken } from '../investigate/_lib'
import { neighborhood } from '../investigate/_trace'
import { proStatus } from '../_pro'
import { json } from '../_common'

const FREE_TRIAL = true // flip with the investigate twin when Pro goes paid

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const u = new URL(request.url)
  const q = (u.searchParams.get('q') || '').trim()
  const type = sniffType(q)
  if (!type) return json({ error: 'unrecognized indicator' }, 400, request)
  const value = refang(q).toLowerCase()
  const pro = await proStatus(request, env)
  if (pro !== 'pro' && !FREE_TRIAL) {
    return json({ error: pro === 'not-pro' ? 'pro_required' : pro === 'no-auth' ? 'sign_in_required' : 'pro_check_unavailable' }, pro === 'not-pro' ? 403 : pro === 'no-auth' ? 401 : 503, request)
  }
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  if (!takeRateToken(ip)) return json({ error: 'too many traces, retry in a minute' }, 429, request)

  const seedKey = `${type}:${value}`
  const one = await neighborhood(seedKey, env)
  // 2-hop: expand the strongest hop-1 nodes (cap 8 fan-outs — graph fuel is cheap, Postgres is not)
  const expand = one.slice(0, 8)
  const two = await Promise.all(expand.map((e: any) => neighborhood(e.a_key === seedKey ? e.b_key : e.a_key, env, 40)))
  const byPair = new Map<string, any>()
  for (const e of [...one, ...two.flat()]) {
    const k = `${e.a_key}|${e.b_key}|${e.edge}|${e.via ?? ''}`
    const prev = byPair.get(k)
    if (!prev || e.weight > prev.weight) byPair.set(k, e)
  }
  const edges = [...byPair.values()]
    .sort((a, b) => b.weight - a.weight || String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')))
    .slice(0, 120)
  const nodes = new Map<string, { key: string; type: string; value: string; degree: number; weight: number; last_seen: string | null }>()
  for (const e of edges) {
    for (const side of ['a', 'b'] as const) {
      const key = e[`${side}_key`]
      const cur = nodes.get(key) || { key, type: e[`${side}_type`], value: e[`${side}_value`], degree: 0, weight: 0, last_seen: null }
      cur.degree++
      cur.weight = Math.max(cur.weight, e.weight)
      if (e.last_seen && (!cur.last_seen || e.last_seen > cur.last_seen)) cur.last_seen = e.last_seen
      nodes.set(key, cur)
    }
  }
  return json({
    query: { type, value },
    present: edges.length > 0,
    nodes: [...nodes.values()].sort((a, b) => b.weight - a.weight).slice(0, 60),
    edges: edges.map((e) => ({ from: e.a_key, to: e.b_key, edge: e.edge, via: e.via, weight: e.weight, first_seen: e.first_seen, last_seen: e.last_seen, sources: e.sources })),
  }, 200, request)
}
