import { describe, it, expect, vi, afterEach } from 'vitest'
import { refreshSession } from './session'

// The mapping this file tests is the difference between "retry shortly" and
// "you are signed out". Getting it wrong is not loud: a 401 read as 'retry'
// loops forever against a dead session, and a 503 read as 'dead' logs people out
// during an identity-provider blip. Both look like a working app right up until
// someone's day goes wrong, so each status is pinned individually.
function reply(status: number) {
  return { ok: status >= 200 && status < 300, status } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('refreshSession', () => {
  it('maps 200 to renewed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200)))
    await expect(refreshSession()).resolves.toBe('renewed')
  })

  it('maps 401 to dead — the one outcome a caller must not retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(401)))
    await expect(refreshSession()).resolves.toBe('dead')
  })

  // 409 (lease held by another tab), 429 (limiter) and 503 (misconfigured or
  // upstream down) are all "nothing is wrong with the session".
  it.each([403, 409, 429, 500, 503])('maps %i to retry', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(status)))
    await expect(refreshSession()).resolves.toBe('retry')
  })

  it('maps a transport failure to retry, not dead', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network')}))
    await expect(refreshSession()).resolves.toBe('retry')
  })

  it('sends a credentialed POST and nothing else', async () => {
    // Arguments are captured here rather than read back off mock.calls: a
    // zero-parameter mock types its call tuple as [], so `calls[0][1]` has no
    // second element to read.
    const calls: Array<{ url: unknown; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url, init })
      return reply(200)
    }))
    await refreshSession()
    expect(calls[0].url).toBe('/api/auth/refresh')
    // Without credentials no cookie is attached, and the route answers 401
    // forever — quietly, and identically to "nobody is signed in".
    expect(calls[0].init?.credentials).toBe('same-origin')
    expect(calls[0].init?.method).toBe('POST')
  })

  it('never surfaces the credentials from a successful body', async () => {
    // Defence in depth: the route withholds them, and if that were ever widened
    // this function must still not hand a token to JS.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 }) as Response),
    )
    await expect(refreshSession()).resolves.toBe('renewed')
  })
})
