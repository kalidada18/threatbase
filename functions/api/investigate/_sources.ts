/** Source adapters for /api/investigate. One function per upstream, each
 * returning a SourceResult whose data feeds the orchestrator merge loop
 * (keys: parts, relations, sightings, tags, pulses, ports, identity...).
 * Defensive parse everywhere: unknown shape -> ok:false, never throws. */
import type { IndicatorType, Relation, Sighting, SourceResult, VerdictPart } from './_lib'
import { scanIndicatorLogic } from '../../../src/scanner'

export const OTX_BASE = 'https://otx.alienvault.com/api/v1'
const HEADERS = {
  'User-Agent': 'Threatbase/1.0 (+https://threatbase.qzz.io)',
  Accept: 'application/json',
}

// Live-verified OTX indicator type buckets (path segment and result `type`).
export const otxTypePath: Record<IndicatorType, string> = {
  ipv4: 'IPv4', ipv6: 'IPv6', domain: 'domain', url: 'URL',
  md5: 'file_name_hash', sha1: 'FileHash-SHA1', sha256: 'FileHash-SHA256',
}
const PATH_TO_TYPE: Record<string, IndicatorType | null> = {
  IPv4: 'ipv4', IPv6: 'ipv6', domain: 'domain', hostname: 'domain', URL: 'url',
  file_name_hash: 'md5', 'FileHash-MD5': 'md5', 'FileHash-SHA1': 'sha1', 'FileHash-SHA256': 'sha256',
}
export const typeToIndicator = (t: string): IndicatorType | null => PATH_TO_TYPE[t] ?? null

const TIMEOUT = 6000
const timeout = () => AbortSignal.timeout(TIMEOUT)
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])

// --- pure shape-walkers (offline-tested in _sources.test.ts) ---------------

const isRelation = (r: Relation): boolean => !!r.value && !!r.type

/** One pulse's flat indicators -> co-occurring relations. Query value itself
 * (the pulse's subject) is excluded by the caller via `exclude`. */
export function otxPulseIndicatorsToRelations(json: any, pulseTitle: string): Relation[] {
  const out: Relation[] = []
  const seen = new Set<string>()
  for (const ind of arr(json?.results)) {
    const type = ind?.type ? typeToIndicator(String(ind.type)) : null
    const value = String(ind?.indicator ?? '').trim()
    if (!type || !value) continue // mutex/YARA/etc. — exotic, v1 skip
    const k = `${type}:${value.toLowerCase()}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      type, value, edge: 'same_pulse', via: pulseTitle, weight: 1,
      ...(ind.malicious === true ? { malicious: true } : {}),
    })
  }
  return out.filter(isRelation)
}

export function vtStatsToPart(json: any): VerdictPart {
  const stats = json?.data?.attributes?.last_analysis_stats
  const malicious = Number(stats?.malicious)
  if (!Number.isFinite(malicious)) return { source: 'virustotal', malicious: null }
  return { source: 'virustotal', malicious: malicious > 0 }
}

/** Resolution relationship ids are "<ip>_<hostname>" — keep the hostname part. */
export function vtResolutionsToRelations(json: any): Relation[] {
  return arr(json?.data?.relationships?.resolutions?.data)
    .map((d: any) => {
      const id = String(d?.id ?? '')
      const host = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id
      return { type: 'domain' as IndicatorType, value: host.toLowerCase(), edge: 'vt_resolution', via: 'VirusTotal', weight: 1 }
    })
    .filter((r) => r.value)
}

export function shodanToBehavior(json: any): { ports: { port: number; service: string; banner?: string }[]; tags: string[]; relations: Relation[] } {
  const ports = arr(json?.data)
    .filter((d) => Number.isFinite(+d?.port))
    .map((d) => ({ port: +d.port, service: String(d.service ?? 'unknown'), banner: d.version ?? d.product ?? d.data ? String(d.version ?? d.product ?? d.data).slice(0, 240) : undefined }))
    .sort((a: { port: number }, b: { port: number }) => a.port - b.port)
  const relations = [...arr(json?.hostnames), ...arr(json?.domains)]
    .map((h) => String(h))
    .filter((h, i, a) => a.indexOf(h) === i)
    .map((value) => ({ type: 'domain' as IndicatorType, value, edge: 'shodan_hostname', via: 'Shodan', weight: 1 }))
  return { ports, tags: arr(json?.tags).map(String), relations }
}

// --- SentinelDossier B pure helpers (offline-tested). Controller amendment
// #2: no @cloudflare/workers-types in the tsc gate -> adapter kv params are any.

/** Feodo blocklist search — pure so it can be fixture-tested without fetch. */
export function parseFeodoList(list: unknown, ip: string): { hit: any | null; malicious: boolean } {
  const hit = arr(list).find((e: any) => e?.ip_address === ip) ?? null
  return { hit, malicious: !!hit }
}

function ipv4ToInt(ip: string): number | null {
  const octs = ip.split('.')
  if (octs.length !== 4) return null
  let n = 0
  for (const o of octs) {
    const v = Number(o)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

/** Total CIDR membership: malformed base/bits/non-octet -> false, never throws
 * (controller amendment #5: /0 and junk bits are skipped, not mis-masked). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = String(cidr).split('/')
  const bits = Number(bitsStr)
  if (!base || !Number.isInteger(bits) || bits < 1 || bits > 32) return false
  const mask = (0xffffffff << (32 - bits)) >>> 0
  const a = ipv4ToInt(ip)
  const b = ipv4ToInt(base)
  return a !== null && b !== null && (a & mask) === (b & mask)
}

/** GreyNoise riot-over-classification rule, pure. */
export function normalizeGreynoise(json: any): { malicious: boolean | null; tags: string[]; last_seen: string | null } {
  const malicious =
    json?.riot === true ? false :
    json?.classification === 'malicious' ? true :
    json?.classification === 'benign' ? false : null
  const tags: string[] = []
  if (json?.noise && malicious !== true) tags.push('mass_scanner')
  if (json?.riot) tags.push('known_safe_service')
  if (json?.name) tags.push(`greynoise:${String(json.name).toLowerCase().replace(/\s+/g, '_')}`)
  return { malicious, tags, last_seen: json?.last_seen ?? null }
}

// --- adapters ---------------------------------------------------------------

export async function onsite(value: string, _fetchImpl: typeof fetch): Promise<SourceResult<any>> {
  try {
    // ponytail: scanIndicatorLogic reads feeds via global fetch internally;
    // fetchImpl can't be threaded into it. Acceptable — same-origin cache read.
    void _fetchImpl
    const s = await scanIndicatorLogic(value, 'latest')
    if (s.type === 'invalid') return { source: 'threatbase', ok: false, error: 'invalid indicator' }
    const risk = s.riskScore === 'High' ? 80 : s.riskScore === 'Medium' ? 50 : s.isMalicious ? 40 : 10
    return {
      source: 'threatbase', ok: true,
      // Verdict rides ONLY in parts[] — the orchestrator also pushes a top-level
      // `malicious` boolean into parts; carrying both double-counts threatbase.
      data: {
        risk, feed_count: Number(s.feedCount) || 1,
        tags: arr(s.tags), parts: [{ source: 'threatbase', malicious: s.isMalicious === true } as VerdictPart],
        relations: [], sightings: [], // feed rows carry no dates — OTX provides the timeline
      },
    }
  } catch (e) {
    return { source: 'threatbase', ok: false, error: String(e) }
  }
}

export async function otxInvestigate(
  type: IndicatorType, value: string, env: { OTX_API_KEY: string }, fetchImpl: typeof fetch,
): Promise<SourceResult<any>> {
  if (!env.OTX_API_KEY) return { source: 'otx', ok: false, skipped: true }
  try {
    const r = await fetchImpl(`${OTX_BASE}/indicators/${otxTypePath[type]}/${encodeURIComponent(value)}`,
      { headers: { ...HEADERS, 'X-OTX-API-KEY': env.OTX_API_KEY }, signal: timeout() })
    if (!r.ok) return { source: 'otx', ok: false, error: `HTTP ${r.status}` }
    const j = await r.json()
    const pulses = arr(j?.pulses?.results).map((p: any) => ({
      id: String(p.id ?? ''), title: String(p.title ?? 'untitled'),
      modified: String(p.modified ?? ''), url: String(p.url ?? ''), tags: arr(p.tags).map(String),
    })).filter((p: any) => p.id)
    // Amendment #12: freshest pulse date drives recency decay.
    const parts: VerdictPart[] = [{ source: 'otx', malicious: pulses.length > 0, ...(pulses.length ? { last_seen: pulses.map((p: any) => p.modified).sort().at(-1) } : {}) }]
    const sightings: Sighting[] = pulses.map((p: any) => ({ date: p.modified, source: 'otx', event: p.title }))
    const tagSet = new Set<string>()
    for (const p of pulses.slice(0, 10)) p.tags.forEach((t: string) => tagSet.add(t))

    // Top 5 pulses -> co-indicator edges; weight = pulse count containing it.
    const byKey = new Map<string, Relation>()
    const lower = value.toLowerCase()
    for (const p of pulses.slice(0, 5)) {
      const pr = await fetchImpl(`${OTX_BASE}/pulses/${p.id}/indicators?limit=1000&include_inactive=0`,
        { headers: { ...HEADERS, 'X-OTX-API-KEY': env.OTX_API_KEY }, signal: timeout() })
      if (!pr.ok) continue
      for (const rel of otxPulseIndicatorsToRelations(await pr.json().catch(() => null), p.title)) {
        if (rel.value.toLowerCase() === lower) continue // drop the query itself
        const k = `${rel.type}:${rel.value.toLowerCase()}`
        const prev = byKey.get(k)
        if (prev) {
          prev.weight += 1
          prev.via = `${prev.via}; ${p.title}`.slice(0, 200)
        } else byKey.set(k, { ...rel, first_seen: p.modified, last_seen: p.modified })
      }
    }
    return {
      source: 'otx', ok: true,
      data: { parts, relations: [...byKey.values()], sightings, tags: [...tagSet].slice(0, 20),
        pulses: pulses.slice(0, 10).map((p: any) => ({ title: p.title, url: p.url, modified: p.modified })) },
    }
  } catch (e) {
    return { source: 'otx', ok: false, error: String(e) }
  }
}

export async function shodanHost(ip: string, env: { SHODAN_API_KEY?: string }, fetchImpl: typeof fetch): Promise<SourceResult<any>> {
  if (!env.SHODAN_API_KEY) return { source: 'shodan', ok: false, skipped: true }
  try {
    const r = await fetchImpl(`https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${env.SHODAN_API_KEY}`,
      { headers: HEADERS, signal: timeout() })
    if (!r.ok) return { source: 'shodan', ok: false, error: `HTTP ${r.status}` }
    const j = await r.json()
    const b = shodanToBehavior(j)
    const stamp = arr(j?.data).map((d: any) => Number(d._timestamp)).filter(Number.isFinite).sort()
    const toIso = (s: number) => new Date(s * 1000).toISOString()
    return {
      source: 'shodan', ok: true,
      data: {
        ports: b.ports, tags: b.tags, relations: b.relations,
        sightings: stamp.length ? [{ date: toIso(stamp[0]), source: 'shodan', event: 'first banner' }, { date: toIso(stamp[stamp.length - 1]), source: 'shodan', event: 'latest banner' }] : [],
      },
    }
  } catch (e) {
    return { source: 'shodan', ok: false, error: String(e) }
  }
}

const VT_COLLECTION: Partial<Record<IndicatorType, string>> = {
  ipv4: 'ip_addresses', ipv6: 'ip_addresses', md5: 'files', sha1: 'files', sha256: 'files', domain: 'domains',
}

export async function vtReport(type: IndicatorType, value: string, env: { VT_API_KEY?: string }, fetchImpl: typeof fetch): Promise<SourceResult<any>> {
  const coll = VT_COLLECTION[type]
  if (!env.VT_API_KEY || !coll) return { source: 'virustotal', ok: false, skipped: true }
  try {
    const rel = coll === 'ip_addresses' ? '?relationships=resolutions' : ''
    const r = await fetchImpl(`https://www.virustotal.com/api/v3/${coll}/${encodeURIComponent(value)}${rel}`,
      { headers: { ...HEADERS, Authorization: `Bearer ${env.VT_API_KEY}` }, signal: timeout() })
    if (r.status === 404) return { source: 'virustotal', ok: true, data: null } // "no record" is an answer
    if (!r.ok) return { source: 'virustotal', ok: false, error: `HTTP ${r.status}` }
    const j = await r.json()
    const mod = Number(j?.data?.attributes?.last_modification_date)
    const modIso = Number.isFinite(mod) ? new Date(mod * 1000).toISOString() : null
    return {
      source: 'virustotal', ok: true,
      // Amendment #12: thread VT's analysis date into the part so recency decay bites.
      data: { parts: [{ ...vtStatsToPart(j), ...(modIso ? { last_seen: modIso } : {}) }], relations: vtResolutionsToRelations(j), sightings: modIso ? [{ date: modIso, source: 'virustotal', event: 'last analysed' }] : [] },
    }
  } catch (e) {
    return { source: 'virustotal', ok: false, error: String(e) }
  }
}

export async function bazaar(sha256: string, env: { MB_API_KEY?: string }, fetchImpl: typeof fetch): Promise<SourceResult<any>> {
  if (!env.MB_API_KEY) return { source: 'malwarebazaar', ok: false, skipped: true }
  try {
    const r = await fetchImpl('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${env.MB_API_KEY}` },
      body: new URLSearchParams({ query: 'getinfo_by_sha256', sha256_hash: sha256 }),
      signal: timeout(),
    })
    if (!r.ok) return { source: 'malwarebazaar', ok: false, error: `HTTP ${r.status}` }
    const j = await r.json()
    if (j?.query_status !== 'ok' || !arr(j.data).length) return { source: 'malwarebazaar', ok: true, data: null }
    const d = j.data[0]
    const tags = arr(d?.tags).map(String)
    const sightings: Sighting[] = []
    for (const k of ['first_seen', 'last_seen']) {
      if (d?.[k]) sightings.push({ date: String(d[k]).replace(' ', 'T') + 'Z', source: 'abusech-bazaar', event: `${k} ${d.signature ?? 'sample'}` })
    }
    return {
      source: 'malwarebazaar', ok: true,
      data: { parts: [{ source: 'abusech-bazaar', malicious: true, ...(d?.last_seen ? { last_seen: String(d.last_seen).replace(' ', 'T') + 'Z' } : {}) } as VerdictPart], tags: [d.signature, ...tags].filter(Boolean).slice(0, 10), sightings, relations: [] },
    }
  } catch (e) {
    return { source: 'malwarebazaar', ok: false, error: String(e) }
  }
}

// SentinelDossier B: high-signal free adapters (amendment #12 polish — the
// existing vtReport/otx/bazaar parts below now thread their own last_seen).

/** Feodo Tracker C2 blocklist; kv-cached raw list (TTL 300s, feed refresh cadence). */
export async function feodoCheck(ip: string, kv: any, fetchImpl: typeof fetch): Promise<SourceResult<{ parts: VerdictPart[]; sightings: Sighting[] }>> {
  const CACHE_KEY = 'feodo:blocklist'
  try {
    let list: any = null
    if (kv) {
      const cached = await kv.get(CACHE_KEY)
      if (cached) { try { list = JSON.parse(cached) } catch { list = null } }
    }
    if (!Array.isArray(list)) {
      const r = await fetchImpl('https://feodotracker.abuse.ch/downloads/ipblocklist.json', { headers: HEADERS, signal: timeout() })
      if (!r.ok) return { source: 'feodo', ok: false, error: `HTTP ${r.status}` }
      list = await r.json()
      if (kv && Array.isArray(list)) await kv.put(CACHE_KEY, JSON.stringify(list), { expirationTtl: 300 })
    }
    if (!Array.isArray(list)) return { source: 'feodo', ok: false, error: 'unexpected shape' }
    const { hit, malicious } = parseFeodoList(list, ip)
    // Live feed datetimes are "YYYY-MM-DD HH:MM:SS" (space, no zone) — ISO-normalise like bazaar.
    const fs = hit?.first_seen ? String(hit.first_seen).replace(' ', 'T') + 'Z' : ''
    return {
      source: 'feodo', ok: true,
      data: {
        parts: [{ source: 'feodo', malicious, last_seen: hit?.last_online ?? null }],
        sightings: hit ? [{ date: fs, source: 'feodo', event: `C2 ${hit.malware ?? 'unknown'} on port ${hit.port ?? '?'}` }] : [],
      },
    }
  } catch (e) {
    return { source: 'feodo', ok: false, error: String(e) }
  }
}

/** URLhaus — /url/ for URLs, /host/ for domains & IPs. no_results is an answer, not an error. */
export async function urlhausCheck(type: IndicatorType, value: string, fetchImpl: typeof fetch): Promise<SourceResult<{ parts: VerdictPart[]; sightings: Sighting[]; tags: string[] }>> {
  const isUrl = type === 'url'
  const endpoint = isUrl ? 'https://urlhaus-api.abuse.ch/v1/url/' : 'https://urlhaus-api.abuse.ch/v1/host/'
  const body = isUrl ? `url=${encodeURIComponent(value)}` : `host=${encodeURIComponent(value)}`
  try {
    const r = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: timeout(),
    })
    // LIVE-VERIFIED 2026-09-10: abuse.ch query endpoints now 401 without an
    // account Auth-Key — brief assumed keyless. skipped (not failed) until a key exists.
    if (r.status === 401 || r.status === 403) return { source: 'urlhaus', ok: false, skipped: true }
    if (!r.ok) return { source: 'urlhaus', ok: false, error: `HTTP ${r.status}` }
    const json: any = await r.json()
    if (json?.query_status === 'no_results')
      return { source: 'urlhaus', ok: true, data: { parts: [{ source: 'urlhaus', malicious: false, last_seen: null }], sightings: [], tags: [] } }
    const urls = arr(json?.urls)
    // Amendment #4: offline URLs aren't a current threat — verdict + recency ride on 'online' only.
    const active = urls.filter((u: any) => u?.url_status === 'online')
    const tags = [...new Set(urls.flatMap((u: any) => arr(u?.tags)).map(String))].slice(0, 20)
    const last_seen = active.map((u: any) => u?.date_added).filter(Boolean).sort().at(-1) ?? null
    return {
      source: 'urlhaus', ok: true,
      data: {
        parts: [{ source: 'urlhaus', malicious: active.length > 0, last_seen }],
        sightings: active.slice(0, 5).map((u: any) => ({
          date: u.date_added ?? '', source: 'urlhaus',
          event: `online malicious URL${arr(u?.tags).length ? ' [' + arr(u.tags).join(',') + ']' : ''}`,
        })),
        tags,
      },
    }
  } catch (e) {
    return { source: 'urlhaus', ok: false, error: String(e) }
  }
}

/** GreyNoise Community (v3) — scanner/riot classification. Skipped without key. */
export async function greynoiseCheck(ip: string, env: { GREYNOISE_API_KEY?: string }, fetchImpl: typeof fetch): Promise<SourceResult<{ parts: VerdictPart[]; tags: string[] }>> {
  if (!env.GREYNOISE_API_KEY) return { source: 'greynoise', ok: false, skipped: true }
  if (!/^[\d.]+$/.test(ip) && !ip.includes(':')) return { source: 'greynoise', ok: false, skipped: true }
  try {
    const r = await fetchImpl(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, {
      headers: { ...HEADERS, key: env.GREYNOISE_API_KEY },
      signal: timeout(),
    })
    // 404 = "not seen by GreyNoise" — an opinion-free answer, not a failure.
    if (r.status === 404) return { source: 'greynoise', ok: true, data: { parts: [{ source: 'greynoise', malicious: null, last_seen: null }], tags: [] } }
    if (!r.ok) return { source: 'greynoise', ok: false, error: `HTTP ${r.status}` }
    const { malicious, tags, last_seen } = normalizeGreynoise(await r.json())
    return { source: 'greynoise', ok: true, data: { parts: [{ source: 'greynoise', malicious, last_seen }], tags } }
  } catch (e) {
    return { source: 'greynoise', ok: false, error: String(e) }
  }
}

/** Spamhaus DROP/EDROP — dedicated-fraud netblocks. kv-cached text feeds, TTL 1h. */
export async function spamhausCheck(ip: string, kv: any, fetchImpl: typeof fetch): Promise<SourceResult<{ parts: VerdictPart[]; tags: string[] }>> {
  if (!/^[\d.]+$/.test(ip)) return { source: 'spamhaus', ok: false, skipped: true }
  const feeds = [
    { url: 'https://www.spamhaus.org/drop/drop.txt', key: 'spamhaus:drop' },
    { url: 'https://www.spamhaus.org/drop/edrop.txt', key: 'spamhaus:edrop' },
  ]
  try {
    let hit = false
    let sawData = false
    for (const feed of feeds) {
      let text: string | null = kv ? await kv.get(feed.key) : null
      if (!text) {
        const r = await fetchImpl(feed.url, { headers: HEADERS, signal: timeout() })
        if (!r.ok) continue
        text = await r.text()
        if (kv) await kv.put(feed.key, text, { expirationTtl: 3600 })
      }
      sawData = true
      const cidrs = text.split('\n').map((l) => l.split(';')[0].trim()).filter((l) => l && !l.startsWith(';'))
      if (cidrs.some((cidr) => ipInCidr(ip, cidr))) { hit = true; break }
    }
    if (!sawData) return { source: 'spamhaus', ok: false, error: 'no feed data' }
    return {
      source: 'spamhaus', ok: true,
      data: {
        parts: [{ source: 'spamhaus', malicious: hit, last_seen: null }],
        tags: hit ? ['dedicated_fraud_network', 'bgp_listed'] : [],
      },
    }
  } catch (e) {
    return { source: 'spamhaus', ok: false, error: String(e) }
  }
}

/** RIPEstat prefix-overview — ASN/holder for identity + BGP anomaly tags. */
export async function ripestatlookup(ip: string, fetchImpl: typeof fetch): Promise<SourceResult<{ asn: string | null; holder: string | null; tags: string[] }>> {
  if (!/^[\d.]+$/.test(ip) && !ip.includes(':')) return { source: 'ripestat', ok: false, skipped: true }
  try {
    const r = await fetchImpl(`https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(ip)}`,
      { headers: HEADERS, signal: timeout() })
    if (!r.ok) return { source: 'ripestat', ok: false, error: `HTTP ${r.status}` }
    const json: any = await r.json()
    const d = json?.data
    const asns = arr(d?.asns)
    const tags: string[] = []
    if (d?.announced === false) tags.push('bgp_unannounced')
    if (asns.length > 1) tags.push('bgp_multi_origin')
    const first: any = asns[0]
    return {
      source: 'ripestat', ok: true,
      data: { asn: first?.asn != null ? `AS${first.asn}` : null, holder: first?.holder ?? null, tags },
    }
  } catch (e) {
    return { source: 'ripestat', ok: false, error: String(e) }
  }
}
