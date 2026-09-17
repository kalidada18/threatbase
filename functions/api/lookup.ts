/**
 * GET /api/lookup?value=<indicator> — one-indicator verdict, computed server-side.
 *
 * Why this exists: a browser hunt for a domain/URL downloaded whole 36 MB feed
 * chunks just to binary-search one line, and a cold tab paid that per page load.
 * The answer is ~200 bytes. The verdict comes from the Supabase corpus via
 * scanIndicatorIntel (one indexed lookup, no multi-MB download), is cached in
 * IOC_CACHE (1 h TTL — the corpus is refreshed after each feed update, so the
 * TTL is the freshness ceiling we accept), and served from KV.
 * 36 MB now moves once per cold CF isolate over the backbone, not per visitor.
 *
 * Public + unauthenticated on purpose — this is the free Hunt button's backend
 * (/api/v1/scan cannot serve the browser: its middleware requires x-api-key).
 * Abuse is bounded by a per-IP daily counter, same read-modify-write pattern as
 * the MCP server and v1 middleware. The counter read fails open (a KV blip must
 * not 500 every hunt; CF sits in front for flood).
 */
import { classifyIndicator } from '../../src/scanner'
import { scanIndicatorIntel } from './_intel'
import { MAX_INDICATOR_LENGTH } from '../../src/lib/apiValidation'
import { json, corsHeaders, ensureAbsoluteFetch } from './_common'

const LOOKUP_DAILY_LIMIT = 500
const LOOKUP_TTL = 3600 // 1 h

export const onRequestOptions = async (context: any) => {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(context.request, 'GET, OPTIONS'),
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  ensureAbsoluteFetch() // relative '/ioc/...' feed fetches inside scanner.ts

  const value = new URL(request.url).searchParams.get('value') || ''
  if (!value || value.length > MAX_INDICATOR_LENGTH) {
    return json({ error: 'Missing or oversized "value" parameter.' }, 400, request)
  }
  if (classifyIndicator(value).type === 'invalid') {
    return json({ error: 'Invalid indicator format.' }, 400, request)
  }

  const kv = env.IOC_CACHE
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const today = new Date().toISOString().split('T')[0]
  const rlKey = `fl_lookup_${ip}_${today}`
  const cacheKey = `lookup/${today}/${value.toLowerCase()}`

  // read-modify-write like every other gate here: a fast flood overshoots by a
  // handful, not by 1000x. Fetched once and reused for the HIT/MISS bumps.
  let rlCount = 0
  if (kv) {
    try {
      const cur = await kv.get(rlKey)
      if (cur && parseInt(cur, 10) >= LOOKUP_DAILY_LIMIT) {
        return json({ error: 'Daily lookup limit reached for your network. Try again tomorrow.' }, 429, request)
      }
      rlCount = parseInt(cur as string | null, 10) || 0
    } catch {
      /* fail open: losing the limiter beats failing hunts */
    }

    try {
      const hit = await kv.get(cacheKey)
      if (hit) {
        context.waitUntil(kv.put(rlKey, String(rlCount + 1), { expirationTtl: 86400 }).catch(() => {}))
        return new Response(hit, { headers: { 'Content-Type': 'application/json', ...corsHeaders(request), 'X-KV-Cache': 'HIT' } })
      }
    } catch { /* KV read miss behaves like a cold cache */ }
  }

  // scanIndicatorIntel falls back to the feed scanner internally, so the only
  // way to land here is a failure of both.
  let result: unknown
  try {
    result = await scanIndicatorIntel(value)
  } catch (err: any) {
    console.error('api/lookup scan failed:', err?.message || err)
    return json({ error: 'Lookup failed. Try again shortly.' }, 500, request)
  }

  if (kv) {
    context.waitUntil(kv.put(rlKey, String(rlCount + 1), { expirationTtl: 86400 }).catch(() => {}))
    const body = JSON.stringify({ success: true, data: result })
    context.waitUntil(kv.put(cacheKey, body, { expirationTtl: LOOKUP_TTL }).catch(() => {}))
    return new Response(body, { headers: { 'Content-Type': 'application/json', ...corsHeaders(request), 'X-KV-Cache': 'MISS' } })
  }

  return json({ success: true, data: result }, 200, request)
}
