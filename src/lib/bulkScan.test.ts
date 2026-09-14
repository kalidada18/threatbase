import { describe, it, expect } from 'vitest'
import { parseBulkInput, bulkToCsv, BULK_MAX_ROWS, type BulkRow } from './bulkScan'

describe('parseBulkInput', () => {
  it('takes one indicator per line and keeps the first classifiable field of each row', () => {
    const p = parseBulkInput('45.9.148.102\nmalicious.example.com,2026-09-01\nnot a row at all')
    expect(p.valid).toEqual(['45.9.148.102', 'malicious.example.com'])
    expect(p.invalid).toEqual(['not a row at all'])
    expect(p.truncated).toBe(false)
  })

  it('dedupes and skips blank lines', () => {
    const p = parseBulkInput('8.8.8.8\n\n8.8.8.8\n  8.8.8.8  ')
    expect(p.valid).toEqual(['8.8.8.8'])
    expect(p.invalid).toEqual([])
  })

  it('refangs defanged indicators', () => {
    const p = parseBulkInput('1.2.3[.]4\nhxxp://evil[.]com/x')
    expect(p.valid).toEqual(['1.2.3.4', 'http://evil.com/x'])
  })

  it('finds the indicator in a later field when the first is junk', () => {
    const p = parseBulkInput('45.9.148.102,2026-09-01')
    expect(p.valid).toEqual(['45.9.148.102'])
    expect(p.invalid).toEqual([])
  })

  it('header rows with no classifiable field land in invalid, not valid', () => {
    const p = parseBulkInput('ip,reported_at\n45.9.148.102')
    expect(p.valid).toEqual(['45.9.148.102'])
    expect(p.invalid).toEqual(['ip,reported_at'])
  })

  it('caps at BULK_MAX_ROWS and flags truncation', () => {
    const many = Array.from({ length: BULK_MAX_ROWS + 5 }, (_, i) => `10.0.${Math.floor(i / 256) % 256}.${i % 256}`)
    const p = parseBulkInput(many.join('\n'))
    expect(p.valid.length).toBe(BULK_MAX_ROWS)
    expect(p.truncated).toBe(true)
  })
})

describe('bulkToCsv', () => {
  const row: BulkRow = {
    value: '45.9.148.102', type: 'IP Address', isMalicious: true, status: 'malicious',
    riskScore: 'High', feedCount: 3, tags: ['Botnet', 'Scanner'], sources: ['ipsum', 'abuseipdb'], disputeCount: 0,
  }

  it('writes a header and one line per result', () => {
    const csv = bulkToCsv([row]).split('\n')
    expect(csv[0]).toBe('indicator,type,status,risk_score,tags,sources,dispute_count')
    expect(csv[1]).toBe('45.9.148.102,IP Address,malicious,High,Botnet|Scanner,ipsum|abuseipdb,0')
  })

  it('quotes values that carry a comma', () => {
    const csv = bulkToCsv([{ ...row, value: 'evil, inc' }])
    expect(csv.split('\n')[1].startsWith('"evil, inc",')).toBe(true)
  })
})
