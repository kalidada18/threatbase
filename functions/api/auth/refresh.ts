/**
 * POST /api/auth/refresh — renew the GoTrue tokens stored behind this browser's
 * session cookie and return the new access token.
 *
 * This is the route that lets `persistSession: false` become possible: the
 * browser stops being the thing that knows how to stay signed in, and the
 * `sessions` row does. Until it is wired up client-side, `persistSession` stays
 * true and this endpoint is still correct to deploy — it only ever renews
 * credentials the session already owns.
 *
 * REQUESTS ARE POST-ONLY AND ORIGIN-GATED, AND THE GATE IS NOT JUST ABOUT CSRF.
 * A successful response contains a live access token. SameSite=Lax stops
 * cross-site *submissions*, but it does nothing about a cross-origin reader on a
 * response that is already allowed to happen; `isTrustedOrigin` is what keeps a
 * third-party page from *reading* the token it provoked. Losing that check would
 * turn a state-changing defence into a credential-disclosure bug, so it is the
 * first statement in the handler and it fails closed on a missing Origin.
 *
 * FAILS CLOSED AND NEVER DESTROYS A SESSION ON UPSTREAM NOISE. A rejected
 * refresh token returns 401; it does not revoke the row. Our own idle/absolute
 * expiry is the authority on whether a session exists — treating a GoTrue answer
 * as revocation would convert an upstream hiccup into a fleet-wide logout, and
 * the client can always re-authenticate to mint a clean family.
 */
import { json, corsHeaders } from '../_common'
import {
  adminFor,
  AUTH_REFRESH_DAILY_LIMIT,
  bumpKv,
  dayStamp,
  isTrustedOrigin,
  peekKv,
  refreshSessionWithLease,
  resolveSession,
} from '../_session'

export const onRequestOptions = async (context: any) => {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) })
}

// A GET here would be cacheable and CSRF-able by a plain navigation. Refuse it
// rather than rely on the browser not to try.
export const onRequestGet = async (context: any) => {
  return json({ error: 'use POST' }, 405, context.request)
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context

  if (!isTrustedOrigin(request)) {
    return json({ error: 'cross-origin request rejected' }, 403, request)
  }

  const admin = adminFor(env)
  if (!admin) return json({ error: 'session backend unavailable' }, 503, request)

  // Failures-only, same shape as the mint limiter: resolveSession and the lease
  // both short-circuit before any GoTrue round-trip, so the counter is only
  // spent on attempts that actually cost something.
  const kv = env?.IOC_CACHE
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const failKey = `sl_rf_${clientIp}_${dayStamp()}`
  if ((await peekKv(kv, failKey)) >= AUTH_REFRESH_DAILY_LIMIT) {
    return json({ error: 'too many failed refreshes from this address today', retry: true }, 429, request)
  }

  const current = await resolveSession(request, env, admin)
  if (current.state !== 'ok') {
    await bumpKv(kv, failKey)
    // No Set-Cookie: the tb_session value is deliberately left alone. Most
    // non-'ok' states here are idle-expiry, and clearing the cookie would throw
    // away an identity the user can restore by signing in again.
    return json({ error: 'no active session' }, 401, request)
  }

  const out = await refreshSessionWithLease(admin, env, current)

  switch (out.status) {
    case 'refreshed':
      return json(
        {
          access_token: out.accessToken,
          refresh_token: out.refreshToken,
          expires_in: out.expiresIn ?? 3600,
        },
        200,
        request,
      )

    case 'busy':
      // Another tab holds the lease. Its commit is the token this client should
      // use, so a short retry is the whole recovery — no error state to show.
      return json({ error: 'refresh already in progress', retry: true }, 409, request)

    case 'dead':
      await bumpKv(kv, failKey)
      return json({ error: 'session no longer usable' }, 401, request)

    case 'invalid-grant':
      await bumpKv(kv, failKey)
      return json({ error: 'credentials rejected', reauth: true }, 401, request)

    case 'upstream':
      // GoTrue unreachable or malformed. Not counted as a failure: this is our
      // availability problem, and charging it to the visitor's IP would lock out
      // an honest user during an outage.
      return json({ error: 'identity provider unavailable', retry: true }, 503, request)

    default:
      // 'unavailable' and 'invalid': misconfiguration or an undecryptable row.
      return json({ error: 'refresh unavailable', retry: true }, 503, request)
  }
}
