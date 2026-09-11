// functions/api/investigate/_lib.test.ts
import { describe, expect, it } from 'vitest'
import { sniffType, isPublicIp, cacheKey, sanitizeKv, cacheTtl, staleAt, mergeVerdict, rankRelations, hostingType, buildTimeline, validateNarrative, trimEvidence, type Relation, type Sighting, type Verdict } from './_lib'

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

describe('validateNarrative — Task C structured output', () => {
  const good = {
    verdict_sentence: 'Active C2 host.',
    confidence: 'high',
    why_malicious: ['feodo hit'],
    infrastructure_notes: 'Hetzner VPS, NL.',
    recommended_action: 'block',
    mitre_techniques: ['T1071', 'T1566.001'],
  }
  it('accepts a valid object and preserves ATT&CK ids (incl. sub-techniques)', () => {
    expect(validateNarrative(JSON.stringify(good))).toEqual({
      ...good, why_malicious: ['feodo hit'], mitre_techniques: ['T1071', 'T1566.001'],
    })
  })
  it('strips markdown fences (```json and bare ```) before parsing', () => {
    const wrapped = '```json\n' + JSON.stringify(good) + '\n```'
    expect(validateNarrative(wrapped)?.confidence).toBe('high')
    expect(validateNarrative('```\n' + JSON.stringify(good) + '\n```')).not.toBeNull()
  })
  it('rejects malformed JSON and missing fields', () => {
    expect(validateNarrative('not json at all')).toBeNull()
    const { verdict_sentence: _drop, ...partial } = good
    expect(validateNarrative(JSON.stringify(partial))).toBeNull()
  })
  it('rejects out-of-enum confidence and recommended_action', () => {
    expect(validateNarrative(JSON.stringify({ ...good, confidence: 'definite' }))).toBeNull()
    expect(validateNarrative(JSON.stringify({ ...good, recommended_action: 'nuke' }))).toBeNull()
  })
  it('filters non-ATT&CK strings and caps lists (5 reasons, 8 techniques)', () => {
    const out = validateNarrative(JSON.stringify({
      ...good,
      why_malicious: Array.from({ length: 9 }, (_, i) => `r${i}`),
      mitre_techniques: ['T1071', 'C2 traffic', 'attack.mitre.org', 'T999', 'T9999', 'T99999', 'T1', 'T1234.1', 'T1234.001', 'T1566'],
    }))!
    expect(out.why_malicious).toHaveLength(5)
    expect(out.mitre_techniques).toEqual(['T1071', 'T9999', 'T1234.001', 'T1566']) // T999/T99999/T1/T1234.1 rejected; ≤8 cap not hit
  })
  it('infrastructure_notes missing degrades to empty string, not null; strings are sliced', () => {
    const { infrastructure_notes: _drop, ...noNotes } = good
    const out = validateNarrative(JSON.stringify({ ...noNotes, verdict_sentence: 'x'.repeat(400) }))!
    expect(out.infrastructure_notes).toBe('')
    expect(out.verdict_sentence).toHaveLength(300)
  })
})

describe('trimEvidence', () => {
  it('strips rdap verbatim upstream body to public summary fields (no entities/vcard PII)', () => {
    const rdap = {
      source: 'rdap', ok: true,
      data: {
        objectClassName: 'domain', handle: 'ex1', ldhName: 'evil.com', status: ['active'],
        events: [{ eventAction: ['registration'] }],
        entities: [{ vcardArray: ['vcard', [['fn', {}, 'text', 'Jane Registrant']]] }],
        remarks: [{ description: ['huge blob'] }],
      },
    }
    const [out] = trimEvidence([rdap as any]) as any[]
    expect(out.data).toEqual({ objectClassName: 'domain', handle: 'ex1', ldhName: 'evil.com', status: ['active'], events: [{ eventAction: ['registration'] }] })
    expect(out.data.entities).toBeUndefined()
  })
  it('caps relations at 40 (OTX bulk), keeps other keys, preserves status fields', () => {
    const bulk = Array.from({ length: 500 }, (_, i) => ({ type: 'domain', value: `h${i}.com`, edge: 'same_pulse', weight: i }))
    const src = { source: 'otx', ok: true, data: { parts: [{ source: 'otx', malicious: true }], relations: bulk, tags: ['x'] } }
    const [out] = trimEvidence([src as any]) as any[]
    expect(out.data.relations).toHaveLength(40)
    expect(out.data.relations[0].value).toBe('h499.com') // rankRelations keeps heaviest
    expect(out.data.parts).toHaveLength(1)
    expect(out.data.tags).toEqual(['x'])
    expect(out.source).toBe('otx'); expect(out.ok).toBe(true)
  })
  it('leaves non-array/absent relations, null data, skipped and failed entries untouched', () => {
    const cases: any[] = [
      { source: 'geo', ok: true, data: { country: 'NL' } },
      { source: 'virustotal', ok: true, data: null },
      { source: 'shodan', ok: false, skipped: true },
      { source: 'feodo', ok: false, error: 'HTTP 500' },
      { source: 'spamhaus', ok: true, data: { relations: [1, 2, 3] } }, // under cap
    ]
    expect(trimEvidence(cases)).toEqual(cases)
    const [rdap] = trimEvidence([{ source: 'rdap', ok: false, skipped: true }] as any[]) as any[]
    expect(rdap).toEqual({ source: 'rdap', ok: false, skipped: true }) // no data → untouched
  })
})
