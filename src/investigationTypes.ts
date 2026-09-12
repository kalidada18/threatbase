/** Mirror of functions/api/investigate/_lib.ts Dossier — the SPA's side of the
 *  /api/investigate contract. Kept by hand; the Functions type is authoritative. */

export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'md5' | 'sha1' | 'sha256'
export type Relation = { type: IndicatorType; value: string; edge: string; via?: string; weight: number; malicious?: boolean | null; first_seen?: string; last_seen?: string }
export type TimelinePoint = { date: string; count: number; sources: string[] }

/** Mirror of _lib.ts Narrative. The KV round-trip can still carry the legacy
 *  plain-string narrative for up to 24 h after deploy — read sites must branch
 *  on typeof. Server emits object|null only. */
export type Narrative = {
  verdict_sentence: string
  confidence: 'high' | 'medium' | 'low'
  why_malicious: string[]
  infrastructure_notes: string
  recommended_action: 'block' | 'monitor' | 'investigate_further' | 'safe_to_ignore'
  mitre_techniques: string[]
}

/** Mirror of _lib.ts SourceResult — raw per-source evidence for the cockpit accordion. */
export type SourceResult = { source: string; ok: boolean; data?: unknown; error?: string; skipped?: boolean }

export type Dossier = {
  query: { type: IndicatorType; value: string }
  /** Missing on the non-routable answer — guard before formatting. */
  generated_at?: string
  cached: boolean
  /** Only present on the non-routable answer — that payload omits the rest. */
  note?: string
  verdict: { score?: number; malicious_by: number; total_engines: number; status: 'malicious' | 'high_risk' | 'suspicious' | 'clean' | 'unknown'; confidence?: 'high' | 'medium' | 'low'; dominant_source?: string | null; risk?: number; feed_count?: number; tags?: string[] }
  identity: { country: string | null; country_code: string | null; city: string | null; region: string | null; isp: string | null; asn: string | null; reverse_dns: string | null; registered: string | null; hosting_type: string } | null
  sources_ok?: string[]
  sources_skipped?: string[]
  sources_failed?: string[]
  behavior?: { ports: { port: number; service: string; banner?: string }[]; tags: string[]; first_seen: string | null; last_seen: string | null }
  relations: Relation[]
  pulses?: { title: string; url: string; modified: string }[]
  timeline?: TimelinePoint[]
  /** object|null from the server; plain string only from stale pre-C KV (<24 h). */
  narrative: Narrative | string | null
  investigated_by?: number
  /** ISO instant when the cached dossier expires (Task E tiered TTL). */
  stale_at?: string
  /** FREE_TRIAL: set when this dossier rode the open-trial gate (non-Pro).
   *  Remove with the trial flag when Pro goes paid. */
  trial?: boolean
  /** Set when a ?refresh=1 was rate-limited and the cached copy was served instead. */
  refresh_blocked?: boolean
  /** ISO instant when the 1/h refresh cooldown unlocks (paired with refresh_blocked).
   *  Absent on pre-change cached copies (KV TTL ≤ 24 h). */
  refresh_retry_at?: string
  /** Raw per-source results (Task F evidence accordion). Optional: pre-F KV copies omit it. */
  evidence?: SourceResult[]
}
