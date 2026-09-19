import { classifyIndicator } from '../scanner'
import { isStrictIpv6 } from './ipValidation'
import db from '../lib/dbClient'
import {
  cleanVerdict,
  intelBase,
  invalidVerdict,
  pivotCandidates,
  rowToVerdict,
  type IntelRow,
  type IntelVerdict,
} from './intelVerdict'

/**
 * Client-side bulk scan, now read from the Supabase corpus.
 *
 * It used to run scanIndicatorLogic against the published /ioc text: one ~56 MB
 * feed download per session, then a sub-ms binary search per row. Fast per row,
 * but it was the last read path that still needed the feeds at all, and it
 * bought that speed by downloading the corpus to every visitor.
 *
 * It is still NOT routed through POST /api/v1/scan: that endpoint demands an
 * x-api-key and bills 1 of the key's daily quota per indicator (1,000/day on
 * Free, 20,000/day on Pro — functions/api/v1/_middleware.ts). It calls lookup_intel_batch
 * (db/lookup_intel_batch.sql) directly instead — the same lookup the
 * single-value path uses, fanned out over one round trip per BATCH_CHUNK rows.
 *
 * Calling the single-value lookup_intel once per row was the obvious
 * alternative and is the wrong one: BULK_MAX_ROWS is 10000, so a full file
 * would be 10000 sequential requests. A 500-item batch measures ~1.3 s
 * end-to-end, making a full file ~26 s.
 *
 * lookup_intel_batch is granted to `authenticated`, NOT anon — one call costs
 * ~1.2 s of database time, which must not be spendable by anyone holding the
 * publishable anon key. Bulk hunt is available to every signed-in account now,
 * so the caller's session JWT rides along on the shared client.
 *
 * QUOTA (db/bulk_quota.sql): every scan is a metered unit. Before chunking we
 * call begin_bulk_scan(), which mints a scan_id and returns the caller's
 * standing for the UTC day; each lookup_intel_batch chunk carries that scan_id
 * and the DB refuses any chunk that rides no valid, owned, today-dated token or
 * that would push the scan past its row budget. That is what makes the limit
 * real: the old gate was UI-only and any signed-in account could replay the
 * RPC straight. Free and Pro differ only in the numbers (see below).
 */

// Pro / signed-out-copy mirrors of the DB constants. Kept here so the UI can
// speak about the allowance without a second round trip; the RPC is the source
// of truth and the two are stated together in db/bulk_quota.sql.
export const BULK_FREE_DAILY = 1
export const BULK_PRO_DAILY = 10
export const BULK_FREE_ROWS = 250

/** One scan's standing, as returned by begin_bulk_scan(). */
export type BulkQuota = {
  scanId: string | null
  tier: 'free' | 'pro'
  dailyLimit: number
  usedToday: number
  remaining: number
  maxRows: number
  denied: boolean
}

/**
 * Open a metered scan. Returns null when the Supabase client is unavailable
 * (the caller then reports an engine error rather than a quota one), throws on
 * an RPC failure the UI cannot reason about, and otherwise hands back the
 * quota row — including `denied: true` when the day's allowance is spent.
 */
export async function beginBulkScan(): Promise<BulkQuota | null> {
  if (!db) return null
  const { data, error } = await db.rpc('begin_bulk_scan')
  if (error) throw error
  const row: any = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('begin_bulk_scan returned no row')
  return {
    scanId: row.scan_id ?? null,
    tier: row.tier === 'pro' ? 'pro' : 'free',
    dailyLimit: Number(row.daily_limit) || 0,
    usedToday: Number(row.used_today) || 0,
    remaining: Number(row.remaining) || 0,
    maxRows: Number(row.max_rows) || 0,
    denied: !!row.denied,
  }
}

/**
 * Read-only quota (bulk_quota_status): the "X of Y left today" line, safe to
 * call on mount because it never mints a scan_id or spends an allowance.
 */
export async function fetchBulkQuota(): Promise<Omit<BulkQuota, 'scanId' | 'denied'> | null> {
  if (!db) return null
  const { data, error } = await db.rpc('bulk_quota_status')
  if (error) throw error
  const row: any = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    tier: row.tier === 'pro' ? 'pro' : 'free',
    dailyLimit: Number(row.daily_limit) || 0,
    usedToday: Number(row.used_today) || 0,
    remaining: Number(row.remaining) || 0,
    maxRows: Number(row.max_rows) || 0,
  }
}

// Rows past this are rejected up front: one file should not turn the tab into
// a minutes-long loop with nothing but a counter to show for it.
export const BULK_MAX_ROWS = 10000

// lookup_intel_batch's own MAX_ITEMS cap (db/lookup_intel_batch.sql) is 500,
// and it RAISES rather than truncating — so these two must not drift apart.
const BATCH_CHUNK = 500

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

/** One BulkRow from a corpus verdict, in the shape the ledger and CSV expect. */
function toBulkRow(value: string, v: IntelVerdict): BulkRow {
  return {
    value,
    type: v.type,
    isMalicious: !!v.isMalicious,
    // Same precedence the old two-phase version produced: the >=3 dispute
    // flip wins over the raw malicious flag.
    status: v.isMalicious ? 'malicious' : (v.isDisputed ? 'disputed' : 'clean'),
    riskScore: v.riskScore,
    feedCount: v.feedCount,
    tags: v.tags ?? [],
    sources: v.sources ?? [],
    matchedCidr: v.matchedCidr ?? null,
    relatedMatch: v.relatedMatch ?? null,
    disputeCount: v.disputeCount ?? 0,
  }
}

function errorRow(value: string, message: string): BulkRow {
  return { value, type: 'unknown', isMalicious: false, status: 'error', riskScore: 'Low', feedCount: 1, tags: [], sources: [], matchedCidr: null, relatedMatch: null, disputeCount: 0, error: message }
}

/**
 * Scan rows in chunks against lookup_intel_batch.
 *
 * Verdicts stream to the caller row by row so the ledger animates, but they
 * ARRIVE a chunk at a time — hence the yield every 25 rows here rather than
 * one yield per chunk. Without it a 500-row burst would land in a single task
 * and the UI would jump instead of filling.
 *
 * The >=3 dispute rule needs no second pass: lookup_intel_batch returns
 * dispute_count per value (the same count the single-value function computes)
 * and rowToVerdict applies the flip. This function used to end with its own
 * batched `disputes` query — that went away with the feed dependency, along
 * with a full network round trip per 200 rows after every scan.
 *
 * Chunk size is bounded by the function's MAX_ITEMS, not by the 8 s
 * authenticated statement_timeout — 500 items measures ~1.2 s in-database, so
 * there is roughly 6x headroom. Re-measure before raising it.
 */
export async function runBulkScan(
  rows: string[],
  scanId: string | null,
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
  onRow?: (row: BulkRow) => void,
): Promise<BulkRow[]> {
  const results: BulkRow[] = []

  if (!db) {
    // Mirrors an unreachable scan engine: report every row as an error rather
    // than letting unverifiable indicators render as clean.
    for (const value of rows) results.push(errorRow(value, 'Scan engine unavailable'))
    onProgress?.(rows.length, rows.length)
    return results
  }
  const sb = db

  for (let start = 0; start < rows.length; start += BATCH_CHUNK) {
    if (shouldAbort?.()) break
    const chunk = rows.slice(start, start + BATCH_CHUNK)

    // Classify and derive pivots here, not in SQL — the same helpers the
    // single Hunt uses, so the corpus is asked the same question either way.
    const prepared = chunk.map((value) => {
      const c = classifyIndicator(value)
      const { host, parents } = pivotCandidates(c)
      return { value, c, host, parents }
    })

    const byValue = new Map<string, IntelRow>()
    let failure: string | null = null
    try {
      const { data, error } = await sb
        .rpc('lookup_intel_batch', {
          p_items: prepared.map((p) => ({ value: p.c.ip, parents: p.parents })),
          p_scan_id: scanId,
        })
        .abortSignal(AbortSignal.timeout(30_000))
      if (error) throw error
      ;((data ?? []) as IntelRow[]).forEach((row) => {
        if (row.input_value) byValue.set(row.input_value, row)
      })
    } catch (err: any) {
      // One failed chunk fails its own rows only — the rest of the file still
      // gets scanned, which is why this is not a throw.
      failure = err?.message || 'Scan failed'
    }

    for (const p of prepared) {
      if (shouldAbort?.()) break
      const base = intelBase(p.c)
      let row: BulkRow
      if (failure) {
        row = errorRow(p.value, failure)
      } else if (base.type === 'invalid') {
        row = toBulkRow(p.value, invalidVerdict(base))
      } else {
        const hit = byValue.get(p.c.ip)
        row = toBulkRow(p.value, hit ? rowToVerdict(base, p.c, p.host, hit) : cleanVerdict(base))
      }
      results.push(row)
      onRow?.(row)
      // Once the chunk is in hand each row is pure CPU behind a resolved
      // await, which stays in the microtask queue and starves painting. A real
      // macrotask yield every 25 rows lets the ledger stream and Stop respond.
      if (results.length % 25 === 0) await new Promise((r) => setTimeout(r, 0))
    }

    onProgress?.(results.length, rows.length)
    await new Promise((r) => setTimeout(r, 0))
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
