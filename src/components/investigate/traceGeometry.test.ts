import { describe, expect, it } from 'vitest'
import { ringLayout } from './traceGeometry'
import type { Relation } from '@/investigationTypes'

const rel = (type: Relation['type'], value: string, weight: number): Relation =>
  ({ type, value, weight, edge: 'test' })

describe('ringLayout', () => {
  const rels = [
    rel('domain', 'a.com', 1),
    rel('md5', 'f'.repeat(32), 9),
    rel('url', 'http://x.com/a', 5),
    rel('ipv4', '1.2.3.4', 1),
  ]
  it('is deterministic (same input -> same output)', () => {
    expect(ringLayout(rels)).toEqual(ringLayout(rels))
  })
  it('orders net sector first, then url, then hashes last', () => {
    const { pos } = ringLayout(rels)
    expect(pos.map((p) => p.r.type)).toEqual(['domain', 'ipv4', 'url', 'md5'])
  })
  it('heavier weight pushes the node outward', () => {
    const { pos } = ringLayout([rel('domain', 'light.com', 1), rel('domain', 'heavy.com', 8)])
    const light = pos.find((p) => p.r.value === 'light.com')!
    const heavy = pos.find((p) => p.r.value === 'heavy.com')!
    expect(heavy.radius).toBeGreaterThan(light.radius)
  })
  it('empty input still yields a usable center', () => {
    const { cx, cy, pos } = ringLayout([])
    expect(pos).toHaveLength(0)
    expect(cx).toBe(360)
    expect(cy).toBe(230)
  })
})
