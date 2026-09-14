import { scanIndicatorLogic, classifyIndicator } from '../scanner'
import supabaseClient from '../supabaseClient'

/**
 * Client-side bulk scan. Deliberately NOT routed through POST /api/v1/scan:
 * that endpoint demands an x-api-key and bills 1 of ~1000/day per indicator
 * (functions/api/v1/_middleware.ts), while scanIndicatorLogic reuses the
 * module-level feed cache — the IP feed download is paid once per session and
 * every later row is a sub-ms binary search. Same reasoning as the batch API's
 * own "sequential on purpose" comment (functions/api/v1/scan.ts).
 */

// Rows past this are rejected up front: one CSV should not turn the tab into a
// minutes-long loop with nothing but a counter to show for it.
export const BULK_MAX_ROWS = 2000

// Supabase GETs go through a URL; keep each .in() list well under proxy limits.
const DISPUTE_CHUNK = 200

export type BulkRow = {
  value: string
  type: string
  isMalicious: boolean
  status: 'malicious' | 'clean' | 'disputed' | 'error'
  riskScore: string
  feedCount: number | string
  tags: string[]
  sources: string[]
  disputeCount: number
  error?: string
}

export type ParsedBulk = { valid: string[]; invalid: string[]; truncated: boolean }

/**
 * Turn pasted/uploaded text into indicators: one record per line, first
 * comma/tab/space-separated field that classifies wins (tolerates `ip,extra`
 * columns and a stray header row). Deduped, capped at BULK_MAX_ROWS.
 * ponytail: naive split like the feed parser (no quoted-comma support);
 * upgrade to a real CSV parser only if quoted user files start failing.
 */
export function parseBulkInput(text: string): ParsedBulk {
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  let truncated = false

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const fields = line.split(/[,\t ]+/)
    let hit: string | null = null
    for (const f of fields) {
      if (!f) continue
      const c = classifyIndicator(f)
      // c.ip is the refanged/normalized form — store it so dedupe and the
      // export CSV carry `1.2.3.4`, never `1.2.3[.]4`.
      if (c.type !== 'invalid') { hit = c.ip; break }
    }
    if (!hit) { invalid.push(line.length > 60 ? line.slice(0, 57) + '…' : line); continue }
    if (seen.has(hit)) continue
    seen.add(hit)
    if (valid.length >= BULK_MAX_ROWS) { truncated = true; break }
    valid.push(hit)
  }
  return { valid, invalid, truncated }
}

/**
 * Scan rows sequentially (feeds the module cache; Promise.all would race the
 * fill-after-await in fetchAndCacheFeedText and refetch the 56 MB feed).
 * Dispute flips happen once at the end via one batched query per 200 dirty
 * IPs, reusing the same >=3 rule as scanIndicatorLogic.
 */
export async function runBulkScan(
  rows: string[],
  feedVersion: string | number,
  statsData?: any,
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<BulkRow[]> {
  const results: BulkRow[] = []
  for (const value of rows) {
    if (shouldAbort?.()) break
    try {
      const r = await scanIndicatorLogic(value, feedVersion, statsData, { skipDisputeCheck: true })
      results.push({
        value,
        type: r.type,
        isMalicious: !!r.isMalicious,
        status: r.isMalicious ? 'malicious' : 'clean',
        riskScore: r.riskScore,
        feedCount: r.feedCount,
        tags: r.tags ?? [],
        sources: r.sources ?? [],
        disputeCount: 0,
      })
    } catch (err: any) {
      results.push({ value, type: 'unknown', isMalicious: false, status: 'error', riskScore: 'Low', feedCount: 1, tags: [], sources: [], disputeCount: 0, error: err?.message || 'Scan failed' })
    }
    onProgress?.(results.length, rows.length)
  }

  // Batched dispute pass: flip dirty→disputed at >=3 like the single scanner,
  // in one query per chunk instead of one per row.
  const dirty = results.filter((r) => r.isMalicious)
  if (dirty.length && supabaseClient) {
    try {
      const counts: Record<string, number> = {}
      for (let i = 0; i < dirty.length; i += DISPUTE_CHUNK) {
        const chunk = dirty.slice(i, i + DISPUTE_CHUNK).map((r) => r.value)
        const { data } = await Promise.resolve(
          supabaseClient.from('disputes').select('ip').in('ip', chunk)
        )
        for (const row of (data ?? []) as any[]) counts[row.ip] = (counts[row.ip] || 0) + 1
      }
      for (const r of dirty) {
        const n = counts[r.value] || 0
        r.disputeCount = n
        if (n >= 3) { r.isMalicious = false; r.status = 'disputed' }
      }
    } catch (err) {
      // Non-fatal, mirrors the single-scanner's console.error behavior.
      console.error('Bulk dispute check failed:', err)
    }
  }

  return results
}

/** Verdict rows back out as CSV — same shape as the threatbase feed format. */
export function bulkToCsv(results: BulkRow[]): string {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const head = 'indicator,type,status,risk_score,tags,sources,dispute_count'
  const lines = results.map((r) =>
    [esc(r.value), esc(r.type), r.status, esc(r.riskScore), esc(r.tags.join('|')), esc(r.sources.join('|')), String(r.disputeCount)].join(',')
  )
  return [head, ...lines].join('\n')
}
