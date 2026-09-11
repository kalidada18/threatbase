import { describe, expect, it } from 'vitest'
import { formatRelative } from './formatRelative'

const fromNow = (mins: number) => new Date(Date.now() + mins * 60000).toISOString()

describe('formatRelative', () => {
  it('renders future instants as countdowns', () => {
    expect(formatRelative(fromNow(23))).toBe('in 23 min')
    expect(formatRelative(fromNow(240))).toBe('in 4 h')
    expect(formatRelative(fromNow(49 * 60))).toBe('in 2 d') // 2.04 d — clear of the round boundary
  })
  it('past or now reads expired', () => {
    expect(formatRelative(fromNow(-1))).toBe('expired')
    expect(formatRelative(fromNow(0))).toBe('expired')
  })
  it('missing or garbage input degrades to empty', () => {
    expect(formatRelative(undefined)).toBe('')
    expect(formatRelative('')).toBe('')
    expect(formatRelative('not a date')).toBe('')
  })
})
