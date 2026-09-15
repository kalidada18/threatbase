/**
 * Shared utilities for Cloudflare Pages Functions.
 *
 * Consolidates CORS origin validation and HTML sanitisation that were
 * previously duplicated between functions/api/community-report.ts and
 * functions/api/v1/report.ts.
 */

const ALLOWED_ORIGIN = 'https://threatbase.qzz.io'

/**
 * Strict dev-origin check: exact host + optional port only.
 * A prefix match (startsWith) would also accept suffix tricks like
 * `http://localhost.attacker.com`, which this regex rejects.
 */
function isDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)
}

/** Return the CORS-safe origin string for a given request. */
export function resolveAllowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || ''
  return origin === ALLOWED_ORIGIN || isDevOrigin(origin) ? origin : ALLOWED_ORIGIN
}

/** Build CORS response headers for a given request. */
export function corsHeaders(
  request: Request,
  methods = 'POST, OPTIONS',
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(request),
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

/** Minimal server-side HTML sanitiser — strips all HTML tags. */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

/** Convenience JSON response builder with CORS headers. */
export const json = (
  obj: unknown,
  status = 200,
  request?: Request,
) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(request
        ? corsHeaders(request)
        : { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN }),
    },
  })

/** Hostnames allowed to mint Turnstile tokens, e.g. 'threatbase.qzz.io'.
 *  Configure on the Pages project: TURNSTILE_HOSTNAMES (comma-separated).
 *  Production values must exclude localhost/127.0.0.1 — add them only in .env
 *  for local `wrangler pages dev`. */
export const TURNSTILE_HOSTNAMES_DEFAULT = 'threatbase.qzz.io'

/**
 * Verify a Turnstile token against Cloudflare's siteverify API. The siteverify
 * call must originate from the backend, never the browser. Tokens are
 * single-use: a replayed or expired token fails here with invalid-codes
 * ['timeout-or-duplicate'].
 *
 * Pass `expectedAction` (the widget's data-action, e.g. 'login') and an
 * `allowedHostnames` string (comma-separated) to bind the token to the surface
 * and site it was minted on; pass '' to skip the respective check.
 * Secret lives ONLY in env: TURNSTILE_SECRET (set via `wrangler pages secret
 * put TURNSTILE_SECRET`). Never hardcode or forward it to the client.
 */
export async function verifyTurnstile(
  token: unknown,
  ip: string,
  secret: string | undefined,
  expectedAction = '',
  allowedHostnames = '',
): Promise<{ ok: boolean; reason?: string }> {
  if (!secret) return { ok: false, reason: 'not-configured' }
  if (typeof token !== 'string' || !token || token.length > 2048) {
    return { ok: false, reason: 'missing' }
  }
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  let data: any
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
    data = await res.json()
  } catch {
    return { ok: false, reason: 'siteverify-unreachable' }
  }
  if (data?.success !== true) return { ok: false, reason: 'invalid' }
  if (expectedAction && data.action !== expectedAction) return { ok: false, reason: 'wrong-action' }
  if (allowedHostnames) {
    const hosts = allowedHostnames.split(',').map((s) => s.trim()).filter(Boolean)
    if (hosts.length && !hosts.includes(data.hostname)) return { ok: false, reason: 'wrong-hostname' }
  }
  return { ok: true }
}
