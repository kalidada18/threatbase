/** Pure logic for /api/investigate — no fetch, Workers-safe, unit-tested in _lib.test.ts. */

export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'md5' | 'sha1' | 'sha256'

export type VerdictPart = { source: string; malicious: boolean | null } // null = no opinion
export type Verdict = { malicious_by: number; total_engines: number; status: 'malicious' | 'suspicious' | 'clean' | 'unknown' }
export type Relation = { type: IndicatorType; value: string; edge: string; via?: string; weight: number; malicious?: boolean | null; first_seen?: string; last_seen?: string }
export type Sighting = { date: string; source: string; event: string }
export type TimelinePoint = { date: string; count: number; sources: string[] }
export type SourceResult<T> = { source: string; ok: boolean; data?: T; error?: string; skipped?: boolean }

export type Dossier = {
  query: { type: IndicatorType; value: string }
  generated_at: string
  cached: boolean
  sources_ok: string[]
  sources_skipped: string[]
  sources_failed: string[]
  verdict: Verdict & { risk?: number; feed_count?: number; tags?: string[] }
  identity: { country: string | null; country_code: string | null; city: string | null; region: string | null; isp: string | null; asn: string | null; reverse_dns: string | null; registered: string | null; hosting_type: string }
  behavior: { ports: { port: number; service: string; banner?: string }[]; tags: string[]; first_seen: string | null; last_seen: string | null }
  relations: Relation[]
  pulses: { title: string; url: string; modified: string }[]
  timeline: TimelinePoint[]
  narrative: string | null
  investigated_by: number
}

// Refang first: attackers write hxxp://, [.], [:] to dodge scanners. Strip whitespace.
export function refang(raw: string): string {
  return raw.trim()
    .replace(/\[\.\]/g, '.').replace(/\(\.\)/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/^hxxps?:\/\//i, (m) => m.replace(/xx/i, 'tt'))
}

const IP4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IP6 = /^[0-9a-f:]{2,45}$/
const DOMAIN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/
const MD5 = /^[0-9a-f]{32}$/
const SHA1 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

export function sniffType(rawQ: string): IndicatorType | null {
  const q = refang(rawQ).toLowerCase()
  if (!q || q.length > 255) return null
  if (IP4.test(q)) return q.split('.').every((o) => +o <= 255) ? 'ipv4' : null
  if (IP6.test(q) && q.includes(':')) return 'ipv6'
  if (/^https?:\/\//.test(q)) { try { new URL(q); return 'url' } catch { return null } }
  if (MD5.test(q)) return 'md5'
  if (SHA1.test(q)) return 'sha1'
  if (SHA256.test(q)) return 'sha256'
  if (DOMAIN.test(q)) return 'domain'
  return null
}

export function isPublicIp(v: string): boolean {
  if (!IP4.test(v) && !(IP6.test(v) && v.includes(':'))) return false
  if (v.includes('.')) {
    const [a, b] = v.split('.').map(Number)
    if (v.split('.').some((o) => +o > 255)) return false
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) || a >= 224) return false
    return true
  }
  const l = v.toLowerCase()
  if (l.startsWith('::1') || l === '::' || l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return false
  const mapped = l.match(/:(:?ffff:)?((?:\d{1,3}\.){3}\d{1,3})$/) // ::ffff:a.b.c.d
  if (mapped) return isPublicIp(mapped[2])
  return true
}

export const cacheKey = (type: IndicatorType, value: string) => `inv:${type}:${value}`

export function mergeVerdict(parts: VerdictPart[]): Verdict {
  const opinions = parts.filter((p) => p.malicious !== null)
  const malicious_by = opinions.filter((p) => p.malicious).length
  const status = malicious_by >= 8 ? 'malicious' : malicious_by >= 3 ? 'suspicious'
    : opinions.length === 0 ? 'unknown' : malicious_by > 0 ? 'suspicious' : 'clean'
  return { malicious_by, total_engines: opinions.length, status }
}

// ponytail: recency uses string-compare on ISO dates (fine until 10000 CE); weights are source-defined co-occurrence counts.
export function rankRelations(relations: Relation[], cap = 40): Relation[] {
  const best = new Map<string, Relation>()
  for (const r of relations) {
    if (!r?.value || !r?.type) continue
    const k = `${r.type}:${r.value.toLowerCase()}`
    const prev = best.get(k)
    if (!prev || (r.weight ?? 0) > prev.weight) best.set(k, r)
  }
  return [...best.values()]
    .sort((a, b) => b.weight - a.weight || (b.last_seen ?? '').localeCompare(a.last_seen ?? ''))
    .slice(0, cap)
}

const VPS = /hetzner|ovh|digitalocean|vultr|linode|amazon|microsoft|google|azure|aws|cloudflare|tencent|alibaba|contabo|serverius|nucleonec|choopa|bandwidth|iqi|aeza/i
const BACKBONE = /tele.?nordic|telia|ntt|level3|deutsche telekom|t-mobile|vodafone|orange|telstra|zgzn|China Telecom|China Unicom|China Mobile|transtelecom|retn|gct inet|telia/i
export function hostingType(org: string | null | undefined): string {
  if (!org) return 'unknown'
  if (VPS.test(org)) return 'vps/cloud'
  if (BACKBONE.test(org)) return 'backbone'
  return 'residential/business'
}

export function buildTimeline(sightings: Sighting[]): TimelinePoint[] {
  const byDay = new Map<string, Set<string>>()
  for (const s of sightings) {
    if (!s?.date || !s?.source) continue
    const day = String(s.date).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    if (!byDay.has(day)) byDay.set(day, new Set())
    byDay.get(day)!.add(s.source)
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, sources]) => ({ date, count: sources.size, sources: [...sources].sort() }))
}
