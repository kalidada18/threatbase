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
      data: {
        malicious: s.isMalicious === true, risk, feed_count: Number(s.feedCount) || 1,
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
    const parts: VerdictPart[] = [{ source: 'otx', malicious: pulses.length > 0 }]
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
    const relations: Relation[] = arr(j?.data?.relationships?.resolutions?.data)
      .map((d: any) => ({ value: String(d?.id ?? '').toLowerCase(), edge: 'vt_resolution' }))
      .filter((d: any) => d.value)
      .map((d: any) => ({ type: 'domain' as IndicatorType, value: d.value, edge: d.edge, via: 'VirusTotal', weight: 1 }))
    const mod = Number(j?.data?.attributes?.last_modification_date)
    return {
      source: 'virustotal', ok: true,
      data: { parts: [vtStatsToPart(j)], relations, sightings: Number.isFinite(mod) ? [{ date: new Date(mod * 1000).toISOString(), source: 'virustotal', event: 'last analysed' }] : [] },
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
      data: { parts: [{ source: 'abusech-bazaar', malicious: true } as VerdictPart], tags: [d.signature, ...tags].filter(Boolean).slice(0, 10), sightings, relations: [] },
    }
  } catch (e) {
    return { source: 'malwarebazaar', ok: false, error: String(e) }
  }
}
