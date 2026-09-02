/**
 * Shared utilities for Cloudflare Pages Functions.
 *
 * Consolidates CORS origin validation and HTML sanitisation that were
 * previously duplicated between functions/api/community-report.ts and
 * functions/api/v1/report.ts.
 */

export const ALLOWED_ORIGIN = 'https://threatbase.qzz.io'

/**
 * Strict dev-origin check: exact host + optional port only.
 * A prefix match (startsWith) would also accept suffix tricks like
 * `http://localhost.attacker.com`, which this regex rejects.
 */
export function isDevOrigin(origin: string): boolean {
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
