/**
 * The corpus row -> verdict mapping, shared by everything that reads
 * public.lookup_intel.
 *
 * Why this lives here and not in one of its callers: the same verdict has to
 * come out of three places now — the Cloudflare Functions (functions/api/
 * _intel.ts), the browser's bulk hunt (src/lib/bulkScan.ts, via
 * lookup_intel_batch) and, transitively, the MCP tools. When this logic had a
 * single home it could not drift. The moment bulk was moved onto the batch RPC
 * it would have had a second copy of the tag/dispute/pivot rules, and the two
 * would have disagreed the first time a reason string changed.
 *
 * Deliberately free of @supabase/supabase-js: the caller owns the transport
 * (a single RPC vs. a batched one), this module owns only the interpretation.
 * Everything it imports from src/scanner is pure and browser-safe.
 */
import { classifyIndicator, extractUrlHost, parentDomains } from '../scanner'

/** One row of public.lookup_intel / lookup_intel_batch — db/lookup_intel.sql. */
export type IntelRow = {
  /** lookup_intel_batch echoes the input here; absent on the single-value RPC. */
  input_value?: string
  matched: string
  /** 'exact' (the value itself) | 'parent' (a pivot candidate) | 'subnet' (CIDR containment) */
  match_kind: 'exact' | 'parent' | 'subnet'
  /** 'ip' | 'hash' | 'cidr' | 'subnet' | the indicator_intel kind ('domain' | 'url') */
  src: string
  score: number | null
  malicious: boolean
  feed_count: number | null
  tags: string | null
  source: string | null
  matched_cidr: string | null
  dispute_count: number | null
}

/** What both scanIndicatorLogic and the corpus paths return, key for key. */
export type IntelVerdict = {
  type: string
  ip: string
  isIP: boolean
  isDomain: boolean
  isHash: boolean
  isURL: boolean
  isIPv6: boolean
  isCIDR: boolean
  isMalicious: boolean
  riskScore: string
  feedCount: number | string
  isDisputed?: boolean
  disputeCount?: number
  tags?: string[]
  sources?: string[]
  matchedCidr?: string | null
  relatedMatch?: { indicator: string; reason: string } | null
}

/** The classifyIndicator shape this module needs — avoids importing its type. */
type Classified = ReturnType<typeof classifyIndicator>

/**
 * score -> RiskScore tier. The inverse of TIER_SCORE in
 * pipeline/import_ip_intel.py (HIGH=90 / MEDIUM=60 / LOW=20), which
 * db/ip_intel.sql documents as the single source of truth.
 */
export function riskFromScore(score: number | null): string {
  if (score === null) return 'Low'
  if (score >= 90) return 'High'
  if (score >= 60) return 'Medium'
  return 'Low'
}

/** The classifier fields every verdict carries, matching scanIndicatorLogic. */
export function intelBase(c: Classified) {
  return {
    type: c.type,
    ip: c.ip,
    isIP: c.isIP,
    isDomain: c.isDomain,
    isHash: c.isHash,
    isURL: c.isURL,
    isIPv6: c.isIPv6,
    isCIDR: c.isCIDR,
  }
}

/**
 * Pivot candidates, in probe order. The parsing lives here rather than in SQL
 * so the rules exist once — extractUrlHost/parentDomains are the same helpers
 * scanIndicatorLogic uses, so the corpus and the feed paths agree on what
 * counts as related infrastructure.
 */
export function pivotCandidates(c: Classified): { host: string | null; parents: string[] } {
  if (c.isDomain) return { host: null, parents: parentDomains(c.ip) }
  if (c.isURL) {
    const host = extractUrlHost(c.ip)
    return { host, parents: host ? [host, ...parentDomains(host)] : [] }
  }
  return { host: null, parents: [] }
}

/** The verdict when the corpus has no row for the value — a clean indicator. */
export function cleanVerdict(base: ReturnType<typeof intelBase>): IntelVerdict {
  return {
    ...base,
    isMalicious: false,
    riskScore: 'Low',
    feedCount: 1,
    isDisputed: false,
    disputeCount: 0,
    tags: [],
    sources: [],
    matchedCidr: null,
    relatedMatch: null,
  }
}

/**
 * Turn one corpus row into the verdict object every caller already expects.
 * Byte-for-byte the body that used to live in functions/api/_intel.ts.
 */
export function rowToVerdict(
  base: ReturnType<typeof intelBase>,
  c: Classified,
  host: string | null,
  row: IntelRow,
): IntelVerdict {
  let matchedCidr: string | null = null
  let relatedMatch: { indicator: string; reason: string } | null = null

  if (row.match_kind === 'parent') {
    // Which pivot fired decides the wording the report shows. A URL's own
    // host is preferred over its parents, so src separates "the host is
    // listed" from "a parent of the host is listed".
    let reason = 'Subdomain of listed malicious domain'
    if (c.isURL) {
      if (row.matched === host) {
        reason = row.src === 'ip' ? 'URL hosted on listed malicious IP' : 'URL host is a listed malicious domain'
      } else {
        reason = 'URL host is a subdomain of a listed malicious domain'
      }
    }
    relatedMatch = { indicator: row.matched, reason }
  } else if (row.match_kind === 'subnet') {
    matchedCidr = row.matched_cidr
    if (c.isURL) {
      relatedMatch = { indicator: row.matched_cidr as string, reason: 'URL hosted inside listed malicious subnet' }
    }
  }

  const tags = row.tags ? row.tags.split('|').filter((t) => t.trim() !== '' && t !== 'Mixed') : []
  // Same rule scanIndicatorLogic applies to a feed-line verdict.
  if (relatedMatch && !tags.includes('Related Infrastructure')) tags.push('Related Infrastructure')

  const disputeCount = row.dispute_count ?? 0
  const isDisputed = disputeCount >= 3

  return {
    ...base,
    isMalicious: isDisputed ? false : row.malicious,
    riskScore: riskFromScore(row.score),
    feedCount: row.feed_count ?? 1,
    isDisputed,
    disputeCount,
    tags,
    // labelSources (src/components/sourceLabels.ts) collapses any
    // non-empty list to ['Threatbase'], so only emptiness matters here.
    sources: row.source ? row.source.split('|').filter(Boolean) : [],
    matchedCidr,
    relatedMatch,
  }
}

/** Shared by both corpus paths so "invalid" cannot mean two different things. */
export function invalidVerdict(base: ReturnType<typeof intelBase>): IntelVerdict {
  return { ...base, isMalicious: false, riskScore: 'Low', feedCount: 1 }
}

/** Classify once, then feed the helpers above. */
export { classifyIndicator }
