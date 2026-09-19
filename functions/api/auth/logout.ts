/**
 * POST /api/auth/logout — retire the current session and clear the cookie.
 *
 * Idempotent by design: arriving without a cookie, or with one that already
 * expired, is a successful logout, not a 401. The response always carries a
 * clearing Set-Cookie so a stale local cookie cannot outlive the row it pointed
 * at. Revocation is the server-side delete that a bearer JWT can never offer —
 * from this moment on the id resolves to 'revoked' on its next request.
 *
 * `scope: "all"` signs every device out of the account. That is the answer to a
 * stolen-laptop scenario, so it is deliberate and unglamorous: revoke every live
 * row for user_id, then clear this browser's cookie like everyone else's.
 *
 * Trusted-origin gated: SameSite=Lax stops a cross-site POST from delivering the
 * cookie at all, but a logout is a state change and an availability property, so
 * the second layer applies here too. Without it, any page could sign users out
 * on every visit.
 *
 * The GoTrue session behind the stored token is revoked upstream too (best
 * effort, before the local row is touched). Our `sessions` row is what the cookie
 * maps to, but the access token we present still points at a first-class GoTrue
 * session that would otherwise outlive this request and stay refreshable. It is
 * strictly best-effort: an upstream failure never blocks or fails the local
 * revoke, because leaving the row live after the visitor asked to be signed out
 * is the worse failure. auth-js treats a 401/403/404 from /logout the same way.
 */
import { corsHeaders, json } from '../_common'
import {
  adminFor,
  clearedSessionCookie,
  isTrustedOrigin,
  jsonResponse,
  readJson,
  readSessionId,
  revokeAllForUser,
  revokeSession,
  resolveSession,
} from '../_session'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../src/lib/supabaseConfig'

/** Bounded so a wedged GoTrue cannot hold the request open past the local
 *  revoke; the timeout path is caught and simply skips the upstream call. */
const UPSTREAM_TIMEOUT_MS = 10_000

/**
 * Revoke the caller's GoTrue session(s) with their OWN stored access token.
 *
 * Never throws. `global` maps to `?scope=global` (every device, mirroring
 * scope:'all' below); the default path signs out only this session. If there is
 * no token — an expired/revoked/reused row — there is nothing for us to revoke
 * upstream and the local cookie clear already handled it.
 */
async function revokeGoTrueSession(
  env: any,
  accessToken: string,
  global: boolean,
): Promise<void> {
  try {
    const base = env?.SUPABASE_URL || SUPABASE_URL
    const url = `${base}/auth/v1/logout${global ? '?scope=global' : ''}`
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: env?.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    // Best-effort by contract. Log and move on; the row revoke and cookie clear
    // below still happen, so the session is unusable against us regardless.
    console.error('logout: upstream GoTrue revocation failed:', err instanceof Error ? err.message : err)
  }
}

export const onRequestOptions = async (context: any) => {
  const { request } = context
  // corsHeaders(), not a spread of another Response's Headers: a Headers
  // instance has no enumerable own properties, so `{ ...res.headers }` is `{}`.
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, 'POST, OPTIONS'),
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context

  if (!isTrustedOrigin(request)) {
    return json({ error: 'cross-origin request rejected' }, 403, request)
  }

  const body = await readJson(request)
  const scopeAll = body?.scope === 'all'

  const settle = (status: number, payload: unknown) =>
    jsonResponse(payload, status, request, [clearedSessionCookie(request)])

  // Nothing to revoke locally, but the browser still gets the tombstone.
  if (!readSessionId(request) && !scopeAll) {
    return settle(200, { ok: true, revoked: 0 })
  }

  const admin = adminFor(env)
  if (!admin) {
    // Fail closed on the *revocation*: report the failure rather than clearing
    // the cookie and letting everyone believe the session ended. The row is
    // still live, so the honest answer is 503 and no cookie change.
    return json({ error: 'session backend unavailable' }, 503, request)
  }

  const session = await resolveSession(request, env, admin)

  // Revoke upstream first, while the token is still in hand and the row is still
  // ours to act on. Best-effort: it never returns early or throws, so a GoTrue
  // outage cannot stop the visitor from being signed out of ThreatBase.
  if (session.state === 'ok' && session.accessToken) {
    await revokeGoTrueSession(env, session.accessToken, scopeAll)
  }

  if (scopeAll) {
    // Requires a recognised identity: "log out everywhere" from an anonymous or
    // expired cookie has no user_id to act on, and guessing one from a cookie we
    // cannot verify is not a thing we do.
    if (session.state !== 'ok' || !session.userId) {
      return settle(401, { error: 'sign in required', revoked: 0 })
    }
    const ok = await revokeAllForUser(admin, session.userId)
    if (!ok) return json({ error: 'session backend unavailable' }, 503, request)
    return settle(200, { ok: true, revoked: 'all' })
  }

  if (session.state === 'unavailable') {
    return json({ error: 'session backend unavailable' }, 503, request)
  }

  // expired / revoked / reused / invalid: the row is already unusable, so the
  // only work left is the cookie.
  let revoked = 0
  if (session.state === 'ok' && session.id) {
    const ok = await revokeSession(admin, session.id)
    if (!ok) return json({ error: 'session backend unavailable' }, 503, request)
    revoked = 1
  }

  return settle(200, { ok: true, revoked })
}
