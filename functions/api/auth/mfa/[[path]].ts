/**
 * /api/auth/mfa/* — the browser-facing MFA proxy (Phase 3b).
 *
 * The browser calls `${origin}/api/auth/mfa/factors[...]` with only the
 * tb_session cookie. This route resolves that cookie, decrypts the caller's own
 * Supabase access token, and presents IT to GoTrue's factor endpoints — exactly
 * the move /api/db makes against PostgREST, applied to auth. The credential stops
 * living in the browser for these flows, which is the prerequisite for
 * `persistSession: false`.
 *
 * WHY THE USER'S TOKEN AND NEVER THE SERVICE ROLE. GoTrue's /factors endpoints
 * authorise a factor against the authenticated user in the Bearer token. An
 * admin credential here would let any signed-in session enroll, challenge,
 * verify or delete a factor belonging to somebody else. mfaUpstreamHeaders
 * pins this; the comment in _mfaProxy.ts carries the failure mode.
 *
 * THE RESPONSE IS AN ALLOWLIST PROJECTION, NOT A PASSTHROUGH. A verify returns
 * a COMPLETE NEW TOKEN SET. None of it may reach the page: `isTrustedOrigin`
 * accepts same-origin JS by design, so echoing a live aal2 token would rebuild
 * the exact theft the cookie exists to prevent. projectMfaResponse drops every
 * unnamed field, and the fresh pair produced by a verify is persisted HERE
 * (rotateSession -> new row behind a new Set-Cookie) rather than returned. This
 * is the same no-token-oracle rule refresh.ts states in its header, enforced for
 * the one flow that actually mints a credential worth stealing.
 *
 * 3b SHIPS WITH THE persistSession:false FLIP, NOT BEFORE IT. A server-side
 * verify supersedes the browser's aal1 refresh token; if auth-js still holds a
 * session it will later replay that spent token, GoTrue reuse detection revokes
 * the whole family, and — because the rotated aal2 row inherits the same
 * family_id — the account logs itself out shortly after completing 2FA. While
 * the browser still owns a session that race is live; once it owns nothing but
 * the cookie there is no stale tail to replay. Kept explicit so nobody deploys
 * this route alone and files the logout as a mystery.
 *
 * Fails closed on every ambiguous state: unresolvable session -> 401/503, path
 * outside the fixed operation set -> 404 (before any session check or upstream
 * call), and an upstream error is mapped by mapMfaError rather than relayed raw.
 */
import { json, corsHeaders } from '../../_common'
import {
  isTrustedOrigin,
  requireSession,
  refreshSessionWithLease,
  rotateSession,
  jsonResponse,
  readJson,
  buildSessionCookie,
} from '../../_session'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../../src/lib/supabaseConfig'
import {
  buildMfaRequest,
  mfaUpstreamHeaders,
  mfaUpstreamUrl,
  mapMfaError,
  projectMfaResponse,
  resolveMfaRoute,
  rotatesSession,
  tokenNeedsRenewal,
} from '../_mfaProxy'

const UPSTREAM_TIMEOUT_MS = 15_000

const METHODS = 'GET, POST, DELETE, OPTIONS'

export const onRequestOptions = async (context: any) => {
  const { request } = context
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, METHODS),
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    },
  })
}

const onRequestAny = async (context: any) => {
  const { request, env } = context
  const method = request.method.toUpperCase()

  // Same-origin POST/DELETE always carry an Origin; requiring it (and trusting
  // only our own hosts) is the second CSRF layer behind SameSite=Lax, and it
  // catches the same-site hole Lax leaves open. GET is a pure read of the
  // caller's own factors, so it is not gated — but it changes nothing.
  if (method !== 'GET' && method !== 'HEAD' && !isTrustedOrigin(request)) {
    return json({ error: 'cross-origin request rejected' }, 403, request)
  }

  // Resolve the operation BEFORE touching the session store or GoTrue. An
  // unknown path is a 404 that costs no authenticated DB read and no rate-
  // limited upstream call, so a scan of this prefix reveals nothing about
  // whether a cookie is live.
  const pathname = new URL(request.url).pathname
  const route = resolveMfaRoute(pathname, method)
  if (!route) return json({ error: 'unsupported mfa operation' }, 404, request)

  // MFA is never anonymous: there is no factor to list or enroll without a user.
  const resolved = await requireSession(context)
  if (resolved.response) return resolved.response
  const session = resolved.session
  const admin = resolved.admin

  // Removing a factor is not a read. GoTrue refuses to unenroll a user's last
  // verified factor unless the presenting session has itself cleared a second
  // factor (aal2), so a password-only session cannot strip 2FA — the exact
  // privilege-escalation guard that makes MFA worth having. Enforce the same rule
  // at the edge and answer honestly rather than relaying GoTrue's opaque 422
  // ("could not validate the request"): `aal_required` lets the client prompt for
  // a code and retry from an aal2 session instead of showing a dead-end error.
  if (route.op === 'unenroll' && session.aal !== 'aal2') {
    return json(
      { error: 'Verify your two-factor code to change this setting.', aal_required: true },
      403,
      request,
    )
  }

  // A live session with no stored credential cannot act as the user. 401 (not
  // 403) so the client's existing retry hook re-handoffs rather than showing a
  // dead-end error.
  let accessToken = session.accessToken
  if (!accessToken) {
    return json({ error: 'no stored credential', retry: true }, 401, request)
  }

  // The proxy owns refresh for these calls now that the browser may not. If the
  // stored token is within TOKEN_SKEW_SECONDS of expiry, renew it under the
  // lease before presenting it: a round-trip certain to 401 is worse than the
  // one extra refresh it prevents. The commit already wrote the new pair to the
  // row, so the local variable is the only place it needs to exist for this
  // request.
  if (tokenNeedsRenewal(accessToken)) {
    const out = await refreshSessionWithLease(admin, env, session)
    if (out.status === 'refreshed' && out.accessToken) {
      accessToken = out.accessToken
    } else if (out.status === 'busy') {
      return json({ error: 'session refresh already in progress', retry: true }, 503, request)
    } else if (out.status === 'dead' || out.status === 'invalid-grant') {
      return json({ error: 'sign in required', reauth: true }, 401, request)
    } else {
      // 'upstream' / 'unavailable' / 'invalid': our or GoTrue's availability, not
      // the user's. Never charge it to them as a broken authenticator.
      return json({ error: 'identity provider unavailable', retry: true }, 503, request)
    }
  }

  // `list` makes no MFA request upstream. auth-js's own listFactors() is a
  // getUser() + a client-side bucket; we do the getUser() here and return every
  // factor WITH ITS STATUS (projectMfaResponse explains why being wider than
  // auth-js's verified-only buckets is the point).
  if (route.op === 'list') {
    let user: any
    try {
      const { data, error } = await admin.auth.getUser(accessToken)
      if (error || !data?.user) {
        return json({ error: 'session expired', retry: true }, 401, request)
      }
      user = data.user
    } catch (err) {
      console.error('mfa list getUser failed:', err instanceof Error ? err.message : err)
      return json({ error: 'identity provider unavailable', retry: true }, 503, request)
    }
    return jsonResponse(projectMfaResponse('list', user), 200, request, [])
  }

  // buildMfaRequest is the input allowlist: only named fields reach GoTrue, and
  // a bad shape returns an error string rather than throwing (a malformed OTP is
  // a normal user action, not a crash).
  const input = method === 'GET' || method === 'HEAD' ? null : await readJson(request)
  const built = buildMfaRequest(route, input)
  if (built.error) return json({ error: built.error }, 400, request)

  const baseUrl = env?.SUPABASE_URL || SUPABASE_URL
  const upstreamUrl = mfaUpstreamUrl(route, baseUrl)
  if (!upstreamUrl) {
    // A misconfigured project URL, not a user error. Same 503 convention as the
    // mint route's "identity provider unreachable".
    return json({ error: 'identity provider not configured', retry: true }, 503, request)
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: route.op === 'unenroll' ? 'DELETE' : 'POST',
      headers: mfaUpstreamHeaders(accessToken, env?.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY),
      body: built.body ? JSON.stringify(built.body) : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('mfa proxy upstream failed:', err instanceof Error ? err.message : err)
    return json({ error: 'identity provider unavailable', retry: true }, 502, request)
  }

  const payload = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    const mapped = mapMfaError(upstream.status, payload)
    return json({ error: mapped.message, retry: mapped.retry || undefined }, mapped.status, request)
  }

  // The one operation that produced a brand-new credential set. Persist it
  // ourselves — rotate the row to aal2 with the fresh pair and hand the browser
  // nothing but a Set-Cookie. projectMfaResponse('verify') returns a locally
  // computed { status, aal }, so no token can leak regardless of what upstream
  // included.
  if (rotatesSession(route.op)) {
    const newAccess = typeof payload?.access_token === 'string' ? payload.access_token : undefined
    const newRefresh = typeof payload?.refresh_token === 'string' ? payload.refresh_token : undefined
    const userId = session.userId

    // Expected: GoTrue handed us the aal2 pair. Persist it. If it somehow did
    // NOT (a shape change), fall back to rotating with the pair already on the
    // row so the assurance level still moves up — retiring a good row and
    // stranding the user is worse than keeping a still-valid credential, and the
    // next expiry repairs staleness via the lease. Logged loudly because it
    // means upstream stopped returning what the verify contract promises.
    if (!newAccess) {
      console.error('mfa verify returned no access_token — rotating session with stored credential')
    }

    if (!userId) {
      return json({ error: 'session backend unavailable', retry: true }, 503, request)
    }

    const rotated = await rotateSession(admin, env, session, {
      userId,
      aal: 'aal2',
      accessToken: newAccess ?? accessToken,
      refreshToken: newRefresh ?? session.refreshToken,
      userAgent: request.headers.get('User-Agent') || undefined,
      ip: request.headers.get('CF-Connecting-IP') || undefined,
    })

    if (!rotated) {
      // The factor IS verified at GoTrue now, but we could not persist an aal2
      // session. The old cookie points at a row whose credential GoTrue has
      // superseded; the honest answer is 503 + retry, and the client's next
      // refresh/re-handoff rebuilds a clean session. Better than a fake 200 that
      // silently keeps the user at aal1.
      console.error('mfa verify succeeded but session rotation failed')
      return json({ error: 'session backend unavailable', retry: true }, 503, request)
    }

    const remaining = rotated.expiresAt - Math.floor(Date.now() / 1000)
    const setCookie = buildSessionCookie(request, rotated.cookie, Math.max(1, remaining))
    return jsonResponse(projectMfaResponse(route.op, payload), 200, request, [setCookie])
  }

  return jsonResponse(projectMfaResponse(route.op, payload), 200, request, [])
}

export const onRequestGet = onRequestAny
export const onRequestPost = onRequestAny
export const onRequestDelete = onRequestAny
