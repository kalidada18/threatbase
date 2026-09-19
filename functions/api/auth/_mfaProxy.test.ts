/**
 * Unit tests for the /api/auth/mfa proxy's pure decisions (Phase 3b).
 *
 * Same scope rule as _dbProxy.test.ts and _session.test.ts: nothing here dials
 * GoTrue. A mocked identity provider only proves the mock works. What gets
 * tested is the security-relevant judgement that lives in _mfaProxy.ts — the
 * operation allowlist, the input field-list, the output projection, and the
 * error map — because a silent mistake in any of those is a token leak, an SSRF,
 * or a phone-factor cost the client never asked for.
 */
import { describe, expect, it } from 'vitest'
import {
  FRIENDLY_NAME_MAX,
  MFA_ISSUER,
  TOKEN_SKEW_SECONDS,
  buildMfaRequest,
  mapMfaError,
  mfaUpstreamHeaders,
  mfaUpstreamUrl,
  projectMfaResponse,
  resolveMfaRoute,
  rotatesSession,
  tokenNeedsRenewal,
} from './_mfaProxy'

const BASE = 'https://api.threatbase.qzz.io'
const UUID = '3f0d9c1a-7b64-4a58-9c2e-1d0f5a6b7c8d'
const NOT_A_UUID = 'not-a-uuid'

describe('resolveMfaRoute — the fixed operation set', () => {
  it('maps the five operations the app actually performs', () => {
    expect(resolveMfaRoute('/api/auth/mfa/factors', 'GET')).toEqual({ op: 'list' })
    expect(resolveMfaRoute('/api/auth/mfa/factors', 'POST')).toEqual({ op: 'enroll' })
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}/challenge`, 'POST')).toEqual({
      op: 'challenge',
      factorId: UUID,
    })
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}/verify`, 'POST')).toEqual({
      op: 'verify',
      factorId: UUID,
    })
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}`, 'DELETE')).toEqual({
      op: 'unenroll',
      factorId: UUID,
    })
  })

  it('refuses a non-uuid factor id before it can be interpolated into a path', () => {
    // This is the SSRF / path-traversal gate: `../admin`, an encoded slash, or a
    // suffix trick all fail the uuid shape and never reach mfaUpstreamUrl.
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${NOT_A_UUID}/verify`, 'POST')).toBeNull()
    expect(resolveMfaRoute('/api/auth/mfa/factors/../../auth/v1/admin/users', 'GET')).toBeNull()
  })

  it('refuses a method that does not match the resource', () => {
    expect(resolveMfaRoute('/api/auth/mfa/factors', 'DELETE')).toBeNull()
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}`, 'POST')).toBeNull()
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}`, 'GET')).toBeNull()
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}/challenge`, 'DELETE')).toBeNull()
  })

  it('refuses anything outside the /api/auth/mfa/ prefix or with extra segments', () => {
    expect(resolveMfaRoute('/api/db/rest/v1/profiles', 'GET')).toBeNull()
    expect(resolveMfaRoute('/api/auth/mfa/', 'GET')).toBeNull()
    expect(resolveMfaRoute(`/api/auth/mfa/factors/${UUID}/challenge/extra`, 'POST')).toBeNull()
    expect(resolveMfaRoute('/api/auth/mfa/factors/verify', 'POST')).toBeNull()
  })
})

describe('mfaUpstreamUrl — where a call is allowed to go', () => {
  it('returns null for list, which is served from getUser and never hits /factors', () => {
    expect(mfaUpstreamUrl({ op: 'list' }, BASE)).toBeNull()
  })

  it('rebuilds the factor path from the project origin', () => {
    expect(mfaUpstreamUrl({ op: 'enroll' }, BASE)).toBe(`${BASE}/auth/v1/factors`)
    expect(mfaUpstreamUrl({ op: 'verify', factorId: UUID }, BASE)).toBe(
      `${BASE}/auth/v1/factors/${UUID}/verify`,
    )
    expect(mfaUpstreamUrl({ op: 'unenroll', factorId: UUID }, BASE)).toBe(
      `${BASE}/auth/v1/factors/${UUID}`,
    )
  })

  it('rejects a non-http scheme, treating a bad SUPABASE_URL as unconfigured', () => {
    expect(mfaUpstreamUrl({ op: 'enroll' }, 'file:///etc/passwd')).toBeNull()
    expect(mfaUpstreamUrl({ op: 'enroll' }, 'javascript:alert(1)')).toBeNull()
    expect(mfaUpstreamUrl({ op: 'enroll' }, 'not a url')).toBeNull()
  })

  it('drops any query or hash riding along on the base url', () => {
    const url = mfaUpstreamUrl({ op: 'enroll' }, `${BASE}/?x=1#frag`)
    expect(url).toBe(`${BASE}/auth/v1/factors`)
  })
})

describe('buildMfaRequest — the input allowlist', () => {
  it('pins factor_type and issuer server-side, ignoring what the page sent', () => {
    const built = buildMfaRequest({ op: 'enroll' }, {
      friendly_name: '  My phone  ',
      factor_type: 'phone',
      issuer: 'evil.com',
    })
    expect(built.error).toBeUndefined()
    expect(built.body).toEqual({ friendly_name: 'My phone', factor_type: 'totp', issuer: MFA_ISSUER })
  })

  it('bounds the friendly name instead of storing an arbitrary string at the IdP', () => {
    const tooLong = 'a'.repeat(FRIENDLY_NAME_MAX + 1)
    expect(buildMfaRequest({ op: 'enroll' }, { friendly_name: tooLong }).error).toMatch(/at most/)
  })

  it('accepts a 6-8 digit code and a uuid challenge id, and nothing else', () => {
    expect(buildMfaRequest({ op: 'verify' }, { challenge_id: UUID, code: '123456' }).body).toEqual({
      challenge_id: UUID,
      code: '123456',
    })
    expect(buildMfaRequest({ op: 'verify' }, { challenge_id: UUID, code: '12ab56' }).error).toBeTruthy()
    expect(buildMfaRequest({ op: 'verify' }, { challenge_id: UUID, code: '12345' }).error).toBeTruthy()
    expect(buildMfaRequest({ op: 'verify' }, { challenge_id: NOT_A_UUID, code: '123456' }).error).toBeTruthy()
  })

  it('drops unknown fields rather than relaying a generic proxy body', () => {
    const built = buildMfaRequest({ op: 'enroll' }, { friendly_name: 'x', sudo: true, role: 'admin' })
    expect(built.body).not.toHaveProperty('sudo')
    expect(built.body).not.toHaveProperty('role')
  })
})

describe('mfaUpstreamHeaders — whose credential goes upstream', () => {
  it('presents the user token as Bearer, never the service role, and never the cookie', () => {
    const headers = mfaUpstreamHeaders('user-access-token', 'anon-key')
    expect(headers.get('Authorization')).toBe('Bearer user-access-token')
    expect(headers.get('apikey')).toBe('anon-key')
    expect(headers.get('Cache-Control')).toBe('no-store')
    expect(headers.get('Cookie')).toBeNull()
  })
})

describe('projectMfaResponse — what the browser may learn', () => {
  it('drops every credential from a verify payload and returns a locally computed result', () => {
    // The whole reason this route is purpose-built. A raw relay would hand the
    // page a live aal2 access/refresh token — a token oracle behind a cookie.
    const leaked = projectMfaResponse('verify', {
      access_token: 'super-secret-jwt',
      refresh_token: 'super-secret-refresh',
      expires_in: 3600,
      user: { id: UUID, email: 'victim@example.com' },
    })
    const text = JSON.stringify(leaked)
    expect(leaked).toEqual({ status: 'verified', aal: 'aal2' })
    expect(text).not.toMatch(/secret|access_token|refresh_token|email|victim/)
  })

  it('lists factors WITH their status, including unverified ones', () => {
    const out = projectMfaResponse('list', {
      id: UUID,
      email: 'user@example.com',
      factors: [
        { id: UUID, factor_type: 'totp', friendly_name: 'Auth', status: 'verified' },
        { id: 'aaaa0000-1111-2222-3333-444455556666', factor_type: 'totp', friendly_name: 'Stale', status: 'unverified' },
      ],
    } as any) as { factors: Array<Record<string, unknown>> }
    // Wider than auth-js's verified-only buckets: the stale-factor cleanup in
    // MfaSetup depends on the unverified row being present.
    expect(out.factors).toHaveLength(2)
    expect(out.factors.map((f) => f.status)).toEqual(['verified', 'unverified'])
    // No email, no user id leaking through the projection.
    expect(JSON.stringify(out)).not.toMatch(/example\.com/)
  })

  it('formats the enroll QR as the data-URI auth-js would have produced', () => {
    const out = projectMfaResponse('enroll', {
      id: UUID,
      friendly_name: 'Auth',
      totp: { qr_code: '<svg>raw</svg>', secret: 'JBSWY3DP' },
    }) as any
    expect(out.totp.qr_code).toBe('data:image/svg+xml;utf-8,<svg>raw</svg>')
    expect(out.totp.secret).toBe('JBSWY3DP')
  })

  it('returns {} defensively for a null body and { factors: [] } for a factor-less user', () => {
    expect(projectMfaResponse('challenge', null)).toEqual({})
    expect(projectMfaResponse('list', undefined)).toEqual({})
    // A real getUser result with no factors set is the honest empty list, not {}.
    expect(projectMfaResponse('list', { id: UUID })).toEqual({ factors: [] })
  })
})

describe('rotatesSession', () => {
  it('flags only verify as producing a credential that must be persisted', () => {
    expect(rotatesSession('verify')).toBe(true)
    for (const op of ['list', 'enroll', 'challenge', 'unenroll'] as const) {
      expect(rotatesSession(op)).toBe(false)
    }
  })
})

describe('tokenNeedsRenewal', () => {
  /** Mint a JWT-shaped token whose exp is `offset` seconds from now. */
  function tokenExpiringIn(offset: number): string {
    const exp = Math.floor(Date.now() / 1000) + offset
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
    return `header.${payload}.sig`
  }

  it('renews a token inside the safety skew and keeps one comfortably alive', () => {
    expect(tokenNeedsRenewal(tokenExpiringIn(TOKEN_SKEW_SECONDS + 300))).toBe(false)
    expect(tokenNeedsRenewal(tokenExpiringIn(TOKEN_SKEW_SECONDS - 30))).toBe(true)
    expect(tokenNeedsRenewal(tokenExpiringIn(-10))).toBe(true)
  })

  it('fails toward the lease for an unparsable or absent token', () => {
    // A guaranteed 401 at GoTrue is worse than one extra refresh call.
    expect(tokenNeedsRenewal(undefined)).toBe(true)
    expect(tokenNeedsRenewal('garbage')).toBe(true)
    expect(tokenNeedsRenewal('a.!!!notbase64!!!.c')).toBe(true)
    expect(tokenNeedsRenewal('a.' + Buffer.from('{}').toString('base64url') + '.c')).toBe(true)
  })
})

describe('mapMfaError — our status, not a raw upstream relay', () => {
  it('preserves 401 so the client can tell expiry from a wrong code', () => {
    const e = mapMfaError(401, { message: 'JWT expired' })
    expect(e.status).toBe(401)
    expect(e.retry).toBe(true)
  })

  it('keeps user-fixable validation at 422 and rate limits at 429', () => {
    expect(mapMfaError(422, { message: 'code does not match' }).status).toBe(422)
    expect(mapMfaError(429, {}).status).toBe(429)
    expect(mapMfaError(423, {}).status).toBe(423)
  })

  it('turns anything unmappable into a 502 rather than inventing a client error', () => {
    expect(mapMfaError(500, { message: 'boom' }).status).toBe(502)
    expect(mapMfaError(418, null).status).toBe(502)
  })

  it('reads only code/message and truncates a runaway message', () => {
    const long = 'x'.repeat(5000)
    const e = mapMfaError(422, { message: long, access_token: 'leak' })
    expect(e.message.length).toBeLessThanOrEqual(200)
    expect(JSON.stringify(e)).not.toMatch(/leak/)
  })
})
