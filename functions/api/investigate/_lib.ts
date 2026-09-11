/** Pure logic for /api/investigate — no fetch, Workers-safe, unit-tested in _lib.test.ts. */

export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'md5' | 'sha1' | 'sha256'

export type VerdictPart = { source: string; malicious: boolean | null; last_seen?: string | null } // null = no opinion; last_seen drives recency decay
export type Verdict = {
  score: number // 0–100 weighted
  malicious_by: number
  total_engines: number
  status: 'malicious' | 'high_risk' | 'suspicious' | 'clean' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  dominant_source: string | null
}
export type Relation = { type: IndicatorType; value: string; edge: string; via?: string; weight: number; malicious?: boolean | null; first_seen?: string; last_seen?: string }
export type Sighting = { date: string; source: string; event: string }
export type TimelinePoint = { date: string; count: number; sources: string[] }
export type SourceResult<T> = { source: string; ok: boolean; data?: T; error?: string; skipped?: boolean }

/** Task C structured analyst assessment. Mirrored in src/investigationTypes.ts. */
export type Narrative = {
  verdict_sentence: string          // one sentence — what this indicator is
  confidence: 'high' | 'medium' | 'low'
  why_malicious: string[]           // empty array if clean
  infrastructure_notes: string      // one sentence on hosting/ASN context
  recommended_action: 'block' | 'monitor' | 'investigate_further' | 'safe_to_ignore'
  mitre_techniques: string[]        // ATT&CK IDs e.g. ['T1071', 'T1566'], empty if none inferable
}

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
  narrative: Narrative | null
  investigated_by: number
  stale_at: string // ISO instant when this dossier expires — set at KV-write time from cacheTtl
  /** Raw per-source results (Task F evidence accordion). Optional: dossiers
   *  cached in KV before F deploy and the non-routable early-return omit it —
   *  the cockpit guards. Includes adapter-transformed data, not upstream bodies. */
  evidence?: SourceResult<unknown>[]
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

/** KV keys reject spaces/unicode — strip everything outside [a-z0-9._:].
 *  ponytail: collisions only across exotic chars (URL query junk, IDN), acceptable for a rate-limit key. */
export const sanitizeKv = (s: string) => s.replace(/[^a-z0-9._:]/g, '')

/** Verdict-driven cache TTL (seconds). Lower score = more likely clean = safe to cache longer;
 *  higher score = actively malicious = re-investigate sooner. */
export function cacheTtl(verdict: Verdict): number {
  if (verdict.status === 'malicious' && verdict.confidence === 'high') return 7_200       // 2 h — C2/confirmed threat
  if (verdict.status === 'malicious')                                   return 14_400      // 4 h
  if (verdict.status === 'high_risk')                                   return 21_600      // 6 h
  if (verdict.status === 'suspicious')                                  return 43_200      // 12 h
  if (verdict.status === 'clean')                                       return 172_800     // 48 h
  return 86_400 // unknown → 24 h default
}

export function staleAt(generatedAt: string, ttl: number): string {
  return new Date(new Date(generatedAt).getTime() + ttl * 1000).toISOString()
}

const SOURCE_WEIGHT: Record<string, number> = {
  feodo:          10,   // C2 botnet confirmed — highest signal
  urlhaus:         9,   // malicious URL confirmed
  threatbase:      8,   // curated internal feeds
  greynoise:       7,   // targeted attacker vs. scanner classification
  malwarebazaar:   6,   // malware sample confirmed
  otx:             5,   // community-driven, moderate signal
  spamhaus:        5,   // BGP-level block — dedicated fraud infra
  ripestat:        4,   // routing anomaly — possible hijack indicator
  virustotal:      3,   // noisy community engines
  shodan:          1,   // open port presence ≠ malicious
}

const DEFAULT_WEIGHT = 2

// ponytail: no last_seen (pre-B adapters) decays to a flat 0.5 — neutral half-weight, upgrade when adapters thread dates.
function recencyDecay(last_seen: string | null | undefined): number {
  if (!last_seen) return 0.5
  const days = (Date.now() - new Date(last_seen).getTime()) / 86400000
  if (days < 7)   return 1.00
  if (days < 30)  return 0.80
  if (days < 90)  return 0.60
  if (days < 365) return 0.40
  return 0.20
}

export function mergeVerdict(parts: VerdictPart[]): Verdict {
  const opinions = parts.filter((p) => p.malicious !== null)
  if (opinions.length === 0) {
    return { score: 0, malicious_by: 0, total_engines: 0, status: 'unknown', confidence: 'low', dominant_source: null }
  }

  const maliciousParts = opinions.filter((p) => p.malicious)
  const malicious_by = maliciousParts.length
  const total_engines = opinions.length

  // Weighted score: sum of (weight × decay) for malicious sources, normalized
  // at feodo-fresh = 10.0, scaled to 80 pts + multi-source bonus (soft cap 20) = 100.
  const MAX_SINGLE = SOURCE_WEIGHT['feodo'] * 1.0
  let rawSum = 0
  let dominantSource: string | null = null
  let dominantWeight = -1

  for (const p of maliciousParts) {
    const w = SOURCE_WEIGHT[p.source] ?? DEFAULT_WEIGHT
    rawSum += w * recencyDecay(p.last_seen)
    if (w > dominantWeight) { dominantWeight = w; dominantSource = p.source }
  }

  // B-smoke catch: malicious_by 0 made the raw formula -5; score is declared 0–100.
  const multiBonus = Math.max(0, Math.min(20, (malicious_by - 1) * 5))
  const score = Math.min(100, Math.round((rawSum / MAX_SINGLE) * 80 + multiBonus))

  const status: Verdict['status'] =
    score >= 80 ? 'malicious' :
    score >= 55 ? 'high_risk' :
    score >= 25 ? 'suspicious' :
    malicious_by > 0 ? 'suspicious' : 'clean'

  const confidence: Verdict['confidence'] =
    dominantWeight >= 8 ? 'high' :
    dominantWeight >= 4 ? 'medium' : 'low'

  return { score, malicious_by, total_engines, status, confidence, dominant_source: dominantSource }
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

/** Parse + validate a raw LLM narrative response into a Narrative.
 *  Malformed output degrades to null — the UI's job is never to trust the model.
 *  Strips accidental markdown fences, enforces every schema field, caps lengths. */
export function validateNarrative(raw: string): Narrative | null {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(clean)
    if (
      typeof parsed.verdict_sentence !== 'string' ||
      !['high', 'medium', 'low'].includes(parsed.confidence) ||
      !Array.isArray(parsed.why_malicious) ||
      !['block', 'monitor', 'investigate_further', 'safe_to_ignore'].includes(parsed.recommended_action) ||
      !Array.isArray(parsed.mitre_techniques)
    ) return null
    return {
      verdict_sentence: String(parsed.verdict_sentence).slice(0, 300),
      confidence: parsed.confidence,
      why_malicious: parsed.why_malicious.slice(0, 5).map((s: any) => String(s).slice(0, 200)),
      infrastructure_notes: String(parsed.infrastructure_notes ?? '').slice(0, 300),
      recommended_action: parsed.recommended_action,
      mitre_techniques: parsed.mitre_techniques
        .filter((t: any) => /^T\d{4}(\.\d{3})?$/.test(String(t))) // validate ATT&CK ID format
        .slice(0, 8),
    }
  } catch { return null }
}
