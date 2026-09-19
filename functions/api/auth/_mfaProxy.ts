/**
 * Pure request/response decisions for the /api/auth/mfa proxy (Phase 3b).
 *
 * Split out of auth/mfa/[[path]].ts for the same reason _dbProxy.ts and
 * _session.ts exist: these are the security-relevant judgements, and they are
 * testable without a database or a live GoTrue. Per the project's testing stance
 * the upstream round-trip itself is NOT mocked — a mock GoTrue only proves the
 * mock works. What gets tested here is the operation allowlist, the input
 * field-list, and the output projection.
 *
 * WHY THIS IS A PURPOSE-BUILT ROUTE AND NOT A PASSTHROUGH.
 * `_dbProxy.ts` records the decision to leave `auth/v1` off the /api/db
 * allowlist: an auth passthrough has no caller (auth-js resolves the session
 * before building a request, so `db.auth.mfa.*` never sends any HTTP) and it
 * would expose GoTrue's rate-limited endpoints from the edge IP. This module is
 * the alternative that note asked for: a fixed set of named operations, each of
 * which the app genuinely performs, with the edge presenting the session row's
 * own access token.
 *
 * THE CONTRACT THIS EXISTS TO HOLD: a verify is not a read. GoTrue answers
 * `POST /factors/{id}/verify` with a COMPLETE NEW TOKEN SET, so the naive
 * proxy would either (a) leak a live aal2 access/refresh token into a JSON body
 * readable by any script on the page — a token oracle, since `isTrustedOrigin`
 * accepts same-origin JS by design — or (b) drop it and desync everyone. This
 * module makes (a) structurally impossible: every projection below is an
 * ALLOWLIST of named fields, so a credential cannot leak because GoTrue added a
 * field, and `verify` returns a value computed here rather than anything read
 * from upstream. The new pair is consumed by the route itself, which stores it
 * behind a rotated session id and hands the browser nothing but a Set-Cookie.
 */

/** Operations this proxy will perform. Add one only with a caller that needs it. */
export type MfaOp = 'list' | 'enroll' | 'challenge' | 'verify' | 'unenroll'

export interface MfaRoute {
  op: MfaOp
  /** Present for challenge / verify / unenroll. Validated, then interpolated. */
  factorId?: string
}

/** The service name shown in authenticator apps. Forced server-side on purpose:
 *  the issuer is what the app displays as "the account this code belongs to", so
 *  a value the page controls is a phishing primitive
 *  (`otpauth://totp/evil.com:...`), not a label. */
export const MFA_ISSUER = 'Threatbase'

/** GoTrue's own limit for factor friendly names is generous; 64 is well above
 *  what this UI generates (`Authenticator (2026-09-18)`) and bounds what a
 *  hostile page can make the identity provider store. */
export const FRIENDLY_NAME_MAX = 64

/** TOTP codes in this app are 6 digits. GoTrue accepts 6-8 and this keeps the
 *  door at the width of the actual flow: digits only, bounded length. */
const CODE_PATTERN = /^[0-9]{6,8}$/

/** GoTrue factor ids are uuids. Anything else is refused before it can be
 *  interpolated into an upstream path — the same reason _dbProxy validates the
 *  tail it rebuilds rather than relaying what arrived. */
const FACTOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Challenge ids are uuids too, and `challenge_id` is the one string from the
 *  request body that ends up in an upstream JSON field rather than a path, so it
 *  is checked for shape here even though it is not path-injectable. */
const CHALLENGE_ID_PATTERN = FACTOR_ID_PATTERN

const MFA_SEGMENT = '/api/auth/mfa/'

/**
 * Map an incoming `/api/auth/mfa/...` pathname + method onto one operation.
 *
 * Returns null for anything else, so the route 404s without having verified the
 * session or dialled GoTrue. Unknown paths are refused by construction — there
 * is no "prefix matched, forward the rest" step that a `..` or an extra segment
 * could escape from, because the factor id must match a uuid pattern for the
 * route to resolve at all.
 */
export function resolveMfaRoute(pathname: string, method: string): MfaRoute | null {
  if (!pathname.startsWith(MFA_SEGMENT)) return null
  const segments = pathname.slice(MFA_SEGMENT.length).split('/').filter(Boolean)
  const http = method.toUpperCase()

  if (segments.length === 1 && segments[0] === 'factors') {
    if (http === 'GET') return { op: 'list' }
    if (http === 'POST') return { op: 'enroll' }
    return null
  }

  if (segments[0] !== 'factors' || !segments[1] || !FACTOR_ID_PATTERN.test(segments[1])) {
    return null
  }
  const factorId = segments[1]

  if (segments.length === 2 && http === 'DELETE') return { op: 'unenroll', factorId }
  if (segments.length === 3 && http === 'POST') {
    if (segments[2] === 'challenge') return { op: 'challenge', factorId }
    if (segments[2] === 'verify') return { op: 'verify', factorId }
  }
  return null
}

/**
 * The GoTrue URL for a resolved operation, or null when the operation is not an
 * upstream MFA call at all.
 *
 * `list` returns null deliberately. auth-js's own `listFactors()` makes no MFA
 * request — it calls `getUser()` and buckets `user.factors` by `factor_type`,
 * keeping only verified ones in the per-type buckets. The edge serves it from
 * `admin.auth.getUser(token)` for the same reason: fewer rate-limited upstream
 * calls, and no invented surface.
 *
 * Rebuilt from the configured project's origin, exactly like resolveUpstream:
 * a non-http scheme is a misconfiguration and must read as "not configured"
 * here rather than as an upstream failure at request time.
 */
export function mfaUpstreamUrl(route: MfaRoute, baseUrl: string): string | null {
  if (route.op === 'list') return null
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return null
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null
  base.hash = ''
  base.search = ''
  switch (route.op) {
    case 'enroll':
      base.pathname = '/auth/v1/factors'
      break
    case 'challenge':
      base.pathname = `/auth/v1/factors/${route.factorId}/challenge`
      break
    case 'verify':
      base.pathname = `/auth/v1/factors/${route.factorId}/verify`
      break
    case 'unenroll':
      base.pathname = `/auth/v1/factors/${route.factorId}`
      break
    default:
      return null
  }
  return base.toString()
}

export const UPSTREAM_METHOD: Record<Exclude<MfaOp, 'list'>, 'POST' | 'DELETE'> = {
  enroll: 'POST',
  challenge: 'POST',
  verify: 'POST',
  unenroll: 'DELETE',
}

export type BuiltRequest = { body?: Record<string, unknown>; error?: undefined } | { body?: undefined; error: string }

/**
 * Translate the page's JSON into the exact body GoTrue expects, field by field.
 *
 * This is an allowlist, not a relay. Nothing the caller sends reaches GoTrue
 * except `friendly_name`, `challenge_id` and `code`; `factor_type` and `issuer`
 * are decided here. Without that, the route would be a generic authenticated
 * proxy onto GoTrue's factor API — including `factor_type: 'phone'`, which
 * spends the project's SMS quota, and any future field GoTrue adds.
 *
 * Returns an error string (the route maps it to 400) rather than throwing: a
 * malformed OTP entry is a normal user action and must not look like a crash.
 */
export function buildMfaRequest(route: MfaRoute, input: Record<string, any> | null): BuiltRequest {
  switch (route.op) {
    case 'enroll': {
      const raw = typeof input?.friendly_name === 'string' ? input.friendly_name.trim() : ''
      const friendly_name = raw.slice(0, FRIENDLY_NAME_MAX)
      if (raw.length > FRIENDLY_NAME_MAX) {
        return { error: `friendly_name must be at most ${FRIENDLY_NAME_MAX} characters` }
      }
      return { body: { friendly_name, factor_type: 'totp', issuer: MFA_ISSUER } }
    }
    case 'challenge':
      // GoTrue takes no inputs here; an empty object is what auth-js's raw
      // params resolve to once the factor id is in the path.
      return { body: {} }
    case 'verify': {
      const challengeId = typeof input?.challenge_id === 'string' ? input.challenge_id : ''
      const code = typeof input?.code === 'string' ? input.code : ''
      if (!CHALLENGE_ID_PATTERN.test(challengeId)) return { error: 'challenge_id is not valid' }
      if (!CODE_PATTERN.test(code)) return { error: 'Enter the 6-digit code from your app.' }
      return { body: { challenge_id: challengeId, code } }
    }
    case 'unenroll':
      return {}
    default:
      return { error: 'unsupported operation' }
  }
}

/** Headers for the upstream call. The Bearer is the caller's OWN access token
 *  from their session row, never the service role: GoTrue's MFA endpoints
 *  authorise the factor against the authenticated user, and presenting an
 *  admin credential there would let any signed-in session enroll, challenge or
 *  delete a factor belonging to somebody else. */
export function mfaUpstreamHeaders(accessToken: string, anonKey: string): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Cache-Control': 'no-store',
  })
}

/** What the browser may learn. Anything not named here is dropped, and that is
 *  the whole point: GoTrue's verify response carries `access_token`,
 *  `refresh_token`, `expires_in` and `user`, and none of those may be returned
 *  from a cookie-authed endpoint. */
export interface FactorSummary {
  id: string
  factor_type: string
  friendly_name: string | null
  status?: string
}

/**
 * Project a raw upstream JSON body down to the fields the UI consumes.
 *
 * `list` is fed a GoTrue user object and returns *every* TOTP-capable factor
 * with its status, including unverified ones — deliberately wider than
 * auth-js's `listFactors()`, whose per-type buckets hold only verified factors.
 * That difference is not cosmetic: `MfaSetup` cleans up abandoned setups by
 * filtering `status !== 'verified'` out of the list it was given, which under
 * auth-js's shape could never match anything, so the stale-factor deletion the
 * 422 `mfa_factor_name_conflict` depends on was silently dead code. Returning
 * the honest list makes that path work again; `pickVerifiedTotpFactor` still
 * decides what counts as enabled.
 */
export function projectMfaResponse(op: MfaOp, data: any): unknown {
  if (!data || typeof data !== 'object') return {}
  switch (op) {
    case 'list': {
      const factors = Array.isArray(data.factors) ? data.factors : []
      return {
        factors: factors
          .filter((f: any) => f && typeof f.id === 'string')
          .map(
            (f: any): FactorSummary => ({
              id: f.id,
              factor_type: typeof f.factor_type === 'string' ? f.factor_type : 'unknown',
              friendly_name: typeof f.friendly_name === 'string' ? f.friendly_name : null,
              status: typeof f.status === 'string' ? f.status : undefined,
            }),
          ),
      }
    }
    case 'enroll': {
      const totp = data.totp && typeof data.totp === 'object' ? data.totp : null
      // auth-js prepends this data-URI prefix client-side before the UI ever
      // sees `qr_code`; the components receive it from here instead so the
      // `<img src>` is byte-identical to what auth-js produced (`toQrImgSrc`
      // tolerates both forms).
      const qr = typeof totp?.qr_code === 'string' ? `data:image/svg+xml;utf-8,${totp.qr_code}` : undefined
      const projected: Record<string, unknown> = {
        id: data.id,
        friendly_name: data.friendly_name ?? null,
        totp: { qr_code: qr, secret: typeof totp?.secret === 'string' ? totp.secret : null },
      }
      return projected
    }
    case 'challenge':
      return { id: data.id, type: data.type, expires_at: data.expires_at ?? null }
    case 'unenroll':
      return { id: data.id ?? null }
    case 'verify':
      // Never derived from `data`. The route stores the new pair itself; the
      // response says only what the caller asked whether it did.
      return { status: 'verified', aal: 'aal2' }
    default:
      return {}
  }
}

/** True when a successful `op` produced a brand-new GoTrue token set that has to
 *  be persisted instead of returned. One operation qualifies, and the shape of
 *  this predicate is the reason: if a future endpoint starts rotating and is
 *  not added here, nothing leaks — the stored credential just goes stale, which
 *  the lease renewal repairs on the next 401. */
export function rotatesSession(op: MfaOp): boolean {
  return op === 'verify'
}

/** How far before real expiry the proxy still treats a token as dead. GoTrue's
 *  MFA endpoints answer an expired Bearer token with 401, and a round-trip that
 *  is certain to fail is worth more than the 60s of skew it costs: a request
 *  that starts at `exp - 30s` will very likely reach GoTrue after `exp`. */
export const TOKEN_SKEW_SECONDS = 60

/**
 * True when the stored access token must be renewed before it is presented.
 *
 * The claim is read WITHOUT verifying the signature, and that is the correct
 * threat model here: the token came out of our own AES-GCM envelope in a row we
 * just authenticated (`authenticate_session` decided the session is live), so
 * this is a cache-validity hint, not an authorisation decision. Nothing
 * downstream trusts this payload — GoTrue itself validates the token, and that
 * is the authority.
 *
 * A token that will not parse is reported as needing renewal: failing toward
 * the lease means one extra refresh call, while failing toward "usable" would
 * send a guaranteed 401 to GoTrue and report it to the user as a broken
 * authenticator.
 */
export function tokenNeedsRenewal(token: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const part = token?.split('.')[1]
  if (!part) return true
  let claims: any
  try {
    claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return true
  }
  const exp = Number(claims?.exp)
  if (!Number.isFinite(exp) || exp <= 0) return true
  return exp - TOKEN_SKEW_SECONDS <= nowSeconds
}

/** Map an upstream GoTrue failure onto our own response.
 *
 * Only the error `code` and `message` are read out of the upstream body — a
 * passthrough of the whole object would relay whatever else GoTrue echoes back,
 * and on some endpoints that includes parts of the request. 401 is preserved so
 * the client can tell "your stored token expired" apart from "your code was
 * wrong"; anything unmappable becomes 502 rather than a fake 4xx.
 */
export function mapMfaError(status: number, payload: any): { status: number; message: string; retry?: boolean } {
  const code = typeof payload?.error_code === 'string' ? payload.error_code : ''
  const message =
    typeof payload?.message === 'string' && payload.message.length <= 200 ? payload.message : ''

  if (status === 401) return { status: 401, message: message || 'session expired', retry: true }
  if (status === 403) return { status: 403, message: message || 'not allowed' }
  if (status === 404) return { status: 404, message: message || 'factor or challenge not found' }
  if (status === 422) {
    // GoTrue's MFA validation failures (bad code, expired challenge, duplicate
    // friendly name) are all "fixable by the user", and the components surface
    // exactly this string in the error box.
    return { status: 422, message: message || 'could not validate the request' }
  }
  if (status === 423) return { status: 423, message: message || 'too many failed attempts' }
  if (status === 429) return { status: 429, message: 'too many attempts, try again shortly', retry: true }
  if (code === 'captcha_failed') return { status: 403, message: 'bot check failed' }
  return { status: 502, message: message || 'identity provider unavailable', retry: true }
}
