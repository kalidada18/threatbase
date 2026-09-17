/**
 * /api/lookup caches one verdict per indicator in KV. The cached BODY is the
 * verdict computed for whichever spelling was requested first, and it is served
 * back verbatim — `data.ip` and all. So the cache key must address the exact
 * spelling asked for: if it folds case, a later request in different case is
 * served an `ip` it never searched, and everything downstream that keys off
 * that string (the comments query, the copy-link URL) addresses the wrong
 * indicator. For URLs it is worse than cosmetic — /AAA and /aaa are different
 * resources sharing one verdict.
 *
 * These pin the key, because that is the part that silently regressed.
 */
import { describe, it, expect, vi } from 'vitest'

// Stubbed so a MISS can never reach the network — the assertions are all about
// which key gets read, and a real scan would make the suite slow and flaky.
vi.mock('./_intel', () => ({
  scanIndicatorIntel: vi.fn(async (value: string) => ({ ip: value, malicious: false })),
}))

import { onRequestGet } from './lookup'

const TODAY = new Date().toISOString().split('T')[0]
const cacheKeyFor = (value: string) => `lookup/${TODAY}/${value}`

/** Records every key read; only serves what it was seeded with under that
 *  exact key. A fold in the handler therefore shows up as a MISS. */
function fakeKV(seed: Record<string, string> = {}) {
  const read: string[] = []
  return {
    read,
    kv: {
      get: async (k: string) => { read.push(k); return seed[k] ?? null },
      put: async () => undefined,
    },
  }
}

function call(value: string, kv: any) {
  return onRequestGet({
    request: new Request(`https://threatbase.test/api/lookup?value=${encodeURIComponent(value)}`),
    env: { IOC_CACHE: kv },
    waitUntil: () => {},
  })
}

describe('api/lookup cache key', () => {
  it('serves a hit keyed on the exact value, case included', async () => {
    const value = 'http://Example.COM/AAA'
    const body = JSON.stringify({ success: true, data: { ip: value } })
    const { kv, read } = fakeKV({ [cacheKeyFor(value)]: body })

    const res = await call(value, kv)

    expect(res.headers.get('X-KV-Cache')).toBe('HIT')
    expect(await res.json()).toMatchObject({ data: { ip: value } })
    expect(read).toContain(cacheKeyFor(value))
  })

  it('does not serve a mixed-case URL from an entry cached for its lowercase form', async () => {
    const value = 'http://Example.COM/AAA'
    const { kv, read } = fakeKV({
      [cacheKeyFor(value.toLowerCase())]: JSON.stringify({ success: true, data: { ip: value.toLowerCase() } }),
    })

    const res = await call(value, kv)

    // Never consulted the folded key, so it could not have been misattributed.
    expect(read).not.toContain(cacheKeyFor(value.toLowerCase()))
    expect(read).toContain(cacheKeyFor(value))
    expect(res.headers.get('X-KV-Cache')).toBe('MISS')
  })

  it('keeps two case-variant URLs in separate cache entries', async () => {
    const { kv, read } = fakeKV()
    await call('http://example.com/aaa', kv)
    await call('http://example.com/AAA', kv)

    expect(read).toContain(cacheKeyFor('http://example.com/aaa'))
    expect(read).toContain(cacheKeyFor('http://example.com/AAA'))
  })
})
