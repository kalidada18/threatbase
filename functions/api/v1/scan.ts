import { validateTypedIndicator } from '../../../src/scanner'
import { scanIndicatorIntel } from '../_intel'
import { MAX_INDICATOR_LENGTH } from '../../../src/lib/apiValidation'
import { json, ensureAbsoluteFetch } from '../_common'

/** Batch size cap for POST /scan. The middleware rate-limits per request, so
 *  without a cap one "request" could hide an arbitrarily large scan fan-out. */
const MAX_BATCH_SIZE = 100

/**
 * POST /api/v1/scan — scan multiple typed indicators in one request.
 * Each item is { type, value } with type one of ipv4|ipv6|domain|url|md5|sha1|sha256.
 * Structural problems (bad JSON, missing/oversized array) are a 400; per-item
 * validation failures come back as status:"error" entries so callers still get
 * one result per submitted indicator.
 */
async function handleBatchScan(request: Request, env: any, ctx: any) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const indicators = body?.indicators
  if (!Array.isArray(indicators) || indicators.length === 0) {
    return json({ error: "Body must contain a non-empty 'indicators' array" }, 400)
  }
  if (indicators.length > MAX_BATCH_SIZE) {
    return json({ error: `Too many indicators (max ${MAX_BATCH_SIZE} per request)` }, 400)
  }

  // Charge the batch per item, not per request: the middleware already billed
  // 1 unit against context.data.rlKey, so top the bucket up by items-1. Without
  // this, 100 sequential DB-touching lookups cost the same as 1 single-IP GET.
  const rlKey: string | undefined = ctx?.data?.rlKey
  if (rlKey && env.IOC_CACHE && indicators.length > 1) {
    try {
      const kv = env.IOC_CACHE
      const cur = await kv.get(rlKey)
      const count = cur ? parseInt(cur, 10) : 1
      await kv.put(rlKey, (count + indicators.length - 1).toString(), { expirationTtl: 86400 })
    } catch (err) {
      console.error('batch rate top-up failed:', err)
    }
  }

  const results: any[] = []
  // Sequential on purpose: each lookup hits the same Supabase corpus and the
  // per-isolate client, so a Promise.all fan-out buys little while making the
  // 100-item cap burst the connection pool. Kept from the feed-scanning days,
  // when item N+1 reused the multi-MB download item N paid for.
  for (const ind of indicators) {
    const { type, value } = ind ?? {}
    if (typeof type !== 'string' || typeof value !== 'string') {
      results.push({ type: type ?? null, value: value ?? null, malicious: false, status: 'error', error: 'Each indicator needs string "type" and "value"' })
      continue
    }
    if (value.length > MAX_INDICATOR_LENGTH) {
      results.push({ type, value, malicious: false, status: 'error', error: `Indicator is too long (max ${MAX_INDICATOR_LENGTH} characters).` })
      continue
    }
    const validated = validateTypedIndicator(type, value)
    if ('error' in validated) {
      results.push({ type, value, malicious: false, status: 'error', error: validated.error })
      continue
    }
    try {
      const r = await scanIndicatorIntel(validated.value)
      results.push({
        type: type.trim().toLowerCase(),
        value: validated.value,
        malicious: r.isMalicious,
        status: r.isMalicious ? 'malicious' : r.isDisputed ? 'disputed' : 'clean',
        riskScore: r.riskScore,
        feedCount: r.feedCount,
        tags: r.tags,
        sources: r.sources,
        matchedCidr: r.matchedCidr,
        relatedMatch: r.relatedMatch,
        disputeCount: r.disputeCount,
      })
    } catch (err: any) {
      console.error('POST /api/v1/scan item failed:', err?.message || err)
      results.push({ type, value, malicious: false, status: 'error', error: 'Failed to process indicator' })
    }
  }

  return json({ results, total: results.length })
}

export const onRequest = async (context: any) => {
  const { request } = context;

  // Without this, scanIndicatorLogic's relative '/ioc/...' feed fetches fail to
  // resolve inside a Pages Function, every feed reads empty, and every answer
  // is a silent "clean". Must run before the first scan on this isolate.
  ensureAbsoluteFetch()

  if (request.method === 'POST') {
    try {
      return await handleBatchScan(request, context.env, context)
    } catch (err: any) {
      console.error('POST /api/v1/scan failed:', err?.message || err);
      return json({ error: 'Failed to process request' }, 500)
    }
  }

  const url = new URL(request.url);
  const ip = url.searchParams.get('ip') || url.searchParams.get('indicator');

  if (!ip) {
    return json({ error: "Missing 'ip' parameter" }, 400)
  }

  if (ip.length > MAX_INDICATOR_LENGTH) {
    return json({ error: `Indicator is too long (max ${MAX_INDICATOR_LENGTH} characters).` }, 400)
  }

  try {
    const result = await scanIndicatorIntel(ip);
    return json({ success: true, data: result })
  } catch (err: any) {
    console.error('GET /api/v1/scan failed:', err?.message || err);
    return json({ error: "Failed to process request" }, 500)
  }
}
