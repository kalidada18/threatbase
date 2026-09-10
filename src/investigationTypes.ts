/** Mirror of functions/api/investigate/_lib.ts Dossier — the SPA's side of the
 *  /api/investigate contract. Kept by hand; the Functions type is authoritative. */

export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'md5' | 'sha1' | 'sha256'
export type Relation = { type: IndicatorType; value: string; edge: string; via?: string; weight: number; malicious?: boolean | null; first_seen?: string; last_seen?: string }
export type TimelinePoint = { date: string; count: number; sources: string[] }

export type Dossier = {
  query: { type: IndicatorType; value: string }
  /** Missing on the non-routable answer — guard before formatting. */
  generated_at?: string
  cached: boolean
  /** Only present on the non-routable answer — that payload omits the rest. */
  note?: string
  verdict: { malicious_by: number; total_engines: number; status: 'malicious' | 'suspicious' | 'clean' | 'unknown'; risk?: number; feed_count?: number; tags?: string[] }
  identity: { country: string | null; country_code: string | null; city: string | null; region: string | null; isp: string | null; asn: string | null; reverse_dns: string | null; registered: string | null; hosting_type: string } | null
  sources_ok?: string[]
  sources_skipped?: string[]
  sources_failed?: string[]
  behavior?: { ports: { port: number; service: string; banner?: string }[]; tags: string[]; first_seen: string | null; last_seen: string | null }
  relations: Relation[]
  pulses?: { title: string; url: string; modified: string }[]
  timeline?: TimelinePoint[]
  narrative: string | null
  investigated_by?: number
}
