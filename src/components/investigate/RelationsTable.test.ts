import { describe, expect, it } from 'vitest'
import { filterRelations, inspectNode, sortRelations, type SortKey } from './RelationsTable'
import type { Relation } from '@/investigationTypes'
import type { GraphNode } from './traceState'

const rel = (value: string, extra: Partial<Relation> = {}): Relation =>
  ({ type: 'domain', value, edge: 'resolves_to', weight: 1, ...extra })

const node = (extra: Partial<GraphNode> = {}): GraphNode =>
  ({ type: 'ipv4', value: '1.2.3.4', weight: 5, ring: 1, expanded: false, edge: 'resolves_to', ...extra })

describe('sortRelations', () => {
  const rows = [rel('b.com', { weight: 2 }), rel('a.com', { weight: 7 }), rel('c.com', { weight: 4, malicious: true })]
  it('sorts by weight desc (default) and asc', () => {
    expect(sortRelations(rows, 'weight').map((r) => r.value)).toEqual(['a.com', 'c.com', 'b.com'])
    expect(sortRelations(rows, 'weight', 'asc').map((r) => r.value)).toEqual(['b.com', 'c.com', 'a.com'])
  })
  it('sorts string columns case-insensitively', () => {
    expect(sortRelations([rel('Z.com'), rel('a.com')], 'value', 'asc').map((r) => r.value)).toEqual(['a.com', 'Z.com'])
  })
  it('verdict orders flagged after unflagged on asc, first on desc', () => {
    expect(sortRelations(rows, 'verdict', 'desc')[0].malicious).toBe(true)
  })
  it('is deterministic on ties and does not mutate input', () => {
    const dup = [rel('b.com'), rel('a.com'), rel('c.com')]
    const sorted = sortRelations(dup, 'weight', 'asc')
    expect(sorted.map((r) => r.value)).toEqual(['a.com', 'b.com', 'c.com'])
    expect(dup[0].value).toBe('b.com')
  })
  it('missing via sorts last on asc (undefined-safe)', () => {
    const withVia = [rel('x.com'), rel('y.com', { via: 'pulse-1' })]
    expect(() => sortRelations(withVia, 'via' satisfies SortKey, 'asc')).not.toThrow()
  })
})

describe('filterRelations', () => {
  const rows = [rel('evil.com', { edge: 'resolves_to' }), rel('good.org', { via: 'pulse-alpha' }), rel('1.2.3.4', { type: 'ipv4' })]
  it('empty query returns all', () => expect(filterRelations(rows, '')).toHaveLength(3))
  it('matches value, edge, via and type, case-insensitive', () => {
    expect(filterRelations(rows, 'EVIL')).toHaveLength(1)
    expect(filterRelations(rows, 'alpha')).toHaveLength(1)
    // every fixture row carries edge resolves_to — a distinct edge narrows it
    expect(filterRelations([...rows, rel('deep.net', { edge: 'named_server' })], 'named')).toHaveLength(1)
    expect(filterRelations(rows, 'ipv4')).toHaveLength(1)
  })
  it('no match returns empty array, never throws on missing via', () => {
    expect(filterRelations(rows, 'zzz')).toEqual([])
    expect(filterRelations([rel('a.com')], 'a')).toHaveLength(1)
  })
})

describe('inspectNode', () => {
  const rows = [
    rel('evil.com', { via: 'p1', weight: 5 }),
    { type: 'ipv4', value: '1.2.3.4', edge: 'same_pulse', via: 'p1', weight: 3 } as Relation,
    { type: 'ipv4', value: '5.6.7.8', edge: 'resolves_to', weight: 1 } as Relation,
  ]
  it('null node yields an empty selection (panel shows root fallback upstream)', () => {
    expect(inspectNode(null, rows)).toMatchObject({ node: null, rows: [], verdict: null })
  })
  it('picks the matching rows by type + value, case-insensitive', () => {
    const r = inspectNode(node(), rows)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].value).toBe('1.2.3.4')
  })
  it('node with NO fetched sub-dossier still has its relation rows — never an empty panel', () => {
    const n = node({ value: 'evil.com', type: 'domain' }) // expanded=false, no mal_by
    const r = inspectNode(n, rows)
    expect(r.rows).toHaveLength(1)
    expect(r.verdict).toBeNull()
  })
  it('expanded node reports its verdict part', () => {
    const r = inspectNode(node({ expanded: true, mal_by: 3, engines: 9 }), rows)
    expect(r.verdict).toBe('3/9 sources flag it')
  })
})
