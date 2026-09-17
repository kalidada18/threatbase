import { describe, it, expect } from 'vitest'
import {
  classifyIndicator,
  cleanVerdict,
  intelBase,
  invalidVerdict,
  pivotCandidates,
  riskFromScore,
  rowToVerdict,
  type IntelRow,
} from './intelVerdict'

// One corpus row, defaulted to an exact IP hit — the shape
// public.lookup_intel returns (db/lookup_intel.sql).
const row = (over: Partial<IntelRow> = {}): IntelRow => ({
  matched: '1.0.1.1',
  match_kind: 'exact',
  src: 'ip',
  score: 90,
  malicious: true,
  feed_count: 1,
  tags: 'Mixed',
  source: null,
  matched_cidr: null,
  dispute_count: 0,
  ...over,
})

const verdictFor = (value: string, r: IntelRow) => {
  const c = classifyIndicator(value)
  return rowToVerdict(intelBase(c), c, pivotCandidates(c).host, r)
}

describe('riskFromScore', () => {
  it('mirrors TIER_SCORE in pipeline/import_ip_intel.py', () => {
    expect(riskFromScore(90)).toBe('High')
    expect(riskFromScore(60)).toBe('Medium')
    expect(riskFromScore(20)).toBe('Low')
    // Boundaries are inclusive at the tier floor.
    expect(riskFromScore(89)).toBe('Medium')
    expect(riskFromScore(59)).toBe('Low')
    // A null score is a clean row, not an unknown.
    expect(riskFromScore(null)).toBe('Low')
  })
})

describe('pivotCandidates', () => {
  it('gives a domain its parents and no host', () => {
    const { host, parents } = pivotCandidates(classifyIndicator('a.b.evil.com'))
    expect(host).toBeNull()
    expect(parents).toContain('evil.com')
  })

  it("puts a URL's own host ahead of its parents, in probe order", () => {
    const { host, parents } = pivotCandidates(classifyIndicator('http://a.evil.com/x'))
    expect(host).toBe('a.evil.com')
    expect(parents[0]).toBe('a.evil.com')
    // The host is probed first so a listed host beats a listed parent.
    expect(parents.indexOf('a.evil.com')).toBeLessThan(parents.indexOf('evil.com'))
  })

  it('has no pivots for a bare IP', () => {
    expect(pivotCandidates(classifyIndicator('1.2.3.4'))).toEqual({ host: null, parents: [] })
  })
})

describe('rowToVerdict', () => {
  it('passes an exact hit straight through', () => {
    const v = verdictFor('1.0.1.1', row())
    expect(v.isMalicious).toBe(true)
    expect(v.riskScore).toBe('High')
    expect(v.feedCount).toBe(1)
    expect(v.isDisputed).toBe(false)
    expect(v.relatedMatch).toBeNull()
    expect(v.matchedCidr).toBeNull()
  })

  it("drops the 'Mixed' placeholder tag but keeps real ones", () => {
    expect(verdictFor('1.0.1.1', row({ tags: 'Mixed' })).tags).toEqual([])
    expect(verdictFor('1.0.1.1', row({ tags: 'Mixed|Bruteforce' })).tags).toEqual(['Bruteforce'])
  })

  it('names the pivot for a subdomain of a listed domain', () => {
    const v = verdictFor('a.evil.com', row({ matched: 'evil.com', match_kind: 'parent', src: 'domain' }))
    expect(v.relatedMatch).toEqual({
      indicator: 'evil.com',
      reason: 'Subdomain of listed malicious domain',
    })
    // The pivot reason is always surfaced as a tag too.
    expect(v.tags).toContain('Related Infrastructure')
  })

  it("distinguishes a listed URL host from a listed parent", () => {
    // Host itself listed → the src decides the wording.
    const onHost = verdictFor('http://evil.com/x', row({ matched: 'evil.com', match_kind: 'parent', src: 'ip' }))
    expect(onHost.relatedMatch?.reason).toBe('URL hosted on listed malicious IP')

    // A parent of the host, not the host → the generic wording.
    const onParent = verdictFor('http://a.evil.com/x', row({ matched: 'evil.com', match_kind: 'parent', src: 'domain' }))
    expect(onParent.relatedMatch?.reason).toBe('URL host is a subdomain of a listed malicious domain')
  })

  it('carries the CIDR out of a subnet containment hit', () => {
    const v = verdictFor('1.2.3.4', row({
      matched: '1.2.3.4', match_kind: 'subnet', src: 'subnet',
      matched_cidr: '1.2.3.0/24', tags: 'Malicious Subnet', score: 90,
    }))
    expect(v.matchedCidr).toBe('1.2.3.0/24')
    // Not a URL, so no relatedMatch — the CIDR alone is the finding.
    expect(v.relatedMatch).toBeNull()
  })

  it('flips a >=3-disputed row to clean, keeping the count', () => {
    const v = verdictFor('1.0.1.1', row({ dispute_count: 3 }))
    expect(v.isDisputed).toBe(true)
    expect(v.isMalicious).toBe(false)
    expect(v.disputeCount).toBe(3)

    // Two disputes is not enough — the threshold is deliberate.
    const two = verdictFor('1.0.1.1', row({ dispute_count: 2 }))
    expect(two.isDisputed).toBe(false)
    expect(two.isMalicious).toBe(true)
  })
})

describe('no-hit verdicts', () => {
  it('reads clean with the full key set the UI expects', () => {
    const c = classifyIndicator('8.8.8.8')
    const v = cleanVerdict(intelBase(c))
    expect(v.isMalicious).toBe(false)
    expect(v.feedCount).toBe(1)
    expect(v.tags).toEqual([])
    expect(v.sources).toEqual([])
    expect(v.disputeCount).toBe(0)
  })

  it('still reports the type for an unclassifiable value', () => {
    const c = classifyIndicator('not an indicator!')
    const v = invalidVerdict(intelBase(c))
    expect(v.type).toBe('invalid')
    expect(v.isMalicious).toBe(false)
  })
})
