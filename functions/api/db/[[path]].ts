/**
 * /api/db/* — the browser-facing PostgREST proxy (Phase 2).
 *
 * The browser calls `${origin}/api/db/rest/v1/<table>` with only the tb_session
 * cookie. This route resolves that cookie, decrypts the caller's own Supabase
 * access token, and relays the request to the real project with it. Row Level
 * Security therefore still decides every result: the proxy adds no privilege, it
 * only moves where the credential lives.
 *
 * Deliberate properties, each of which is a decision rather than an oversight:
 *
 *  - The upstream credential is the USER's token, never the service role.
 *    See forwardRequestHeaders in _dbProxy.ts for the failure mode.
 *  - tb_session terminates here. It is never forwarded upstream, so it cannot
 *    land in a PostgREST or Kong log.
 *  - No response caching. Every request is an authenticated read of live data;
 *    a cache hit here would be a stale-permission bug.
 *  - Fail closed. Unresolved session -> 401, backend down -> 503, path outside
 *    the allowlist -> 404. There is no anonymous fallback and no "best effort"
 *    pass-through, because the caller on the other side is a browser we do not
 *    trust.
 *
 * Phase 2 boundary, stated plainly: the browser still owns token REFRESH (its
 * supabase-js session is what gets rotated), and this route never refreshes
 * anything itself. If it did, two independent refreshers would race on the same
 * refresh-token family — GoTrue's reuse detection would revoke the family, and
 * every tab would silently log out. That is the exact failure supabaseClient.ts
 * documents for multi-tab, and a proxy would have reproduced it server-side.
 * So an expired credential here returns 401 and the client re-handoffs (see
 * src/lib/dbClient.ts) rather than the edge improvising a refresh. Phase 3
 * moves refresh ownership here for real, once the browser no longer has a
 * session to refresh.
 */
import { json, corsHeaders } from '../_common'
import { isTrustedOrigin, requireSession } from '../_session'
import { SUPABASE_URL } from '../../../src/lib/supabaseConfig'
import {
  bodyTooLarge,
  filterResponseHeaders,
  forwardRequestHeaders,
  NO_CREDENTIAL_ERROR,
  resolveUpstream,
} from '../_dbProxy'

const UPSTREAM_TIMEOUT_MS = 30_000

const METHODS = 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS'

export const onRequestOptions = async (context: any) => {
  const { request } = context
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, METHODS),
      'Access-Control-Allow-Headers': 'Content-Type, Prefer, Accept, Range, X-Client-Info',
      'Access-Control-Max-Age': '600',
    },
  })
}

const onRequestAny = async (context: any) => {
  const { request, env } = context
  const method = request.method.toUpperCase()

  // Same-origin fetch sends an Origin on every method, so this costs a real
  // request nothing and closes the same-site hole SameSite=Lax leaves open (a
  // page on one of our own subdomains, or an XSS on this one).
  if (method !== 'GET' && method !== 'HEAD' && !isTrustedOrigin(request)) {
    return json({ error: 'cross-origin request rejected' }, 403, request)
  }

  const resolved = await requireSession(context)
  if (resolved.response) return resolved.response
  const { session } = resolved

  const accessToken = session.accessToken
  if (!accessToken) {
    // A live session with no credential: the client can fix this by handing off
    // again, so it gets 401 (its retry hook) rather than 503 (a server fault).
    return json({ error: NO_CREDENTIAL_ERROR }, 401, request)
  }

  const incoming = new URL(request.url)
  const target = resolveUpstream(incoming.pathname, env?.SUPABASE_URL || SUPABASE_URL)
  if (!target) return json({ error: 'unsupported data path' }, 404, request)
  // Query is the query language here — `?select=`, `?id=eq.` — so it relays
  // verbatim, after the path itself has been validated.
  const upstreamUrl = target.url + incoming.search

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text().catch(() => null) ?? undefined
    if (bodyTooLarge(body)) {
      return json({ error: 'request body too large' }, 413, request)
    }
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: forwardRequestHeaders(request, accessToken),
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    // Timeout and DNS/TLS failure are indistinguishable from the client's point
    // of view, and neither should read as "signed out".
    console.error('db proxy upstream failed:', err instanceof Error ? err.message : err)
    return json({ error: 'data backend unavailable' }, 502, request)
  }

  const payload = await upstream.arrayBuffer()
  const headers = filterResponseHeaders(upstream.headers)
  for (const [key, value] of Object.entries(corsHeaders(request, METHODS))) {
    headers.set(key, value)
  }
  // Status passes through untouched on purpose: PostgREST's 404 (no rows for an
  // RPC), 409 (uniqueness) and 400 (validation) are information the app's own
  // error handling already speaks.
  return new Response(payload, { status: upstream.status, headers })
}

export const onRequestGet = onRequestAny
export const onRequestHead = onRequestAny
export const onRequestPost = onRequestAny
export const onRequestPatch = onRequestAny
export const onRequestPut = onRequestAny
export const onRequestDelete = onRequestAny
