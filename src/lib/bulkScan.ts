import { scanIndicatorLogic, classifyIndicator } from '../scanner'
import { isStrictIpv6 } from './ipValidation'
import supabaseClient from '../supabaseClient'

/**
 * Client-side bulk scan. Deliberately NOT routed through POST /api/v1/scan:
 * that endpoint demands an x-api-key and bills 1 of ~1000/day per indicator
 * (functions/api/v1/_middleware.ts), while scanIndicatorLogic reuses the
 * module-level feed cache — the IP feed download is paid once per session and
 * every later row is a sub-ms binary search. Same reasoning as the batch API's
 * own "sequential on purpose" comment (functions/api/v1/scan.ts).
 */

// Rows past this are rejected up front: one file should not turn the tab into
// a minutes-long loop with nothing but a counter to show for it.
export const BULK_MAX_ROWS = 10000

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
  matchedCidr: string | null
  relatedMatch: { indicator: string; reason: string } | null
  disputeCount: number
  error?: string
}

export type ParsedBulk = { valid: string[]; invalid: { row: number; text: string }[]; truncated: boolean }

/**
 * Classify one candidate cell/token as an indicator, or null. Stricter than
 * classifyIndicator alone, for bulk precision:
 *  - rejects values containing whitespace (an indicator never has a space;
 *    this kills prose that URL-regexes as `http://evil.com/path ← note`)
 *  - requires strict IPv6 (classifyIndicator's loose check turns a timestamp
 *    cell like `12:34:56` into a bogus "IPv6 Address")
 *  - rejects leading-zero IPv4 octets (`08.8.8.8`): feeds never list those,
 *    and they're the ambiguous octal-vs-decimal form
 */
function bulkIndicator(raw: string): string | null {
  const c = classifyIndicator(raw)
  if (c.type === 'invalid') return null
  if (/\s/.test(c.ip)) return null
  if (c.type === 'IPv6 Address' && !isStrictIpv6(c.ip)) return null
  if (c.type === 'IP Address' && /(^|\.)(0\d|00\d)\./.test(c.ip + '.')) return null
  return c.ip
}

/**
 * Collect indicators from already-parsed rows (one array per source row —
 * one cell for plain text, one per Excel column for spreadsheets). EVERY
 * classifiable cell/token in a row is taken, so `src_ip,dst_ip` pairs and
 * prose notes carrying several IOCs are extracted fully; header and date
 * columns simply don't classify. Values are normalized and refanged
 * (`1.2.3[.]4` → `1.2.3.4`) so dedupe and export stay honest.
 * Pure sync core so it is testable without the xlsx loader.
 */
export function collectBulkRows(rows: unknown[][]): ParsedBulk {
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: ParsedBulk['invalid'] = []
  let truncated = false

  const add = (hit: string) => {
    if (seen.has(hit)) return
    seen.add(hit)
    if (valid.length >= BULK_MAX_ROWS) { truncated = true; return }
    valid.push(hit)
  }

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]
    const preview = cells.map((c) => String(c ?? '').trim()).filter(Boolean)
    if (preview.length === 0) continue
    let found = false
    for (const cell of preview) {
      // Whole cell first; if it doesn't yield, its whitespace-separated
      // tokens each get a chance (one cell may carry several IOCs).
      const hits = [bulkIndicator(cell), ...(bulkIndicator(cell) ? [] : cell.split(/\s+/).map(bulkIndicator))]
      for (const h of hits) {
        if (h) { add(h); found = true }
      }
    }
    if (!found) {
      const line = preview.join(', ')
      invalid.push({ row: i + 1, text: line.length > 60 ? line.slice(0, 57) + '…' : line })
    }
    if (truncated) break
  }
  return { valid, invalid, truncated }
}

/**
 * Parse pasted text or CSV/TXT source with the real SheetJS CSV reader —
 * quoted commas, embedded newlines, and BOM all handled. Lazy import so the
 * ~450 kB parser never touches visitors who don't open Bulk hunt.
 */
export async function parseBulkText(text: string): Promise<ParsedBulk> {
  const XLSX = await import('@e965/xlsx')
  const wb = XLSX.read(text, { type: 'string', raw: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { valid: [], invalid: [], truncated: false }
  return collectBulkRows(XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: '' }))
}

/** Parse an uploaded file: .xlsx/.xls as a workbook, anything else as CSV/TXT. */
export async function parseBulkFile(file: File): Promise<ParsedBulk> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('@e965/xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return { valid: [], invalid: [], truncated: false }
    return collectBulkRows(XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: '' }))
  }
  return parseBulkText(await file.text())
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
  onRow?: (row: BulkRow) => void,
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
        matchedCidr: r.matchedCidr ?? null,
        relatedMatch: r.relatedMatch ?? null,
        disputeCount: 0,
      })
    } catch (err: any) {
      results.push({ value, type: 'unknown', isMalicious: false, status: 'error', riskScore: 'Low', feedCount: 1, tags: [], sources: [], matchedCidr: null, relatedMatch: null, disputeCount: 0, error: err?.message || 'Scan failed' })
    }
    const last = results[results.length - 1]
    // Streaming: hand the row to the caller as it lands so the UI can show
    // verdicts mid-run. onProgress is the batched tick (every 25 rows);
    // onRow fires for every row but is cheap (a buffer push in the UI).
    onRow?.(last)
    if (results.length % 25 === 0 || results.length === rows.length) {
      onProgress?.(results.length, rows.length)
      // Once the feed is cached each scan is pure CPU behind a resolved
      // await, which stays in the microtask queue and starves painting.
      // A real macrotask yield every 25 rows lets the ledger actually
      // stream and Stop stay responsive.
      await new Promise((r) => setTimeout(r, 0))
    }
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
        onProgress?.(results.length, rows.length)
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

/** Verdict rows back out as CSV — feed-line shape plus the range/pivot detail. */
export function bulkToCsv(results: BulkRow[]): string {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const head = 'indicator,type,status,risk_score,feeds,tags,sources,dispute_count,matched_cidr,related_indicator'
  const lines = results.map((r) =>
    [esc(r.value), esc(r.type), r.status, esc(r.riskScore), String(r.feedCount), esc(r.tags.join('|')), esc(r.sources.join('|')), String(r.disputeCount), esc(r.matchedCidr ?? ''), esc(r.relatedMatch?.indicator ?? '')].join(',')
  )
  return [head, ...lines].join('\n')
}
