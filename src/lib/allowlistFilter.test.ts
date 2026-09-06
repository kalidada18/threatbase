import { describe, expect, it } from 'vitest'
import { filterAllowlist } from './allowlistFilter'

const CSV = [
  '# Threatbase Threat Intelligence Feed - Botnet IPs',
  '# Format: IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen,Sources',
  '1.2.189.89,5,HIGH,Botnet|Brute-Force,2026-09-04,2026-09-05,blocklist_de',
  '2.12.149.79,6,HIGH,Botnet,2026-09-03,2026-09-05,ipsum',
  '',
].join('\n')

describe('filterAllowlist', () => {
  it('CSV feed: drops the allowlisted IP row, keeps headers and others', () => {
    const out = filterAllowlist(CSV, ['1.2.189.89'])
    expect(out).not.toContain('1.2.189.89')
    expect(out).toContain('2.12.149.79')
    expect(out).toContain('# Format:')
  })

  it('plain feed: exact token match, no substring false drops', () => {
    expect(filterAllowlist('1.2.3.4\n11.2.3.44\n4.3.2.1', ['1.2.3.4'])).toBe('11.2.3.44\n4.3.2.1')
  })

  it('ipset/EDL style: token after the set name is matched', () => {
    expect(filterAllowlist('tb_bot add 1.2.3.4\ntb_bot add 9.9.9.9', ['1.2.3.4'])).toBe('tb_bot add 9.9.9.9')
  })

  it('empty allowlist is a no-op', () => {
    expect(filterAllowlist(CSV, [])).toBe(CSV)
  })
})
