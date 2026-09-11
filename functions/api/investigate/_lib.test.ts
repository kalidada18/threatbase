// functions/api/investigate/_lib.test.ts
import { describe, expect, it } from 'vitest'
import { sniffType, isPublicIp, cacheKey, sanitizeKv, cacheTtl, staleAt, mergeVerdict, rankRelations, hostingType, buildTimeline, type Relation, type Sighting, type Verdict } from './_lib'

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

describe('sanitizeKv', () => {
  it('strips spaces, unicode and path separators KV rejects', () => {
    expect(sanitizeKv('rl_refresh:2001:db8:: 1:inv:ipv4:8.8.8.8')).toBe('rl_refresh:2001:db8::1:inv:ipv4:8.8.8.8')
    expect(sanitizeKv('ünïcödé x')).toBe('ncdx') // unicode/space out, ASCII survives
    expect(sanitizeKv('evil.com/a?x=1')).toBe('evil.comax1')
    expect(sanitizeKv('')).toBe('')
  })
  it('keeps legit ipv6/domain keys intact', () => {
    expect(sanitizeKv(cacheKey('ipv6', '2001:db8::1'))).toBe('inv:ipv6:2001:db8::1')
    expect(sanitizeKv(cacheKey('domain', 'evil.example.com'))).toBe('inv:domain:evil.example.com')
  })
})

describe('cacheTtl', () => {
  const v = (status: Verdict['status'], confidence: Verdict['confidence']): Verdict =>
    ({ score: 0, malicious_by: 0, total_engines: 0, status, confidence, dominant_source: null })
  it('assigns 2h to high-confidence malicious verdict', () => {
    expect(cacheTtl({ score: 95, status: 'malicious', confidence: 'high', malicious_by: 3, total_engines: 5, dominant_source: 'feodo' })).toBe(7200)
  })
  it('assigns 48h to clean verdict', () => {
    expect(cacheTtl({ score: 0, status: 'clean', confidence: 'low', malicious_by: 0, total_engines: 4, dominant_source: null })).toBe(172800)
  })
  it('tiers per status/confidence', () => {
    expect(cacheTtl(v('malicious', 'medium'))).toBe(14400)   // malicious, not high conf
    expect(cacheTtl(v('malicious', 'low'))).toBe(14400)
    expect(cacheTtl(v('high_risk', 'high'))).toBe(21600)     // high_risk even at high conf
    expect(cacheTtl(v('suspicious', 'high'))).toBe(43200)
    expect(cacheTtl(v('clean', 'high'))).toBe(172800)
    expect(cacheTtl(v('unknown', 'low'))).toBe(86400)        // 24h default
  })
})

it('staleAt adds ttl seconds to generatedAt', () => {
  const at = '2026-09-10T00:00:00.000Z'
  const result = staleAt(at, 7200)
  expect(result).toBe('2026-09-10T02:00:00.000Z')
})

describe('mergeVerdict', () => {
  const parts = [
    { source: 'threatbase', malicious: true }, { source: 'otx', malicious: true },
    { source: 'vt', malicious: true }, { source: 'shodan', malicious: false },
    { source: 'geo', malicious: null }, // null = no opinion, must not count in total
  ]
  it('counts opinions vs no-opinions; weighted model flips 3 mid-weight hits to high_risk', () => {
    const v = mergeVerdict(parts)
    // threatbase(8)+otx(5)+vt-default(2), decay 0.5 (no last_seen) → score 70
    expect(v).toMatchObject({ malicious_by: 3, total_engines: 4, status: 'high_risk', score: 70 })
    expect(v.status).not.toBe('')
  })
  it('8 hits still reach "malicious", zero opinions still "unknown"', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ source: `s${i}`, malicious: true }))
    expect(mergeVerdict(many).status).toBe('malicious')
    expect(mergeVerdict([{ source: 'x', malicious: null }]).status).toBe('unknown')
  })
})

describe('mergeVerdict — weighted scorer', () => {
  it('Feodo C2 confirmation alone scores >= 80 (malicious)', () => {
    const v = mergeVerdict([{ source: 'feodo', malicious: true, last_seen: new Date().toISOString() }])
    expect(v.score).toBeGreaterThanOrEqual(80)
    expect(v.status).toBe('malicious')
    expect(v.dominant_source).toBe('feodo')
  })

  it('single VT flag (1 engine) scores < 30 (suspicious, not malicious)', () => {
    const v = mergeVerdict([{ source: 'virustotal', malicious: true, last_seen: new Date().toISOString() }])
    expect(v.score).toBeLessThan(30)
    expect(['suspicious', 'clean']).toContain(v.status)
  })

  it('365-day-old feodo hit decays below fresh hit', () => {
    const old = new Date(Date.now() - 366 * 86400000).toISOString()
    const fresh = new Date().toISOString()
    const vOld = mergeVerdict([{ source: 'feodo', malicious: true, last_seen: old }])
    const vFresh = mergeVerdict([{ source: 'feodo', malicious: true, last_seen: fresh }])
    expect(vFresh.score).toBeGreaterThan(vOld.score)
  })

  it('all-null opinions returns unknown with score 0', () => {
    const v = mergeVerdict([{ source: 'geo', malicious: null }])
    expect(v.status).toBe('unknown')
    expect(v.score).toBe(0)
  })

  it('confidence is high when dominant source weight >= 8', () => {
    const v = mergeVerdict([{ source: 'feodo', malicious: true, last_seen: new Date().toISOString() }])
    expect(v.confidence).toBe('high')
  })

  it('confidence is low when only low-weight sources fire', () => {
    const v = mergeVerdict([{ source: 'shodan', malicious: true, last_seen: new Date().toISOString() }])
    expect(v.confidence).toBe('low')
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
