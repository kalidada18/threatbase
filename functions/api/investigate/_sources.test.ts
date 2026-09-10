// Offline tests for the pure shape-walkers in _sources.ts. Fixtures are
// minimal hand-recorded snippets matching the documented OTX/VirusTotal/Shodan
// response shapes — no network calls anywhere in this file.
import { describe, expect, it } from 'vitest'
import { otxPulseIndicatorsToRelations, vtStatsToPart, shodanToBehavior, otxTypePath, typeToIndicator } from './_sources'

// GET /pulses/<id>/indicators — real keys, two pulses' worth in one fixture call
const OTX_PULSE_INDICATORS = {
  count: 6,
  results: [
    { indicator: '45.155.205.23', type: 'IPv4', description: 'c2' },
    { indicator: 'evil.example.com', type: 'domain' },
    { indicator: 'evil.example.com', type: 'domain' },                 // dup within pulse
    { indicator: 'deadbeef'.repeat(8), type: 'FileHash-SHA256', malicious: true },
    { indicator: 'SomeMutex{123}', type: 'Mutex' },                    // exotic -> skip
    { indicator: 'http://evil.example.com/gate.php', type: 'URL' },
  ],
}

// GET /api/v3/ip_addresses/<ip> — documented resource-object shape, trimmed
const VT_IP = {
  data: {
    id: '45.155.205.23',
    type: 'ip-address',
    attributes: {
      last_analysis_stats: { malicious: 14, undetected: 8, harmful: 0, suspicious: 0, timeout: 0 },
      last_modification_date: 1757000000,
    },
  },
}
const VT_EMPTY = { data: { attributes: {} } }

// GET https://api.shodan.io/shodan/host/<ip> — documented host response, trimmed
const SHODAN_HOST = {
  ip: 767585563,
  ports: [22, 80],
  hostnames: ['host45.example.net'],
  domains: ['example.net'],
  tags: ['open-dir', 'log4j-vulnerability'],
  data: [
    { port: 22, proto: 'tcp', service: 'ssh', version: 'OpenSSH 8.9', _timestamp: 1756900000 },
    { port: 80, proto: 'tcp', service: 'http', product: 'nginx 1.18', data: 'HTTP/1.1 200 OK', _timestamp: 1756900000 },
  ],
}

describe('otxPulseIndicatorsToRelations', () => {
  const rels = otxPulseIndicatorsToRelations(OTX_PULSE_INDICATORS, 'LockBit C2 trackers')
  it('maps supported types and skips exotic ones', () => {
    expect(rels.map((r) => `${r.type}:${r.value}`)).toEqual([
      'ipv4:45.155.205.23',
      'domain:evil.example.com',
      'sha256:' + 'deadbeef'.repeat(8),
      'url:http://evil.example.com/gate.php',
    ])
  })
  it('dedupes within the pulse, carries edge/via/weight', () => {
    const domains = rels.filter((r) => r.type === 'domain')
    expect(domains).toHaveLength(1)
    expect(domains[0]).toMatchObject({ edge: 'same_pulse', via: 'LockBit C2 trackers', weight: 1 })
  })
  it('passes through a per-indicator malicious flag', () => {
    expect(rels.find((r) => r.type === 'sha256')!.malicious).toBe(true)
    expect(rels.find((r) => r.type === 'ipv4')!.malicious).toBeUndefined()
  })
  it('survives garbage payloads', () => {
    expect(otxPulseIndicatorsToRelations({}, 'x')).toEqual([])
    expect(otxPulseIndicatorsToRelations({ results: null }, 'x')).toEqual([])
  })
})

describe('vtStatsToPart', () => {
  it('malicious engine count flips the verdict', () => {
    expect(vtStatsToPart(VT_IP)).toEqual({ source: 'virustotal', malicious: true })
    const clean = { data: { attributes: { last_analysis_stats: { malicious: 0, undetected: 90 } } } }
    expect(vtStatsToPart(clean)).toEqual({ source: 'virustotal', malicious: false })
  })
  it('no stats = no opinion', () => {
    expect(vtStatsToPart(VT_EMPTY)).toEqual({ source: 'virustotal', malicious: null })
    expect(vtStatsToPart({})).toEqual({ source: 'virustotal', malicious: null })
  })
})

describe('shodanToBehavior', () => {
  const b = shodanToBehavior(SHODAN_HOST)
  it('keeps port + service + banner text', () => {
    expect(b.ports).toEqual([
      { port: 22, service: 'ssh', banner: 'OpenSSH 8.9' },
      { port: 80, service: 'http', banner: 'nginx 1.18' },
    ])
  })
  it('carries tags and hostname/domain edges', () => {
    expect(b.tags).toEqual(['open-dir', 'log4j-vulnerability'])
    expect(b.relations).toEqual([
      { type: 'domain', value: 'host45.example.net', edge: 'shodan_hostname', via: 'Shodan', weight: 1 },
      { type: 'domain', value: 'example.net', edge: 'shodan_hostname', via: 'Shodan', weight: 1 },
    ])
  })
  it('survives garbage payloads', () => {
    expect(shodanToBehavior({})).toEqual({ ports: [], tags: [], relations: [] })
  })
})

describe('OTX path + type maps', () => {
  it('matches the live-verified type buckets', () => {
    expect(otxTypePath).toMatchObject({ ipv4: 'IPv4', ipv6: 'IPv6', domain: 'domain', url: 'URL', md5: 'file_name_hash', sha1: 'FileHash-SHA1', sha256: 'FileHash-SHA256' })
    expect(typeToIndicator('IPv4')).toBe('ipv4')
    expect(typeToIndicator('hostname')).toBe('domain')
    expect(typeToIndicator('CVE')).toBeNull()
  })
})
