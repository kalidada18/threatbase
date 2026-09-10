// functions/api/investigate/_lib.test.ts
import { describe, expect, it } from 'vitest'
import { sniffType, isPublicIp, cacheKey, mergeVerdict, rankRelations, hostingType, buildTimeline, type Relation, type Sighting } from './_lib'

describe('sniffType', () => {
  it('recognizes every supported indicator shape', () => {
    expect(sniffType('45.155.205.23')).toBe('ipv4')
    expect(sniffType('2001:db8::1')).toBe('ipv6')
    expect(sniffType('evil.example.com')).toBe('domain')
    expect(sniffType('hxxp://evil.com/a[.]php')).toBe('url')          // refang happens first
    expect(sniffType('44d88612fea8a8f36de82e1278abb02f')).toBe('md5')
    expect(sniffType('44d88612fea8a8f36de82e1278abb02f'.repeat(2).slice(0, 40))).toBe('sha1')
    expect(sniffType('a'.repeat(64))).toBe('sha256')
    expect(sniffType('not an indicator!')).toBeNull()
  })
})

describe('isPublicIp', () => {
  it('rejects private/reserved ranges', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true)
    for (const bad of ['10.0.0.1', '127.0.0.1', '169.254.1.1', '192.168.1.1', '100.64.0.1', '255.255.255.255']) {
      expect(isPublicIp(bad)).toBe(false)
    }
    expect(isPublicIp('nope')).toBe(false)
  })
})

it('cacheKey is stable and namespaced', () => {
  expect(cacheKey('ipv4', '8.8.8.8')).toBe('inv:ipv4:8.8.8.8')
})

describe('mergeVerdict', () => {
  const parts = [
    { source: 'threatbase', malicious: true }, { source: 'otx', malicious: true },
    { source: 'vt', malicious: true }, { source: 'shodan', malicious: false },
    { source: 'geo', malicious: null }, // null = no opinion, must not count in total
  ]
  it('scores status by malicious-source count with text always present', () => {
    const v = mergeVerdict(parts)
    expect(v).toMatchObject({ malicious_by: 3, total_engines: 4, status: 'suspicious' })
    expect(v.status).not.toBe('')
  })
  it('8+ malicious flips to "malicious", zero opinions to "unknown"', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ source: `s${i}`, malicious: true }))
    expect(mergeVerdict(many).status).toBe('malicious')
    expect(mergeVerdict([{ source: 'x', malicious: null }]).status).toBe('unknown')
  })
})

describe('rankRelations', () => {
  const mk = (weight: number, days: number, type = 'domain'): Relation =>
    ({ type, value: `${weight}.example.com`, edge: 'test', weight, last_seen: new Date(Date.UTC(2026, 8, 10 - days)).toISOString() })
  it('caps and keeps heaviest+most-recent first', () => {
    const rels = [...Array(50)].map((_, i) => mk(i, i % 30))
    const out = rankRelations(rels, 40)
    expect(out).toHaveLength(40)
    expect(out[0].weight).toBe(49)
  })
  it('dedupes by type+value, keeping max weight', () => {
    const dupes = [{ type: 'domain' as const, value: 'a.com', weight: 1 }, { type: 'domain' as const, value: 'a.com', weight: 5 }]
    expect(rankRelations(dupes)).toEqual([{ type: 'domain', value: 'a.com', weight: 5 }])
  })
})

it('hostingType classifies by org keywords, not geolocation', () => {
  expect(hostingType('Hetzner Online GmbH')).toBe('vps/cloud')
  expect(hostingType('Amazon.com, Inc.')).toBe('vps/cloud')
  expect(hostingType('Telia Company')).toBe('backbone')
  expect(hostingType('Comcast Cable')).toBe('residential/business')
  expect(hostingType(null)).toBe('unknown')
})

it('buildTimeline merges sightings, collapses per day, sorts', () => {
  const s: Sighting[] = [
    { date: '2026-09-02T10:00:00Z', source: 'feodo', event: 'listed' },
    { date: '2026-09-02T22:00:00Z', source: 'otx', event: 'pulse' },
    { date: '2026-08-11T01:00:00Z', source: 'vt', event: 'flagged' },
  ]
  const t = buildTimeline(s)
  expect(t.map((p) => p.count)).toEqual([1, 2])   // oldest first
  expect(t[1].sources).toEqual(['feodo', 'otx'])
})
