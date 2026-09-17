import { describe, it, expect } from 'vitest'
import { pickVerifiedTotpFactor } from './mfaFactor'

const f = (id: string, status: string) => ({ id, status })

describe('pickVerifiedTotpFactor', () => {
  it('skips a stale unverified factor that sorts first', () => {
    // The exact shape that broke both the setup card and the login challenge.
    const picked = pickVerifiedTotpFactor([f('stale', 'unverified'), f('real', 'verified')])
    expect(picked?.id).toBe('real')
  })

  it('returns null when nothing is verified, so no challenge is raised', () => {
    expect(pickVerifiedTotpFactor([f('stale', 'unverified')])).toBeNull()
  })

  it('is null-safe when the list is missing or empty', () => {
    expect(pickVerifiedTotpFactor(undefined)).toBeNull()
    expect(pickVerifiedTotpFactor(null)).toBeNull()
    expect(pickVerifiedTotpFactor([])).toBeNull()
  })
})
