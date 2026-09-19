/**
 * /api/auth/sessions — "where am I logged in?"
 *
 *   GET    -> the account's live sessions (id, created, last seen, UA, IP)
 *   DELETE -> revoke one by id, or every other one with `scope: "others"`
 *
 * The row id is a uuid, not a credential: the cookie holds a different value
 * entirely (its sha256 is what the table stores), so listing these is safe. No
 * hash, no token, and nothing decrypted ever appears in a response body.
 *
 * Auth is the tb_session cookie via requireSession, not an Authorization header
 * — this route is the reason the cookie exists as a first-class credential
 * rather than only as a handoff.
 */
import { corsHeaders, json } from '../_common'
import {
  buildSessionCookie,
  clearedSessionCookie,
  isTrustedOrigin,
  jsonResponse,
  listSessions,
  mintSession,
  readJson,
  requireSession,
  revokeAllForUser,
  revokeOwnedSession,
} from '../_session'

const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const onRequestOptions = async (context: any) => {
  const { request } = context
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, 'GET, DELETE, OPTIONS'),
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const onRequestGet = async (context: any) => {
  const { request } = context
  const ctx = await requireSession(context)
  if (ctx.response) return ctx.response

  const sessions = await listSessions(ctx.admin, ctx.session.userId!)
  // current: true is computed here rather than shipped as a stored column — the
  // concept only exists relative to the request that asked.
  return json(
    {
      sessions: sessions.map((s) => ({ ...s, current: s.id === ctx.session.id })),
      current_id: ctx.session.id,
    },
    200,
    request,
  )
}

export async function onRequestDelete(context: any) {
  const { request } = context

  if (!isTrustedOrigin(request)) {
    return json({ error: 'cross-origin request rejected' }, 403, request)
  }

  const ctx = await requireSession(context)
  if (ctx.response) return ctx.response
  const { session, admin } = ctx
  const userId = session.userId!

  const body = await readJson(request)
  if (!body) return json({ error: 'expected a small JSON object' }, 400, request)

  // Clearing the cookie is only correct when the caller just revoked the very
  // session it is signing with; otherwise the browser would be logged out of a
  // device it never asked to log out of.
  const affectsSelf = (targetId: string) => targetId === session.id

  if (body.scope === 'others') {
    // "Sign out everywhere but here": revoke all, then re-mint this request's own
    // sign-in. Re-minting beats exempting the current id in SQL because it also
    // rotates the credential, which is the actual point of the panic button —
    // the id this browser has been using is presumed compromised too if you are
    // clicking this because of a suspicious device.
    const ok = await revokeAllForUser(admin, userId)
    if (!ok) return json({ error: 'session backend unavailable' }, 503, request)
    const setCookies: string[] = []
    const minted = await mintSession(admin, context.env, {
      userId,
      aal: session.aal ?? 'aal1',
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userAgent: request.headers.get('User-Agent') || undefined,
      ip: request.headers.get('CF-Connecting-IP') || undefined,
    })
    if (!minted) return json({ error: 'session backend unavailable' }, 503, request)
    // Clear-then-set: duplicate Set-Cookie names resolve last-wins, so the live
    // cookie survives its own tombstone (same ordering as the mint route).
    setCookies.push(clearedSessionCookie(request))
    const remaining = minted.expiresAt - Math.floor(Date.now() / 1000)
    setCookies.push(buildSessionCookie(request, minted.cookie, Math.max(1, remaining)))
    return jsonResponse(
      { ok: true, revoked: 'others', expires_at: minted.expiresAt },
      200,
      request,
      setCookies,
    )
  }

  const targetId = typeof body.id === 'string' ? body.id : ''
  if (!SESSION_UUID.test(targetId)) {
    return json({ error: 'invalid session id' }, 400, request)
  }

  const result = await revokeOwnedSession(admin, targetId, userId)
  if (result !== 'revoked') {
    return json({ error: 'session not found' }, 404, request)
  }

  const setCookies = affectsSelf(targetId) ? [clearedSessionCookie(request)] : []
  return jsonResponse({ ok: true, revoked: targetId }, 200, request, setCookies)
}
