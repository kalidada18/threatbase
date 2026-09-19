/**
 * Unit tests for the session primitives (functions/api/_session.ts).
 *
 * Scope rule: these cover the pure logic where a silent mistake is worst — the
 * cookie attribute set, the CSRF host comparison, the id/hash shape gates, and
 * the encryption envelope. The DB-touching functions (resolveSession,
 * mintSession, rotateSession) are integration tests waiting on a test database;
 * mocking the PostgREST client here would only prove that the mock works, so
 * they are left honestly untested rather than tested falsely.
 *
 * `import.meta.env` is absent under vitest's node environment, so
 * supabaseConfig falls back to its literals and this module imports cleanly.
 */
import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_TTL_SECONDS,
  IDLE_TTL_SECONDS,
  SESSION_COOKIE,
  buildSessionCookie,
  clearedSessionCookie,
  dayStamp,
  decryptSecret,
  encKey,
  encryptSecret,
  hostnameOf,
  isTrustedOrigin,
  newSessionId,
  readSessionId,
  sha256hex,
} from './_session'

const PROD = 'https://threatbase.qzz.io/api/x'
const HUNT = 'https://hunt.threatbase.qzz.io/api/x'
const LOCAL = 'http://localhost:5173/api/x'

/** A cookie-bearing request for a given host, with an optional Origin header. */
function req(url: string, opts: { cookie?: string; origin?: string } = {}): Request {
  const headers = new Headers()
  if (opts.cookie) headers.set('Cookie', opts.cookie)
  if (opts.origin) headers.set('Origin', opts.origin)
  return new Request(url, { headers })
}

/** A real 43-char base64url id (32 bytes), so it satisfies the same shape gate
 *  newSessionId() is expected to satisfy. Lock that with a test below: an id of
 *  the wrong length makes every "rejected" assertion pass for the wrong reason. */
const VALID_ID = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1))
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')
const VALID_KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY' // 32 bytes

describe('test fixtures', () => {
  it('uses a cookie id that is actually the shape the gate enforces', () => {
    expect(VALID_ID).toHaveLength(43)
    expect(VALID_ID).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('sha256hex', () => {
  it('matches the known digest for "abc", lowercase hex', async () => {
    // The form api_keys.key_hash uses; if this ever emits base64 or uppercase,
    // every lookup silently misses and everyone appears signed out.
    expect(await sha256hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('is stable and 64 chars for an empty-ish input', async () => {
    const [a, b] = await Promise.all([sha256hex(''), sha256hex('')])
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('newSessionId', () => {
  it('is 43 base64url chars, which is 32 bytes of entropy with no padding', () => {
    const id = newSessionId()
    expect(id).toHaveLength(43)
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // No '+' or '/' means the value needs no encoding to survive a cookie.
    expect(id).not.toMatch(/[+/=]/)
  })

  it('never repeats across 500 draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(newSessionId())
    expect(seen.size).toBe(500)
  })

  it('is accepted by the same shape gate readSessionId enforces', () => {
    const id = newSessionId()
    const request = req(PROD, { cookie: `${SESSION_COOKIE}=${id}` })
    expect(readSessionId(request)).toBe(id)
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a token', async () => {
    const bundle = await encryptSecret('eyJhbGciOi.payload.sig', VALID_KEY_B64)
    expect(bundle).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(await decryptSecret(bundle, VALID_KEY_B64)).toBe('eyJhbGciOi.payload.sig')
  })

  it('produces a different ciphertext each time (fresh IV), both decrypting', async () => {
    const [a, b] = await Promise.all([
      encryptSecret('same plaintext', VALID_KEY_B64),
      encryptSecret('same plaintext', VALID_KEY_B64),
    ])
    expect(a).not.toBe(b)
    expect(await decryptSecret(a, VALID_KEY_B64)).toBe('same plaintext')
    expect(await decryptSecret(b, VALID_KEY_B64)).toBe('same plaintext')
  })

  it('refuses a tampered ciphertext instead of returning garbage', async () => {
    // GCM authentication is what makes a rewritten row fail closed. If this
    // resolved, an attacker with write access to one column could substitute a
    // token of their choosing.
    const bundle = await encryptSecret('secret token', VALID_KEY_B64)
    const [version, iv, ct] = bundle.split(':')
    const flipped = ct.slice(0, -1) + (ct.endsWith('A') ? 'B' : 'A')
    await expect(decryptSecret(`${version}:${iv}:${flipped}`, VALID_KEY_B64)).rejects.toThrow()
  })

  it('refuses the wrong key', async () => {
    const bundle = await encryptSecret('secret token', VALID_KEY_B64)
    await expect(decryptSecret(bundle, 'Zm9vYmFyLWJhemktZm9vYmFyLWJhemktd3Jvbmcta2V5ITE')).rejects.toThrow()
  })

  it('refuses an unknown envelope version rather than guessing', async () => {
    await expect(decryptSecret('v9:AAA:AAA', VALID_KEY_B64)).rejects.toThrow(/unsupported/)
    await expect(decryptSecret('no-colons', VALID_KEY_B64)).rejects.toThrow(/unsupported/)
  })
})

describe('encKey', () => {
  it('is null for a missing or short key — minting must fail closed, not default', () => {
    expect(encKey(undefined)).toBeNull()
    expect(encKey({})).toBeNull()
    expect(encKey({ SESSION_ENC_KEY: '' })).toBeNull()
    expect(encKey({ SESSION_ENC_KEY: 'too-short' })).toBeNull()
    expect(encKey({ SESSION_ENC_KEY: 42 })).toBeNull()
  })

  it('returns a 43-char base64 key', () => {
    expect(encKey({ SESSION_ENC_KEY: VALID_KEY_B64 })).toBe(VALID_KEY_B64)
  })
})

describe('readSessionId', () => {
  it('returns null when the cookie is absent', () => {
    expect(readSessionId(req(PROD))).toBeNull()
    expect(readSessionId(req(PROD, { cookie: 'other=1' }))).toBeNull()
  })

  it('rejects a wrong-shaped value before it reaches a query or a log', () => {
    const cases = [
      '',
      'short',
      VALID_ID + 'EXTRA',
      VALID_ID.slice(0, -1),
      'has+plus+and/slash',
      'injected; Domain=attacker',
      '../../etc/passwd',
      ' '.repeat(43),
    ]
    for (const value of cases) {
      expect(readSessionId(req(PROD, { cookie: `${SESSION_COOKIE}=${value}` }))).toBeNull()
    }
  })

  it('finds the session cookie among others and tolerates whitespace', () => {
    const cookie = `tb_theme=dark; ${SESSION_COOKIE}= ${VALID_ID} ; csrf=abcdef`
    expect(readSessionId(req(PROD, { cookie }))).toBe(VALID_ID)
  })

  it('does not match a prefix-named cookie', () => {
    expect(readSessionId(req(PROD, { cookie: `${SESSION_COOKIE}_extra=${VALID_ID}` }))).toBeNull()
  })
})

describe('cookie attributes', () => {
  it('are HttpOnly, Secure, SameSite=Lax, Path=/ on production', () => {
    const cookie = buildSessionCookie(req(PROD), VALID_ID, 3600)
    expect(cookie.startsWith(`${SESSION_COOKIE}=${VALID_ID};`)).toBe(true)
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=3600')
  })

  it('scope to the apex domain on our hosts so hunt. shares the session', () => {
    expect(buildSessionCookie(req(PROD), VALID_ID, 60)).toContain('Domain=.threatbase.qzz.io')
    expect(buildSessionCookie(req(HUNT), VALID_ID, 60)).toContain('Domain=.threatbase.qzz.io')
  })

  it('omit Domain on localhost, where a domain-scoped cookie would be rejected', () => {
    // Without this the cookie silently never sets in `wrangler pages dev`, which
    // reads as "sessions are broken" rather than "the attribute is invalid".
    const cookie = buildSessionCookie(req(LOCAL), VALID_ID, 60)
    expect(cookie).not.toContain('Domain=')
    expect(cookie).toContain('HttpOnly')
  })

  it('clear with the SAME attribute set, or the deletion misses the stored cookie', () => {
    const clear = clearedSessionCookie(req(PROD))
    expect(clear.startsWith(`${SESSION_COOKIE}=;`)).toBe(true)
    expect(clear).toContain('Max-Age=0')
    expect(clear).toContain('Domain=.threatbase.qzz.io')
    expect(clear).toContain('HttpOnly')
    // A Set-Cookie with different Path/Domain creates a second cookie instead of
    // removing the first, so compare the attribute tails explicitly.
    const attrs = (s: string) => s.split(';').slice(1).map((x) => x.trim()).sort().join(';')
    const live = buildSessionCookie(req(PROD), VALID_ID, 10)
    expect(attrs(clear).replace('Max-Age=0', 'X')).toBe(attrs(live).replace('Max-Age=10', 'X'))
  })

  it('keeps the liveness dials in the order the comments claim', () => {
    expect(IDLE_TTL_SECONDS).toBeLessThanOrEqual(ABSOLUTE_TTL_SECONDS)
  })
})

describe('isTrustedOrigin', () => {
  const accept = [
    'https://threatbase.qzz.io',
    'https://hunt.threatbase.qzz.io',
    'https://anything.deep.threatbase.qzz.io',
    'http://localhost:5173',
    'http://127.0.0.1:8788',
  ]
  const reject = [
    // The whole point of exact-then-dot-prefix: a bare endsWith eats this one.
    'https://threatbase.qzz.io.attacker.tld',
    'https://xthreatbase.qzz.io',
    'https://attacker.tld/threatbase.qzz.io',
    'https://not-localhost.dev',
    'http://localhost.attacker.tld',
    'https://evil.com',
    'not a url',
    'https://',
  ]

  it.each(accept)('accepts %s', (origin) => {
    expect(isTrustedOrigin(req(PROD, { origin }))).toBe(true)
  })

  it.each(reject)('rejects %s', (origin) => {
    expect(isTrustedOrigin(req(PROD, { origin }))).toBe(false)
  })

  it('treats a missing Origin as untrusted rather than skipping the check', () => {
    expect(isTrustedOrigin(req(PROD))).toBe(false)
  })

  it('falls back to Referer when Origin is absent, with the same rules', () => {
    const good = new Request(PROD, { headers: { Referer: 'https://threatbase.qzz.io/profile' } })
    const bad = new Request(PROD, { headers: { Referer: 'https://threatbase.qzz.io.attacker.tld/x' } })
    expect(isTrustedOrigin(good)).toBe(true)
    expect(isTrustedOrigin(bad)).toBe(false)
  })
})

describe('hostnameOf', () => {
  it('extracts the host from each shape the routes see', () => {
    expect(hostnameOf(req(PROD))).toBe('threatbase.qzz.io')
    expect(hostnameOf(req(HUNT))).toBe('hunt.threatbase.qzz.io')
    expect(hostnameOf(req(LOCAL))).toBe('localhost')
  })

  // The `catch` inside hostnameOf is deliberately NOT tested with a malformed
  // url: `new Request('bogus')` throws at construction in both undici and the
  // Workers runtime, so a Request always carries an absolute, parseable url and
  // that branch is unreachable from a real request. It stays as cheap defence
  // for a hand-built Request; asserting on it would mean faking the input.
})

describe('dayStamp', () => {
  it('is a UTC date, which is what makes a KV counter bucket day-scoped', () => {
    expect(dayStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dayStamp()).toBe(new Date().toISOString().slice(0, 10))
  })
})
