import { cacheKey, sanitizeKv, cacheTtl, staleAt, isPublicIp, sniffType, mergeVerdict, rankRelations, buildTimeline, hostingType, trimEvidence, takeRateToken, refreshAllowed, refang, type Dossier, type Relation, type Sighting, type VerdictPart, type SourceResult } from './_lib'
import { geoLookup, rdapLookup } from '../_net'
import { onsite, otxInvestigate, shodanHost, vtReport, bazaar, feodoCheck, urlhausCheck, greynoiseCheck, spamhausCheck, ripestatlookup, narrate } from './_sources'
import { json } from '../_common'
import { proStatus } from '../_pro'

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const u = new URL(request.url)
  const q = (u.searchParams.get('q') || '').trim()
  const type = sniffType(q)
  if (!type) return json({ error: 'unrecognized indicator' }, 400, request)
  // sniffType refangs internally — the value every adapter + cache key uses
  // must be refanged too, or evil[.]com is looked up as the junk string.
  const value = refang(q).toLowerCase()
  if ((type === 'ipv4' || type === 'ipv6') && !isPublicIp(value))
    return json({ query: { type, value }, verdict: { score: 0, malicious_by: 0, total_engines: 0, status: 'clean', confidence: 'low', dominant_source: null }, identity: null, relations: [], narrative: null, note: 'non-routable address — not investigated', cached: false } as unknown as Dossier, 200, request)

  const pro = await proStatus(request, env)
  if (pro !== 'pro') return json({ error: pro === 'not-pro' ? 'pro_required' : pro === 'no-auth' ? 'sign_in_required' : 'pro_check_unavailable' }, pro === 'not-pro' ? 403 : pro === 'no-auth' ? 401 : 503, request)

  const kv = env.IOC_CACHE
  // Public rate limit: 8/min per client IP. In-isolate counter first (B1:
  // KV get-then-put is non-atomic), KV counter as cross-isolate backstop.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  if (!takeRateToken(ip)) return json({ error: 'too many investigations — retry in a minute' }, 429, request)
  const minute = Math.floor(Date.now() / 60000)
  const rl = `rl_inv:${ip}:${minute}`
  if (kv) {
    const n = +(await kv.get(rl)) || 0
    if (n >= 8) return json({ error: 'too many investigations — retry in a minute' }, 429, request)
    await kv.put(rl, String(n + 1), { expirationTtl: 90 })
  }
  // Cache hit? (rl_inv flood posture stays ahead of everything; refresh rides after cacheKey.)
  const key = cacheKey(type, value)
  const wantsRefresh = u.searchParams.get('refresh') === '1'
  if (kv) {
    if (wantsRefresh) {
      // Rate-limit refresh: 1 per IP per indicator per hour (isolate layer B1)
      const refreshKey = `rl_refresh:${sanitizeKv(ip)}:${sanitizeKv(key)}`
      if (!refreshAllowed(refreshKey) || await kv.get(refreshKey)) {
        // Serve cached with a note rather than 429 — less abrasive UX
        const hit = await kv.get(key)
        if (hit) {
          try { const d = JSON.parse(hit); d.cached = true; d.refresh_blocked = true; return json(d, 200, request) }
          catch { /* corrupt KV value — fall through to fresh fan-out */ }
        }
      }
      await kv.put(refreshKey, '1', { expirationTtl: 3600 })
      // Fall through to fresh fan-out — don't read cache
    } else {
      const hit = await kv.get(key)
      if (hit) {
        try { const d = JSON.parse(hit); d.cached = true; return json(d, 200, request) }
        catch { /* corrupt KV value — fall through to fresh fan-out */ }
      }
    }
  }

  const skip = (name: string) => Promise.resolve({ source: name, ok: false, skipped: true } as SourceResult<any>)
  const isIp = type === 'ipv4' || type === 'ipv6'
  const P: SourceResult<any>[] = []
  const settled = await Promise.allSettled([
    onsite(value, fetch),
    env.OTX_API_KEY ? otxInvestigate(type, value, env, fetch) : Promise.resolve({ source: 'otx', ok: false, skipped: true } as SourceResult<any>),
    type === 'ipv4' || type === 'ipv6' ? geoLookup(value).then((g) => ({ source: 'geo', ok: !!g, data: g })) : Promise.resolve({ source: 'geo', ok: false, skipped: true } as SourceResult<any>),
    type === 'ipv4' || type === 'ipv6' || type === 'domain' ? rdapLookup(value, type === 'domain' ? 'domain' : 'ip').then((r) => ({ source: 'rdap', ok: !!r, data: r })) : Promise.resolve({ source: 'rdap', ok: false, skipped: true } as SourceResult<any>),
    type === 'ipv4' || type === 'ipv6' ? shodanHost(value, env, fetch) : Promise.resolve({ source: 'shodan', ok: false, skipped: true } as SourceResult<any>),
    vtReport(type, value, env, fetch),
    type === 'sha256' ? bazaar(value, env, fetch) : Promise.resolve({ source: 'malwarebazaar', ok: false, skipped: true } as SourceResult<any>),
    isIp ? feodoCheck(value, kv, fetch) : skip('feodo'),
    type === 'url' || type === 'domain' || isIp ? urlhausCheck(type, value, fetch) : skip('urlhaus'),
    isIp ? greynoiseCheck(value, env, fetch) : skip('greynoise'),
    type === 'ipv4' ? spamhausCheck(value, kv, fetch) : skip('spamhaus'),
    isIp ? ripestatlookup(value, fetch) : skip('ripestat'),
  ])
  for (const s of settled) P.push(s.status === 'fulfilled' ? s.value : { source: 'unknown', ok: false, error: String(s.reason) })

  const parts: VerdictPart[] = []
  const relations: Relation[] = []
  const sightings: Sighting[] = []
  const identity: Dossier['identity'] = { country: null, country_code: null, city: null, region: null, isp: null, asn: null, reverse_dns: null, registered: null, hosting_type: 'unknown' }
  let ports: any[] = [], onTags: string[] = [], pulses: Dossier['pulses'] = []
  let onRisk: number | undefined, onFeeds: number | undefined
  for (const p of P) {
    if (!p.ok || !p.data) continue
    parts.push(...(p.data.parts ?? []))
    if (typeof p.data.malicious === 'boolean') parts.push({ source: p.source, malicious: p.data.malicious })
    relations.push(...(p.data.relations ?? []))
    sightings.push(...(p.data.sightings ?? []))
    if (p.data.identity) Object.assign(identity, { ...p.data.identity, isp: p.data.identity.isp ?? identity.isp })
    // The geo adapter returns a flat Geo object (no identity key) — lift it here.
    else if (p.source === 'geo') Object.assign(identity, { country: p.data.country, country_code: p.data.country_code, city: p.data.city, region: p.data.region, isp: p.data.isp, asn: p.data.asn })
    // RIPEstat fills ASN/holder where the identity fields are still unset — geo's
    // placeholder nulls don't count (??= would skip them; null is a "no data yet").
    else if (p.source === 'ripestat') { if (identity.asn == null) identity.asn = p.data.asn ?? null; if (identity.isp == null) identity.isp = p.data.holder ?? null }
    if (p.data.ports) ports = p.data.ports
    if (p.data.tags) onTags = [...new Set([...onTags, ...p.data.tags])]
    if (p.data.pulses) pulses = p.data.pulses
    if (p.source === 'threatbase') { onRisk = p.data.risk; onFeeds = p.data.feed_count }
  }
  identity.hosting_type = hostingType(identity.isp)
  const verdict = { ...mergeVerdict(parts), risk: onRisk, feed_count: onFeeds, tags: onTags }
  const seen = sightings.filter((s) => s.date).map((s) => s.date).sort()
  const ttl = cacheTtl(verdict)
  const generated_at = new Date().toISOString()
  const dossier: Dossier = {
    query: { type, value }, generated_at, cached: false, stale_at: staleAt(generated_at, ttl),
    sources_ok: P.filter((p) => p.ok).map((p) => p.source),
    sources_skipped: P.filter((p) => p.skipped).map((p) => p.source),
    sources_failed: P.filter((p) => !p.ok && !p.skipped).map((p) => p.source),
    verdict, identity, behavior: { ports, tags: onTags, first_seen: seen[0] ?? null, last_seen: seen.at(-1) ?? null },
    relations: rankRelations(relations, 40), pulses: pulses.slice(0, 10), timeline: buildTimeline(sightings).slice(-120),
    narrative: null, investigated_by: 1,
    // Task F evidence accordion: trimmed per trimEvidence — rdap stripped to
    // public summary fields (no registrant PII), relations arrays capped at 40.
    evidence: trimEvidence(P),
  }
  if (kv && dossier.sources_ok.length === 0) return json({ error: 'all sources failed' }, 502, request)

  // Narrative rides last and reports its own failure into evidence[] — previously
  // every narrate error was swallowed to null with no trace for the operator.
  const nar = await narrate(dossier, env, fetch)
  dossier.narrative = nar.narrative
  if (nar.error) (dossier.evidence ??= []).push({ source: 'openrouter', ok: false, error: nar.error })
  if (kv) {
    let n = 1
    const nKey = `inv_n:${type}:${value}`
    try { n = (+(await kv.get(nKey)) || 0) + 1; await kv.put(nKey, String(n), { expirationTtl: 604800 }) } catch {}
    dossier.investigated_by = n
    await kv.put(key, JSON.stringify(dossier), { expirationTtl: ttl })
  }
  return json(dossier, 200, request)
}
