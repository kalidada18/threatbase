import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout } from './withTimeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('passes a resolving promise through untouched', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'enroll')).resolves.toBe('ok')
  })

  it('rejects a promise that never settles, rather than hanging forever', async () => {
    vi.useFakeTimers()
    // The production shape: a promise that neither resolves nor rejects.
    const stalled = withTimeout(new Promise(() => {}), 15_000, 'enroll')
    const assertion = expect(stalled).rejects.toThrow(/enroll timed out after 15s/)
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
  })

  it('propagates an underlying rejection unchanged, not as a timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'enroll'))
      .rejects.toThrow('boom')
  })

  it('does not reject before the deadline when the promise resolves in time', async () => {
    vi.useFakeTimers()
    const slowButFine = withTimeout(
      new Promise((r) => setTimeout(() => r('done'), 1_000)),
      15_000,
      'enroll',
    )
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(slowButFine).resolves.toBe('done')
  })
})
