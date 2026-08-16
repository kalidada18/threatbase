import { describe, it, expect } from 'vitest'
import { feeds } from './Feeds'
import { DATA_RAMP, INDICATOR_ACCENT } from '../utils'

/**
 * The feed bento is hand-tiled: each card declares a `lg:col-span-N` out of 6.
 * If the spans stop packing into full rows the desktop grid grows a visible
 * hole, which is the kind of break nobody notices until it ships.
 */
describe('feed bento spans', () => {
  const spans = feeds.map((f) => Number(f.span.replace('lg:col-span-', '')))

  it('declares a span between 1 and 6 for every feed', () => {
    expect(spans).toHaveLength(feeds.length)
    for (const s of spans) {
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(1)
      expect(s).toBeLessThanOrEqual(6)
    }
  })

  it('packs into complete 6-column rows with no gaps', () => {
    let row = 0
    for (const s of spans) {
      row += s
      // A card may never straddle a row boundary, or the grid reflows it and
      // leaves the previous row short.
      expect(row).toBeLessThanOrEqual(6)
      if (row === 6) row = 0
    }
    expect(row).toBe(0) // last row closed out
  })
})

describe('accent lock', () => {
  it('draws every feed accent from the shared ramp', () => {
    for (const f of feeds) {
      expect(DATA_RAMP).toContain(f.accent)
    }
  })

  it('gives each indicator type a distinct accent', () => {
    const used = Object.values(INDICATOR_ACCENT)
    expect(new Set(used).size).toBe(used.length)
  })

  it('carries no off-palette hue (no AI-purple, cyan, emerald, or indigo)', () => {
    const banned = ['#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#10b981', '#f97316']
    for (const c of DATA_RAMP) {
      expect(banned).not.toContain(c.toLowerCase())
    }
  })
})
