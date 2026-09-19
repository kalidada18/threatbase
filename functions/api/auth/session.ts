/**
 * POST /api/auth/session — establish (or refresh) a server-side web session.
 *
 * Two modes, because Phase 1 has to coexist with the browser-side Supabase
 * session it will eventually replace:
 *
 *   exchange  { access_token }
 *     The handoff. The client has already signed in through AuthContext (and
 *     through Turnstile, via ensureTurnstileLogin) and proves it by presenting
 *     a live Supabase access token, which we verify server-side. No second
 *     Turnstile challenge here on purpose: the caller already holds a credential
 *     that grants everything the cookie would, so a challenge adds no security —
 *     it only adds a failure mode that logs people out.
 *
 *   password  { email, password, turnstile_token }
 *     The real thing: the credential exchange happens AT THE EDGE, so the
 *     Supabase tokens never enter the browser and the only artifact the page can
 *     read is an opaque cookie. Turnstile is mandatory here and bound to the
 *     'login' action plus our own hostnames. This is the path Phase 3 makes the
 *     only one.
 *
 * Anti-fixation: any session id that existed before this call is superseded
 * (rotateSession), including one minted anonymously. The id that survives
 * authentication was created after it.
 *
 * Fail-closed everywhere: no service key, no SESSION_ENC_KEY, or an RPC error
 * yields 503 and no cookie. A 200 from here always means a live row exists.
 */
import { json, corsHeaders, verifyTurnstile, TURNSTILE_HOSTNAMES_DEFAULT } from '../_common'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../src/lib/supabaseConfig'
import {
  adminFor,
  AUTH_FAIL_DAILY_LIMIT,
  AUTH_MINT_DAILY_LIMIT,
  bumpKv,
  buildSessionCookie,
  clearedSessionCookie,
  dayStamp,
  isTrustedOrigin,
  jsonResponse,
  mintSession,
  type Minted,
  peekKv,
  readJson,
  readSessionId,
  refreshSessionCredentials,
  resolveSession,
  revokeSession,
  rotateSession,
} from '../_session'

const EMAIL_MAX = 254
const TOKEN_MAX = 4096

const badRequest = (request: Request, why: string) =>
  json({ error: why }, 400, request)

/** Unverified JWT payload read. Only ever called on a token that
 *  admin.auth.getUser() has already validated, so signature checking here would
 *  be a second, weaker opinion about the same fact. */
function jwtClaims(token: string): Record<string, any> {
  const part = token.split('.')[1]
  if (!part) return {}
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

export const onRequestOptions = async (context: any) => {
  const { request } = context
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

  const admin = adminFor(env)
  if (!admin) {
    return json({ error: 'session backend unavailable' }, 503, request)
  }

  const body = await readJson(request)
  if (!body) return badRequest(request, 'expected a small JSON object')

  const mode = body.mode === 'password' ? 'password' : 'exchange'
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const kv = env?.IOC_CACHE
  const today = dayStamp()

  // Gates BEFORE any network work: this route is unauthenticated, and the
  // password path otherwise buys a GoTrue round-trip per attempt. Same ordering
  // lesson as functions/api/v1/_middleware.ts — limit first, then spend.
  if (mode === 'password') {
    const failures = await peekKv(kv, `sl_f_${clientIp}_${today}`)
    if (failures >= AUTH_FAIL_DAILY_LIMIT) {
      return json({ error: 'too many failed attempts, try again tomorrow' }, 429, request)
    }
  }
  const mints = await peekKv(kv, `sl_m_${clientIp}_${today}`)
  if (mints >= AUTH_MINT_DAILY_LIMIT) {
    return json({ error: 'too many sessions created from this address today' }, 429, request)
  }

  let accessToken: string | undefined
  let refreshToken: string | undefined
  let userId: string | undefined
  // No initializer on purpose: both mode branches below assign this before it is
  // read, and a default that silently survives would be an assurance claim nobody
  // verified.
  let aal: string
  let mfaRequired = false

  if (mode === 'exchange') {
    const presented = body.access_token
    if (typeof presented !== 'string' || !presented || presented.length > TOKEN_MAX) {
      return badRequest(request, 'access_token missing or too long')
    }
    const { data, error } = await admin.auth.getUser(presented)
    if (error || !data?.user) {
      await bumpKv(kv, `sl_f_${clientIp}_${today}`)
      return json({ error: 'session could not be verified' }, 401, request)
    }
    userId = data.user.id
    accessToken = presented
    // Optional, and load-bearing for Phase 2: the access token is dead in an
    // hour, so a session that must act as the user needs the refresh token to
    // renew it without the browser. Stored encrypted; absent means the session is
    // only good until the access token expires.
    if (typeof body.refresh_token === 'string' && body.refresh_token.length <= TOKEN_MAX) {
      refreshToken = body.refresh_token
    }
    const claim = jwtClaims(presented)
    aal = claim.aal === 'aal2' ? 'aal2' : 'aal1'
  } else {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest(request, 'invalid email')
    }
    // 255 is GoTrue's own cap; rejecting longer here keeps the failure ours and
    // stops a oversized-password request reaching the identity provider.
    if (!password || password.length < 8 || password.length > 255) {
      return badRequest(request, 'invalid password')
    }

    const turnstile = await verifyTurnstile(
      body.turnstile_token,
      clientIp,
      env?.TURNSTILE_SECRET,
      'login',
      env?.TURNSTILE_HOSTNAMES || TURNSTILE_HOSTNAMES_DEFAULT,
    )
    if (!turnstile.ok) {
      // 'not-configured' is a deployment fault, not the visitor's: say so
      // honestly rather than failing their login with a fake captcha error.
      const status = turnstile.reason === 'not-configured' ? 503 : 403
      return json(
        {
          error:
            status === 503
              ? 'bot check is unavailable, try again shortly'
              : 'bot check failed',
        },
        status,
        request,
      )
    }

    let grant: Response
    try {
      grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      // Timeout or DNS failure: nothing was learned, nothing was minted. 503 and
      // let the client retry rather than reporting a bad password.
      return json({ error: 'identity provider unreachable', retry: true }, 503, request)
    }

    if (!grant.ok) {
      await bumpKv(kv, `sl_f_${clientIp}_${today}`)
      // One generic message for every rejection. GoTrue already avoids
      // distinguishing unknown-email from bad-password; a passthrough would
      // re-introduce the account-existence oracle on our side of the wire.
      return json({ error: 'invalid credentials' }, 401, request)
    }

    const tokens: any = await grant.json().catch(() => null)
    if (!tokens?.user?.id) {
      await bumpKv(kv, `sl_f_${clientIp}_${today}`)
      return json({ error: 'invalid credentials' }, 401, request)
    }
    userId = tokens.user.id
    accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : undefined
    refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined
    // GoTrue withholds the session when the account demands a second factor.
    // Minting aal1 is correct and not an escalation: aal2-gated routes (key
    // minting, and by extension anything Phase 2 proxies) keep refusing it, and
    // the browser still runs its existing MFA challenge.
    mfaRequired = !accessToken || tokens.action_required === 'mfa_verification'
    aal = 'aal1'
    if (!mfaRequired) {
      const { data: verified } = await admin.auth.getUser(accessToken!)
      if (!verified?.user) return json({ error: 'session could not be verified' }, 401, request)
      aal = jwtClaims(accessToken!).aal === 'aal2' ? 'aal2' : 'aal1'
    }
  }

  if (!userId) return json({ error: 'invalid credentials' }, 401, request)

  const userAgent = request.headers.get('User-Agent') || undefined
  const existing = await resolveSession(request, env, admin)
  const credentials = { userId, aal, accessToken, refreshToken, userAgent, ip: clientIp }

  // Anti-fixation, and it must cover the dead-cookie cases too: whatever id the
  // browser arrived with is retired, and the surviving id is minted here, after
  // authentication.
  //
  // One case is not an authentication event and must not rotate: a re-handoff for
  // the account this cookie already represents. Rotating there is what let an
  // in-flight data read carrying the just-retired id be classified as `reused`,
  // which revokes the whole family including the live session — see
  // refreshSessionCredentials.
  const sameAccount = existing.state === 'ok' && existing.userId === userId

  // A re-handoff that presents a password-only (aal1) credential to a session
  // that had reached aal2 is a fresh sign-in, not a stale tab: auth-js keeps one
  // shared browser session, so the only way an aal1 token reaches an aal2 row is
  // that the browser re-authenticated. It must NOT be honored as aal2 — doing so
  // let a surviving tb_session cookie (logout's endSession is best-effort, and the
  // HttpOnly cookie outlives the browser session auth-js clears) skip the
  // second-factor prompt on the next login, and left the row holding a stale
  // credential that diverged from the browser's. Nor may it rotate: rotating the
  // id is what reopened the token-reuse family revocation. So it falls through to
  // the same-account in-place path below, which now writes the row DOWN to aal1
  // with the fresh credential and keeps the cookie id. whoAmI then reports aal1
  // and checkMfaLevel re-prompts.

  if (sameAccount) {
    const kept = await refreshSessionCredentials(admin, env, existing, {
      accessToken,
      refreshToken,
      aal,
    })
    if (kept) {
      // Counted against the mint budget like any other accepted handoff: the
      // abuse accounting for this endpoint must not depend on which branch ran.
      await bumpKv(kv, `sl_m_${clientIp}_${today}`)
      // No Set-Cookie at all. The browser already holds the right id, and the
      // edge only ever sees its hash, so it could not re-issue it if it wanted to.
      return jsonResponse(
        { ok: true, expires_at: kept.expiresAt, aal, mfa_required: mfaRequired },
        200,
        request,
        [],
      )
    }
    // Fall through: an in-place write failed, so rotate. Correct, merely racy,
    // and preferable to a 503 for a user whose credentials are perfectly good.
  }

  let minted: Minted | null
  if (sameAccount) {
    // Same account: inherit the family, so a later replay of the old id is
    // detectable as reuse rather than as an unknown token.
    minted = await rotateSession(admin, env, existing, credentials)
  } else {
    if (existing.state === 'ok' && existing.id) {
      // A different account held this cookie. Retire it: we are about to
      // overwrite the only copy of that credential, so leaving it live server
      // side would strand a usable session we can no longer deliver or name.
      await revokeSession(admin, existing.id)
    }
    minted = await mintSession(admin, env, credentials)
  }

  if (!minted) {
    return json({ error: 'session backend unavailable' }, 503, request)
  }

  // Clear-then-set, in that order: duplicate Set-Cookie names resolve last wins,
  // so the live cookie survives its own tombstone.
  const setCookies: string[] = []
  if (existing.state !== 'ok' && readSessionId(request)) {
    setCookies.push(clearedSessionCookie(request))
  }
  const remaining = minted.expiresAt - Math.floor(Date.now() / 1000)
  setCookies.push(buildSessionCookie(request, minted.cookie, Math.max(1, remaining)))

  await bumpKv(kv, `sl_m_${clientIp}_${today}`)

  // jsonResponse, not json: the plain builder cannot carry a repeated Set-Cookie
  // header, and 200-without-a-cookie is the silent failure this whole route
  // exists to avoid.
  return jsonResponse(
    {
      ok: true,
      expires_at: minted.expiresAt,
      aal,
      // The client keeps driving its own MFA prompt until Phase 3; this flag is
      // how the password path reports that aal2 is still outstanding.
      mfa_required: mfaRequired,
    },
    200,
    request,
    setCookies,
  )
}
