/**
 * Unit tests for the /api/db proxy's pure decisions (Phase 2).
 *
 * Deliberate scope rule, same as _session.test.ts: nothing here touches a
 * database. The functions under test are the ones where a silent mistake is
 * worst — the path allowlist (too loose = RLS bypass or SSRF), the request
 * header filter (too loose = the visitor's cookie or someone's service-role key
 * reaches PostgREST), and the response filter (too loose = GoTrue starts
 * setting a second session cookie beside tb_session).
 *
 * What is NOT tested: that a real query returns the right rows. That needs the
 * real PostgREST; mocking it would only prove the mock works.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_BODY_BYTES,
  bodyTooLarge,
  filterResponseHeaders,
  forwardRequestHeaders,
  resolveUpstream,
} from './_dbProxy'
import { SUPABASE_ANON_KEY } from '../../src/lib/supabaseConfig'

const BASE = 'https://api.threatbase.qzz.io'
const USER_TOKEN = 'eyJ1c2VyLXRva2Vu' // stand-in for the caller's own access token

/** A browser request carrying the headers a real supabase-js call sends. */
function clientRequest(overrides: Record<string, string> = {}): Request {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    Accept: 'application/json',
    Cookie: 'tb_session=some-secret; cf_clearance=another',
    apikey: 'client-side-anon',
    Authorization: 'Bearer whatever-the-browser-had',
    'X-Forwarded-For': '203.0.113.9',
    'CF-Connecting-IP': '203.0.113.9',
    Host: 'threatbase.qzz.io',
    ...overrides,
  })
  return new Request(`${BASE}/api/db/rest/v1/profiles`, { headers })
}

describe('resolveUpstream — path allowlist', () => {
  it('maps a PostgREST table read onto the real project', () => {
    expect(resolveUpstream('/api/db/rest/v1/profiles', BASE)).toEqual({
      url: `${BASE}/rest/v1/profiles`,
      service: 'rest/v1',
    })
  })

  it('maps an RPC call, keeping the nested tail intact', () => {
    const t = resolveUpstream('/api/db/rest/v1/rpc/mint_api_key', BASE)
    expect(t?.url).toBe(`${BASE}/rest/v1/rpc/mint_api_key`)
  })

  it('maps a filtered query path with embedded-resource segments', () => {
    const t = resolveUpstream('/api/db/rest/v1/reported_ips_feed', BASE)
    expect(t?.url).toBe(`${BASE}/rest/v1/reported_ips_feed`)
  })

  it('rejects auth/v1: no caller, and it would not have worked', () => {
    // The counter-test that makes the allowlist a real gate rather than a
    // default-allow list. See the ALLOWED_SERVICES comment in _dbProxy.ts: nothing
    // in src/ calls db.auth, and with persistSession:false auth-js fails locally
    // before issuing HTTP, so the passthrough could never serve MFA anyway.
    // Left open, it is an edge-fronted relay for GoTrue's rate-limited endpoints.
    for (const path of [
      '/api/db/auth/v1/verify',
      '/api/db/auth/v1/factors/factor-id/verify',
      '/api/db/auth/v1/token?refresh_token=x',
      '/api/db/auth/v1/otp',
      '/api/db/auth/v1/signup',
      '/api/db/auth/v1/recover',
      '/api/db/auth/v1/admin/users',
    ]) {
      expect(resolveUpstream(path, BASE), path).toBeNull()
    }
  })

  it('rejects services that are not allowlisted', () => {
    // storage and realtime are absent because the browser tree generates no
    // traffic for them; a request for them must be refused, not proxied.
    for (const path of [
      '/api/db/storage/v1/object/public/x.png',
      '/api/db/realtime/v1/websocket',
      '/api/db/rest/v1/../storage/v1/object',
      '/api/db/functions/v1/some-worker',
      '/api/db/platform/api/profile',
    ]) {
      expect(resolveUpstream(path, BASE), path).toBeNull()
    }
  })

  it('rejects paths the route should not have called this with', () => {
    for (const path of [
      '/api/db',
      '/api/db/',
      '/api/db/rest',
      '/api/me',
      '/api/auth/session',
      '/rest/v1/profiles', // correct shape, wrong prefix
      '//api/db/rest/v1/profiles',
    ]) {
      expect(resolveUpstream(path, BASE), path).toBeNull()
    }
  })
})

describe('resolveUpstream — traversal', () => {
  // These are the interesting ones: the service check runs on segments[0..1], so
  // an escape has to be smuggled in through the tail. If any of these resolve,
  // the allowlist has stopped meaning anything.
  const ESCAPES = [
    '/api/db/rest/v1/../../auth/v1/admin/users',
    '/api/db/rest/v1/.//..//auth/v1/admin/users',
    '/api/db/rest/v1/..%2f..%2fauth%2fv1%2fadmin%2fusers',
    '/api/db/rest/v1/%2e%2e/%2e%2e/auth/v1/admin/users',
    '/api/db/rest/v1/%2E%2E/auth/v1',
    // The mixed forms: no literal `..`, and the URL parser still reads them as
    // dot segments. These are the ones a literal-dot check waves through.
    '/api/db/rest/v1/.%2e/auth/v1/admin/users',
    '/api/db/rest/v1/%2e./auth/v1/admin/users',
    '/api/db/rest/v1/profiles/%2e%2e/%2e%2e/storage/v1/object',
    // A malformed escape is refused rather than forwarded for someone else to
    // interpret.
    '/api/db/rest/v1/%zz/bad-escape',
    '/api/db/rest/v1/profiles/./..',
    '/api/db/rest/v1/openapi.json',
  ]

  it.each(ESCAPES)('rejects %s', (path) => {
    expect(resolveUpstream(path, BASE)).toBeNull()
  })

  it('never lets a rejected path produce a URL object at all', () => {
    // Guards the shape of the contract: null, not an empty/partial target.
    for (const path of ESCAPES) {
      const t = resolveUpstream(path, BASE)
      expect(t).toBeNull()
    }
  })

  it('keeps the resolved path inside the allowlisted service prefix', () => {
    // The invariant that makes the specific encodings above non-load-bearing:
    // whatever the URL parser did to the path, it must still start with the
    // service that was checked against the allowlist.
    //
    // rest/v1 only. A rejected service never reaches the invariant, which is the
    // point of the two-tier defense: the prefix check is the backstop, the
    // allowlist is the gate.
    for (const path of [
      '/api/db/rest/v1/profiles',
      '/api/db/rest/v1/rpc/mint_api_key',
      '/api/db/rest/v1/reported_ips_feed',
    ]) {
      const t = resolveUpstream(path, BASE)
      expect(t).not.toBeNull()
      const service = path.split('/')[3] + '/' + path.split('/')[4]
      expect(new URL(t!.url).pathname.startsWith(`/${service}/`)).toBe(true)
    }
  })
})

describe('resolveUpstream — the host is never client-controlled', () => {
  it('always targets the configured project regardless of the tail', () => {
    // No SSRF: the tail can name a path, never an authority. The scheme check
    // means a host can only come from SUPABASE_URL, which we own.
    const t = resolveUpstream('/api/db/rest/v1/evilhost/x', BASE)
    expect(new URL(t!.url).host).toBe(new URL(BASE).host)
    expect(new URL(t!.url).protocol).toBe('https:')
  })

  it('rejects a host-looking tail outright rather than proxying it', () => {
    // `evil.com` in a path segment is caught by the dot rule, so the shape of
    // the rejection is asserted here to keep it from quietly becoming a pass.
    expect(resolveUpstream('/api/db/rest/v1/evil.com/x', BASE)).toBeNull()
  })

  it('discards a path baked into the configured base instead of appending to it', () => {
    const t = resolveUpstream('/api/db/rest/v1/profiles', `${BASE}/stray/prefix`)
    expect(t?.url).toBe(`${BASE}/rest/v1/profiles`)
  })

  it('returns a URL with no query or hash, so the route can append search once', () => {
    const t = resolveUpstream('/api/db/rest/v1/profiles', `${BASE}?a=b#frag`)
    expect(t?.url).not.toContain('?')
    expect(t?.url).not.toContain('#')
  })

  it('rejects a malformed configured base rather than throwing', () => {
    expect(resolveUpstream('/api/db/rest/v1/profiles', 'not a url')).toBeNull()
    expect(resolveUpstream('/api/db/rest/v1/profiles', '')).toBeNull()
    expect(resolveUpstream('/api/db/rest/v1/profiles', 'ftp://host')).toBeNull()
  })
})

describe('forwardRequestHeaders — what reaches PostgREST', () => {
  const out = (req: Request) => forwardRequestHeaders(req, USER_TOKEN)

  it('presents the user token from the session row, nothing else', () => {
    expect(out(clientRequest()).get('Authorization')).toBe(`Bearer ${USER_TOKEN}`)
  })

  it('drops the visitor cookie entirely', () => {
    // tb_session must terminate at the edge. If it were forwarded it would be
    // useless upstream and would sit in Kong/PostgREST logs forever.
    const headers = out(clientRequest())
    expect(headers.get('Cookie')).toBeNull()
    expect(headers.get('Authorization')).not.toContain('tb_session')
  })

  it('overwrites a client-supplied apikey with the anon key', () => {
    // A caller that sends its own apikey must not be able to pick which key the
    // edge presents.
    const hostile = clientRequest({ apikey: 'ATTACKER_KEY' })
    expect(out(hostile).get('apikey')).toBe(SUPABASE_ANON_KEY)
  })

  it('ignores a client-supplied Authorization rather than trusting it', () => {
    const hostile = clientRequest({ Authorization: 'Bearer attacker-jwt' })
    expect(out(hostile).get('Authorization')).toBe(`Bearer ${USER_TOKEN}`)
  })

  it('refuses to forward a service-role bearer token from the browser', () => {
    // The point of the whole module: the upstream credential comes from the
    // session row, so no browser-side header can escalate to the service role.
    const service = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig'
    const headers = out(clientRequest({ Authorization: `Bearer ${service}` }))
    expect(headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`)
    expect(headers.get('Authorization')).not.toContain('service_role')
  })

  it('strips hop-by-hop and CDN/client-identity headers', () => {
    const headers = out(clientRequest())
    for (const name of ['Host', 'X-Forwarded-For', 'CF-Connecting-IP', 'Content-Length']) {
      expect(headers.get(name), name).toBeNull()
    }
  })

  it('keeps the headers PostgREST actually needs from the client', () => {
    const headers = out(clientRequest())
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Prefer')).toBe('return=representation')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('preserves Range so paginated reads keep working', () => {
    const headers = out(clientRequest({ Range: '0-999' }))
    expect(headers.get('Range')).toBe('0-999')
  })

  it('forces no-store on the upstream request', () => {
    // A cached authenticated read would look like a write that silently failed.
    expect(out(clientRequest({ 'Cache-Control': 'max-age=600' })).get('Cache-Control')).toBe(
      'no-store',
    )
  })

  it('tolerates a request with no headers at all', () => {
    const bare = new Request(`${BASE}/api/db/rest/v1/profiles`)
    const headers = forwardRequestHeaders(bare, USER_TOKEN)
    expect(headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`)
    expect(headers.get('apikey')).toBe(SUPABASE_ANON_KEY)
  })
})

describe('filterResponseHeaders — what reaches the browser', () => {
  it('drops Set-Cookie so GoTrue cannot mint a second session beside tb_session', () => {
    const src = new Headers({ 'Set-Cookie': 'sb-access-token=jwt; Path=/' })
    expect(filterResponseHeaders(src).get('Set-Cookie')).toBeNull()
  })

  it('keeps the headers supabase-js parses', () => {
    const src = new Headers({
      'Content-Type': 'application/json',
      'Content-Range': '0-2/3',
      'Preference-Applied': 'return=representation',
      Location: '/rest/v1/profiles?id=eq.1',
    })
    const out = filterResponseHeaders(src)
    expect(out.get('Content-Type')).toBe('application/json')
    // The one that actually matters: postgrest-js fills `count` from this, so a
    // wrong name here degrades every paginated read to count: null.
    expect(out.get('Content-Range')).toBe('0-2/3')
    expect(out.get('Preference-Applied')).toBe('return=representation')
    expect(out.get('Location')).toBe('/rest/v1/profiles?id=eq.1')
  })

  it('does not pass upstream server or CORS headers through', () => {
    const src = new Headers({
      Server: 'postgREST/12.0',
      'Access-Control-Allow-Origin': BASE,
    })
    const out = filterResponseHeaders(src)
    expect(out.get('Server')).toBeNull()
    // CORS is minted locally; echoing the project host would leak the origin.
    expect(out.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('omits absent headers instead of setting empty ones', () => {
    const out = filterResponseHeaders(new Headers({ 'Content-Type': 'application/json' }))
    expect(out.get('Content-Range')).toBeNull()
    expect([...out.keys()]).toEqual(['content-type'])
  })
})

describe('bodyTooLarge', () => {
  it('accepts an empty or missing body (GET carries none)', () => {
    expect(bodyTooLarge(undefined)).toBe(false)
    expect(bodyTooLarge(null)).toBe(false)
    expect(bodyTooLarge('')).toBe(false)
  })

  it('accepts at the limit and rejects one over it', () => {
    expect(bodyTooLarge('x'.repeat(MAX_BODY_BYTES))).toBe(false)
    expect(bodyTooLarge('x'.repeat(MAX_BODY_BYTES + 1))).toBe(true)
  })
})
