import { scanIndicatorLogic, validateTypedIndicator } from '../../../src/scanner'
import { MAX_INDICATOR_LENGTH } from '../../../src/lib/apiValidation'

/** Batch size cap for POST /scan. The middleware rate-limits per request, so
 *  without a cap one "request" could hide an arbitrarily large scan fan-out. */
const MAX_BATCH_SIZE = 100

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * POST /api/v1/scan — scan multiple typed indicators in one request.
 * Each item is { type, value } with type one of ipv4|ipv6|domain|url|md5|sha1|sha256.
 * Structural problems (bad JSON, missing/oversized array) are a 400; per-item
 * validation failures come back as status:"error" entries so callers still get
 * one result per submitted indicator.
 */
async function handleBatchScan(request: Request) {
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

  const results: any[] = []
  // Sequential on purpose: scanIndicatorLogic warms a process-wide feed cache,
  // so item N+1 usually skips the download item N paid for. Promise.all over a
  // cold isolate would race that cache and fetch the same big feed many times.
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
      const r = await scanIndicatorLogic(validated.value, 'latest')
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

  if (request.method === 'POST') {
    try {
      return await handleBatchScan(request)
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
    const result = await scanIndicatorLogic(ip, 'latest');
    return json({ success: true, data: result })
  } catch (err: any) {
    console.error('GET /api/v1/scan failed:', err?.message || err);
    return json({ error: "Failed to process request" }, 500)
  }
}
