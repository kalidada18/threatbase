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
