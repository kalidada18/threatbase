import test from 'node:test'
import assert from 'node:assert/strict'
import { filterAllowlist } from './allowlistFilter.ts'

const CSV = [
  '# Threatbase Threat Intelligence Feed - Botnet IPs',
  '# Format: IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen,Sources',
  '1.2.189.89,5,HIGH,Botnet|Brute-Force,2026-09-04,2026-09-05,blocklist_de',
  '2.12.149.79,6,HIGH,Botnet,2026-09-03,2026-09-05,ipsum',
  '',
].join('\n')

test('CSV feed: drops the allowlisted IP row, keeps headers and others', () => {
  const out = filterAllowlist(CSV, ['1.2.189.89'])
  assert.ok(!out.includes('1.2.189.89'))
  assert.ok(out.includes('2.12.149.79'))
  assert.ok(out.includes('# Format:'))
})

test('plain feed: exact token match, no substring false drops', () => {
  const out = filterAllowlist('1.2.3.4\n11.2.3.44\n4.3.2.1', ['1.2.3.4'])
  assert.equal(out, '11.2.3.44\n4.3.2.1')
})

test('ipset/EDL style: token after the set name is matched', () => {
  const out = filterAllowlist('tb_bot add 1.2.3.4\ntb_bot add 9.9.9.9', ['1.2.3.4'])
  assert.equal(out, 'tb_bot add 9.9.9.9')
})

test('empty allowlist is a no-op', () => {
  assert.equal(filterAllowlist(CSV, []), CSV)
})
