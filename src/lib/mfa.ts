/**
 * Browser client for the /api/auth/mfa proxy (Phase 3b).
 *
 * The MFA flows stop calling `supabaseClient.auth.mfa.*` (which builds an
 * Authorization header from auth-js's own localStorage session) and call these
 * instead. The only thing sent is the tb_session cookie; the edge presents the
 * caller's stored access token to GoTrue server-side. This is what lets MFA
 * keep working once `persistSession: false` removes the browser-side session
 * entirely — the reason 3b and that flip ship together.
 *
 * Shape choices, all deliberate:
 *  - Throws an Error carrying the server's message rather than returning auth-js's
 *    `{ data, error }`. Every caller here already sits inside a try/catch that
 *    does `if (error) throw error`, so a throw is the same control flow with one
 *    less thing to forget. The components' user-facing text is unchanged.
 *  - No timeout of its own. The callers wrap each call in `withTimeout(p, n, msg)`
 *    exactly as they did the auth-js promises; a second timer here would only
 *    shadow that message. The documented rule in withTimeout.ts (a stall stops the
 *    caller waiting, it does not cancel the request) still holds.
 *  - `listTotpFactors()` returns TOTP factors with their real `status`, including
 *    unverified ones. auth-js's `listFactors()` hid unverified factors from the
 *    per-type buckets, which silently disabled MfaSetup's stale-factor cleanup;
 *    the proxy returns the honest list and this client keeps the `factor_type`
 *    filter so a future phone factor cannot land in a TOTP-specific result.
 */

const MFA_BASE = '/api/auth/mfa'

export interface TotpFactor {
  id: string
  friendly_name: string | null
  status?: string
}

export interface EnrolledTotp {
  id: string
  totp: { qr_code: string; secret: string | null }
}

/** A factor id that has not been validated against a uuid shape must never be
 *  interpolated into a path. The proxy 404s it anyway; failing here is clearer
 *  and keeps a malformed value out of the network entirely. */
const FACTOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertFactorId(id: string): string {
  if (!FACTOR_ID_PATTERN.test(id)) throw new Error('Invalid authenticator id.')
  return id
}

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<any> {
  const res = await fetch(path, {
    method,
    // The cookie is the whole credential. Without same-origin nothing is sent
    // and every call 401s quietly — the exact failure session.ts warns about.
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // The proxy maps every upstream failure onto a short, safe `error` string
    // (see mapMfaError); anything unmappable becomes a generic 502 message.
    const msg = typeof data?.error === 'string' && data.error ? data.error : 'MFA request failed.'
    throw new Error(msg)
  }
  return data
}

/** This account's TOTP factors, verified and unverified, newest decisions left to
 *  the caller (pickVerifiedTotpFactor still decides what counts as enabled). */
export async function listTotpFactors(): Promise<TotpFactor[]> {
  const data = await request('GET', `${MFA_BASE}/factors`)
  const factors: any[] = Array.isArray(data?.factors) ? data.factors : []
  return factors
    .filter((f) => f && f.factor_type === 'totp' && typeof f.id === 'string')
    .map((f) => ({ id: f.id, friendly_name: f.friendly_name ?? null, status: f.status }))
}

/** Create an unverified TOTP factor and return the QR + manual-entry secret.
 *  The issuer is fixed server-side; nothing here can point the code at another
 *  service. */
export async function enrollTotp(friendlyName: string): Promise<EnrolledTotp> {
  const data = await request('POST', `${MFA_BASE}/factors`, { friendly_name: friendlyName })
  return {
    id: data.id,
    totp: {
      qr_code: data?.totp?.qr_code ?? '',
      secret: typeof data?.totp?.secret === 'string' ? data.totp.secret : null,
    },
  }
}

/** Start a verification challenge for a factor. Returns the challenge id that
 *  `verify` must echo back. */
export async function challengeFactor(factorId: string): Promise<{ id: string }> {
  const id = assertFactorId(factorId)
  const data = await request('POST', `${MFA_BASE}/factors/${id}/challenge`, {})
  return { id: data?.id }
}

/**
 * Submit a TOTP code. On success the edge stores the resulting aal2 token pair
 * behind a freshly rotated session id and the browser receives a new Set-Cookie;
 * nothing credential-shaped comes back in the body, so this returns void.
 */
export async function verifyFactor(
  factorId: string,
  challengeId: string,
  code: string,
): Promise<void> {
  const id = assertFactorId(factorId)
  await request('POST', `${MFA_BASE}/factors/${id}/verify`, { challenge_id: challengeId, code })
}

/** Delete a factor (used both to disable 2FA and to clean up abandoned setups). */
export async function unenrollFactor(factorId: string): Promise<void> {
  const id = assertFactorId(factorId)
  await request('DELETE', `${MFA_BASE}/factors/${id}`)
}
