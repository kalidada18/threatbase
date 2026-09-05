/**
 * /feed/<token>/<path> — Threatbase Pro feed delivery.
 *
 * Token-in-URL (not a header) because the firewalls we sell to — pfBlockerNG,
 * MikroTik RSP, OPNsense — auto-update from a plain URL and cannot attach
 * auth headers. The token is the API key itself; we SHA-256 it here and check
 * it against api_keys via validate_feed_token (SECURITY DEFINER, service-role
 * only — same pattern as functions/api/v1/_middleware.ts).
 *
 * Security notes (deliberate tradeoffs):
 *  - Tokens in URLs can land in request logs. Mitigation: keys are user-
 *    revocable (is_active) from the Profile page. Upgrade path if it ever
 *    matters: short-lived signed URLs.
 *  - Revocation lag: responses are KV-cached per-token for PRO_TTL, so a
 *    revoked key can still hit cache for up to PRO_TTL. Acceptable for
 *    blocklists; a 401/403 is never cached.
 *
 * What makes this "Pro" vs the free /ioc mirror: 15-min freshness (vs 6 h)
 * and stable per-category / firewall-format URLs under one revocable token.
 */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../src/lib/supabaseConfig'

const RAW_BASE = 'https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/'
const PRO_TTL = 900 // 15 min — the freshness delta we charge for
const KV_MAX = 25_000_000 // Cloudflare KV hard limit per value
const DAILY_FETCH_LIMIT = 500 // firewalls polling hourly use ~24/day

// Serve only blocklist products; never let the mirror read arbitrary repo files.
const ALLOWED_PREFIXES = ['ip/', 'firewall/']
const ALLOWED_EXACT = ['data/false_positives.txt']

/**
 * The Pro-only products live in a PRIVATE repo (default kalidada18/threatbase-pro,
 * pushed by .github/workflows/update-feed.yml), because a public origin means the
 * paywall is decorative — anyone could hotlink raw.githubusercontent.com and skip
 * this Worker entirely. Everything else still comes from the public mirror.
 */
const PAID_PREFIXES = ['ip/categories/', 'firewall/']
const isPaid = (rel: string) => PAID_PREFIXES.some((p) => rel.startsWith(p))

/**
 * Private-repo read. The Contents API with the `raw` media type streams the file
 * (up to 100 MB, so it clears our 36 MB worst case) and 302s to a signed URL that
 * fetch() follows. `?ref=` is omitted: the workflow force-pushes an orphan commit
 * to the default branch each run, so HEAD is always the fresh snapshot.
 */
const fetchPaid = (rel: string, env: any) =>
  fetch(`https://api.github.com/repos/${env.PRO_REPO || 'kalidada18/threatbase-pro'}/contents/${rel}`, {
    headers: {
      Authorization: `Bearer ${env.PRO_REPO_TOKEN}`,
      Accept: 'application/vnd.github.raw',
      'User-Agent': 'threatbase-pro-feed',
    },
  })

const headers = (contentType?: string | null) => ({
  'Content-Type': contentType || 'text/plain; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'private, max-age=60', // browsers/cdn must not out-cache KV
})

const err = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...headers('application/json') } })

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: headers() })
}

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const segments: string[] = context.params.path || []
  const [token, ...rest] = segments
  const rel = decodeURIComponent(rest.join('/'))

  if (!token || !rel || rel.includes('..')) return err('Not found', 404)
  const allowed = ALLOWED_PREFIXES.some((p) => rel.startsWith(p)) || ALLOWED_EXACT.includes(rel)
  if (!allowed) return err('Feed not available', 404)

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing — Pro feed down.')
    return err('Feed service temporarily unavailable.', 503)
  }

  // 1. Authenticate the token (SHA-256 — keys are stored hashed).
  const hashHex = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
  ).map((b) => b.toString(16).padStart(2, '0')).join('')

  const admin = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey)
  const { data, error } = await admin.rpc('validate_feed_token', { client_hash: hashHex })
  const row = data?.[0]
  if (error || !row) return err('Invalid or revoked key.', 401)
  if (!row.is_pro) return err('This is a Threatbase Pro feed. Email threatbasepro@gmail.com to activate.', 403)

  // 2. Abuse cap — per-key daily fetch counter (KV, same as free mirror).
  const kv = env.IOC_CACHE
  if (kv) {
    const today = new Date().toISOString().split('T')[0]
    const rlKey = `rl_feed_${hashHex}_${today}`
    const count = parseInt((await kv.get(rlKey)) || '0', 10)
    if (count >= DAILY_FETCH_LIMIT) return err('Daily fetch limit reached.', 429)
    context.waitUntil(kv.put(rlKey, (count + 1).toString(), { expirationTtl: 86400 }).catch(() => {}))
  }

  // 3. Serve: KV cache -> GitHub raw (identical strategy to functions/ioc).
  const cacheKey = 'profeed/' + hashHex + '/' + rel
  if (kv) {
    try {
      const hit = await kv.get(cacheKey, 'arrayBuffer')
      if (hit) return new Response(hit, { headers: { ...headers(), 'X-KV-Cache': 'HIT' } })
    } catch { /* KV read failure must not take down the feed */ }
  }

  const paid = isPaid(rel)
  if (paid && !env.PRO_REPO_TOKEN) {
    console.error('PRO_REPO_TOKEN missing — paid feeds unreachable.')
    return err('Feed service temporarily unavailable.', 503)
  }
  const upstream = paid
    ? await fetchPaid(rel, env)
    : await fetch(RAW_BASE + rel, { headers: { 'User-Agent': 'threatbase-pro-feed' } })

  // A 404 from the private repo means the pipeline has not published that file
  // (or the token lost access) — don't leak the upstream body to the customer.
  if (paid && upstream.status === 404) return err('Feed not available', 404)

  // Unknown length: stream through rather than buffer. Costs a KV miss per
  // request, which beats risking the Worker's 128 MB memory ceiling.
  const len = Number(upstream.headers.get('Content-Length') || 0)
  if (!kv || upstream.status !== 200 || !len || len > KV_MAX) {
    return new Response(upstream.body, { status: upstream.status, headers: headers(upstream.headers.get('Content-Type')) })
  }

  const buf = await upstream.arrayBuffer()
  let hd = headers(upstream.headers.get('Content-Type'))
  if (buf.byteLength <= KV_MAX) {
    context.waitUntil(kv.put(cacheKey, buf, { expirationTtl: PRO_TTL }).catch(() => {}))
    hd = { ...hd, 'X-KV-Cache': 'MISS-STORED' }
  }
  return new Response(buf, { headers: hd })
}
