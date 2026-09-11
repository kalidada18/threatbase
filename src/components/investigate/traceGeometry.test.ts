import { describe, expect, it } from 'vitest'
import { convexHull, multiRingLayout, ringLayout } from './traceGeometry'
import type { Relation } from '@/investigationTypes'
import type { GraphNode, GraphState } from './traceState'

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

const gn = (type: Relation['type'], value: string, ring: number): GraphNode =>
  ({ type, value, weight: 1, ring, expanded: false })

const graph = (nodes: GraphNode[]): GraphState =>
  ({ nodes: new Map(nodes.map((n) => [`${n.type}:${n.value}`, n])), edges: [], pivotStack: [] })

describe('multiRingLayout', () => {
  it('places root at center', () => {
    const state = { nodes: new Map([['ipv4:8.8.8.8', { type: 'ipv4', value: '8.8.8.8', weight: 100, ring: 0, expanded: true }]]), edges: [], pivotStack: [] }
    const { cx, cy, positions } = multiRingLayout(state as unknown as GraphState, 720, 460)
    const root = positions.get('ipv4:8.8.8.8')!
    expect(root.x).toBe(cx)
    expect(root.y).toBe(cy)
  })
  it('assigns each node to its own ring radius, concentric', () => {
    const { cx, cy, positions } = multiRingLayout(graph([
      gn('ipv4', 'r', 0), gn('domain', 'a', 1), gn('domain', 'b', 1), gn('url', 'c', 2), gn('md5', 'd', 3),
    ]), 720, 460)
    const dist = (k: string) => Math.hypot(positions.get(k)!.x - cx, positions.get(k)!.y - cy)
    expect(dist('ipv4:r')).toBe(0)
    expect(dist('domain:a')).toBeCloseTo(160)
    expect(dist('domain:b')).toBeCloseTo(160)
    expect(dist('url:c')).toBeCloseTo(270)
    expect(dist('md5:d')).toBeCloseTo(360)
  })
  it('ring 2 nodes are evenly spread on their circle', () => {
    const { positions } = multiRingLayout(graph([
      gn('ipv4', 'r', 0), gn('domain', 'a', 2), gn('domain', 'b', 2), gn('domain', 'c', 2),
    ]), 720, 460)
    const angs = ['a', 'b', 'c'].map((v) => {
      const p = positions.get(`domain:${v}`)!
      return Math.round(Math.atan2(p.y - 230, p.x - 360) * 180 / Math.PI)
    })
    expect(angs).toEqual([-90, 30, 150])
  })
  it('unknown deeper rings clamp to the outer radius, not NaN', () => {
    const { positions } = multiRingLayout(graph([gn('ipv4', 'r', 0), gn('domain', 'x', 9)]), 720, 460)
    expect(Number.isNaN(positions.get('domain:x')!.x)).toBe(false)
  })
  it('is deterministic for the same input', () => {
    const g = graph([gn('ipv4', 'r', 0), gn('domain', 'a', 1), gn('domain', 'b', 1)])
    expect([...multiRingLayout(g).positions]).toEqual([...multiRingLayout(g).positions])
  })
})

describe('convexHull', () => {
  it('wraps 4+ points into the outer boundary only', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }])
    expect(hull).toHaveLength(4)
    expect(hull.some((p) => p.x === 5 && p.y === 5)).toBe(false)
  })
  it('passes through <3 points unchanged (no polygon possible)', () => {
    const two = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    expect(convexHull(two)).toEqual(two)
    expect(convexHull([])).toEqual([])
  })
})
