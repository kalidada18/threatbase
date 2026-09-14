import { describe, it, expect } from 'vitest'
import { collectBulkRows, parseBulkText, bulkToCsv, BULK_MAX_ROWS, type BulkRow } from './bulkScan'

describe('collectBulkRows', () => {
  it('takes the first classifiable cell of each row and keeps row numbers for junk', () => {
    const p = collectBulkRows([['45.9.148.102'], ['malicious.example.com', '2026-09-01'], ['not', 'a', 'row']])
    expect(p.valid).toEqual(['45.9.148.102', 'malicious.example.com'])
    expect(p.invalid).toEqual([{ row: 3, text: 'not, a, row' }])
    expect(p.truncated).toBe(false)
  })

  it('dedupes and skips blank rows', () => {
    const p = collectBulkRows([['8.8.8.8'], [], [''], ['8.8.8.8'], [' 8.8.8.8 ']])
    expect(p.valid).toEqual(['8.8.8.8'])
    expect(p.invalid).toEqual([])
  })

  it('normalizes defanged indicators so dedupe sees the real form', () => {
    const p = collectBulkRows([['1.2.3[.]4'], ['1.2.3.4'], ['hxxp://evil[.]com/x']])
    expect(p.valid).toEqual(['1.2.3.4', 'http://evil.com/x'])
  })

  it('finds an indicator among several space-separated tokens in one cell', () => {
    const p = collectBulkRows([['seen: 45.9.148.102 on 2026-09-01']])
    expect(p.valid).toEqual(['45.9.148.102'])
  })

  it('a URL cell wins over its own tokens (no splitting a valid whole cell)', () => {
    const p = collectBulkRows([['http://evil.example.com/payload']])
    expect(p.valid).toEqual(['http://evil.example.com/payload'])
  })

  it('caps at BULK_MAX_ROWS and flags truncation', () => {
    const many = Array.from({ length: BULK_MAX_ROWS + 5 }, (_, i) => [`${Math.floor(i / 65536) % 256}.${Math.floor(i / 256) % 256}.${i % 256}.1`])
    const p = collectBulkRows(many)
    expect(p.valid.length).toBe(BULK_MAX_ROWS)
    expect(p.truncated).toBe(true)
  })
})

describe('parseBulkText', () => {
  it('parses plain lines, quoted commas, and CRLF through the SheetJS reader', async () => {
    const p = await parseBulkText('ip,seen_at\r\n45.9.148.102,"evil, inc"\r\njunk line\r\n')
    expect(p.valid).toEqual(['45.9.148.102'])
    expect(p.invalid).toEqual([{ row: 1, text: 'ip, seen_at' }, { row: 3, text: 'junk line' }])
  })
})

describe('bulkToCsv', () => {
  const row: BulkRow = {
    value: '45.9.148.102', type: 'IP Address', isMalicious: true, status: 'malicious',
    riskScore: 'High', feedCount: 3, tags: ['Botnet', 'Scanner'], sources: ['ipsum', 'abuseipdb'],
    matchedCidr: null, relatedMatch: null, disputeCount: 0,
  }

  it('writes a header and one line per result, feed-line style pipes', () => {
    const csv = bulkToCsv([row]).split('\n')
    expect(csv[0]).toBe('indicator,type,status,risk_score,feeds,tags,sources,dispute_count,matched_cidr,related_indicator')
    expect(csv[1]).toBe('45.9.148.102,IP Address,malicious,High,3,Botnet|Scanner,ipsum|abuseipdb,0,,')
  })

  it('quotes values that carry a comma and emits cidr/pivot columns', () => {
    const csv = bulkToCsv([{ ...row, value: 'evil, inc', matchedCidr: '45.9.148.0/24' }])
    const line = csv.split('\n')[1]
    expect(line.startsWith('"evil, inc",IP Address,malicious,High,3,Botnet|Scanner,ipsum|abuseipdb,0,45.9.148.0/24,')).toBe(true)
  })
})
