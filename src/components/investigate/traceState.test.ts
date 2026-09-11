import { describe, expect, it } from 'vitest'
import {
  MAX_NODES_PER_RING, MAX_RINGS, MAX_RESTORE_PIVOTS, collapseGraph,
  deserializePivotStack, mergeRelationsIntoGraph, restoreQueue,
  serializePivotStack, type GraphState,
} from './traceState'
import type { Relation } from '@/investigationTypes'

const rel = (type: Relation['type'], value: string, weight = 1, extra: Partial<Relation> = {}): Relation =>
  ({ type, value, weight, edge: 'test', ...extra })

const rootState = (): GraphState => ({
  nodes: new Map([['ipv4:1.2.3.4', { type: 'ipv4', value: '1.2.3.4', weight: 100, ring: 0, expanded: true }]]),
  edges: [],
  pivotStack: ['ipv4:1.2.3.4'],
})

describe('mergeRelationsIntoGraph', () => {
  it('deduplicates by type:value, keeps existing ring', () => {
    const initial = { nodes: new Map([['ipv4:1.2.3.4', { type: 'ipv4', value: '1.2.3.4', weight: 100, ring: 0, expanded: true }]]), edges: [], pivotStack: [] }
    const relations: Relation[] = [{ type: 'domain', value: 'evil.com', edge: 'resolves_to', weight: 5 }, { type: 'domain', value: 'evil.com', edge: 'same_pulse', weight: 3 }]
    const next = mergeRelationsIntoGraph(initial as unknown as GraphState, relations, 'ipv4:1.2.3.4', 1)
    expect(next.nodes.size).toBe(2) // root + 1 deduped relation
    expect(next.edges).toHaveLength(2) // edges are not deduped (multiple paths is info)
    expect(next.nodes.get('domain:evil.com')!.ring).toBe(1)
  })
  it('does not mutate the input state', () => {
    const s = rootState()
    mergeRelationsIntoGraph(s, [rel('domain', 'evil.com')], 'ipv4:1.2.3.4', 1)
    expect(s.nodes.size).toBe(1)
    expect(s.edges).toHaveLength(0)
  })
  it('caps new nodes at MAX_NODES_PER_RING but skips existing ones without burning budget', () => {
    const s = rootState()
    const existing = rel('domain', 'known.com')
    const fresh = Array.from({ length: MAX_NODES_PER_RING + 5 }, (_, i) => rel('domain', `h${i}.com`))
    // seed one node that already exists so it doesn't count toward the cap
    s.nodes.set('domain:known.com', { type: 'domain', value: 'known.com', weight: 1, ring: 1, expanded: false })
    const next = mergeRelationsIntoGraph(s, [existing, ...fresh], 'ipv4:1.2.3.4', 1)
    // known.com pre-exists (no budget burn); h0..h39 fill the ring, break before h40
    expect(next.nodes.size).toBe(2 + MAX_NODES_PER_RING)
    expect(next.nodes.has('domain:h0.com')).toBe(true)
    expect(next.nodes.has(`domain:h${MAX_NODES_PER_RING}.com`)).toBe(false)
    expect(next.edges).toHaveLength(1 + MAX_NODES_PER_RING) // edge for each relation processed before the cap break
  })
  it('skips malformed relations with no value or type', () => {
    const next = mergeRelationsIntoGraph(rootState(), [{ type: 'domain', value: '', edge: 'e', weight: 1 }, rel('domain', 'ok.com')], 'ipv4:1.2.3.4', 1)
    expect(next.nodes.size).toBe(2)
    expect(next.edges).toHaveLength(1)
  })
})

describe('restoreQueue', () => {
  it('skips index 0 (root == current q) and preserves order', () => {
    expect(restoreQueue(['ipv4:1.1.1.1', 'domain:a.com', 'url:http://x'])).toEqual(['domain:a.com', 'url:http://x'])
  })
  it('single-item stack (root only) restores nothing', () => {
    expect(restoreQueue(['ipv4:1.1.1.1'])).toEqual([])
  })
  it('caps re-fetches at MAX_RESTORE_PIVOTS (rl_inv is 8/min)', () => {
    const stack = Array.from({ length: 15 }, (_, i) => `domain:d${i}.com`)
    const q = restoreQueue(stack)
    expect(q).toHaveLength(MAX_RESTORE_PIVOTS)
    expect(q[0]).toBe('domain:d1.com') // root still skipped after cap
  })
})

describe('pivot stack URL codec', () => {
  it('round-trips values containing : / , and ? (URLs as pivots)', () => {
    const stack = ['ipv4:8.8.8.8', 'url:https://evil.example.com/a?b=1,c=2', 'domain:x.com']
    expect(deserializePivotStack(serializePivotStack(stack))).toEqual(stack)
  })
  it('empty string deserializes to no pivots', () => {
    expect(deserializePivotStack('')).toEqual([])
  })
})

describe('collapseGraph', () => {
  const deep = (): GraphState => {
    let s = rootState()
    s = mergeRelationsIntoGraph(s, [rel('domain', 'a.com'), rel('domain', 'b.com')], 'ipv4:1.2.3.4', 1)
    s = mergeRelationsIntoGraph(s, [rel('ipv4', '5.6.7.8')], 'domain:a.com', 2)
    s = mergeRelationsIntoGraph(s, [rel('md5', 'f'.repeat(32))], 'ipv4:5.6.7.8', 3)
    s.nodes.get('domain:a.com')!.expanded = true // a was pivoted (its children are ring 2)
    s.nodes.get('ipv4:5.6.7.8')!.expanded = true
    s.pivotStack = ['ipv4:1.2.3.4', 'domain:a.com', 'ipv4:5.6.7.8']
    return s
  }
  it('keeps the clicked node\'s children (ring depth+1), prunes deeper, resets frontier', () => {
    const c = collapseGraph(deep(), 1) // trail root › a survives; a's ring-2 children stay, ring-3 dies
    expect([...c.nodes.keys()].sort()).toEqual(['domain:a.com', 'domain:b.com', 'ipv4:1.2.3.4', 'ipv4:5.6.7.8'])
    expect(c.nodes.has('md5:' + 'f'.repeat(32))).toBe(false)
    expect(c.edges.every((e) => c.nodes.has(e.from) && c.nodes.has(e.to))).toBe(true)
    expect(c.pivotStack).toEqual(['ipv4:1.2.3.4', 'domain:a.com'])
    expect(c.nodes.get('ipv4:5.6.7.8')!.expanded).toBe(false) // children pruned → re-expandable
    expect(c.nodes.get('domain:a.com')!.expanded).toBe(true) // still on the trail, children intact
  })
  it('collapsing to depth 0 keeps root + ring-1 nodes and a root-only stack', () => {
    const c = collapseGraph(deep(), 0)
    expect(c.pivotStack).toEqual(['ipv4:1.2.3.4'])
    expect(c.nodes.has('ipv4:5.6.7.8')).toBe(false)
    expect(c.nodes.has('domain:a.com')).toBe(true) // ring-1 discovery survives stack collapse
    expect(c.nodes.get('domain:a.com')!.expanded).toBe(false) // its children were pruned
  })
})

describe('constants', () => {
  it('pin the plan values', () => {
    expect(MAX_RINGS).toBe(3)
    expect(MAX_NODES_PER_RING).toBe(40)
    expect(MAX_RESTORE_PIVOTS).toBe(7)
  })
})
