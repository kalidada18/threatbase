import { describe, expect, it } from 'vitest'
import { tagLabel, tagTone } from './tagLabel'
import { edgeLabel, hostingLabel, labelSource, weightLabel } from './labels'

describe('tagLabel presentation', () => {
  it('humanizes greynoise slugs without touching wire format', () => {
    expect(tagLabel('greynoise:ssh-bruteforcer')).toBe('ssh bruteforcer')
    expect(tagLabel('cve:CVE-2021-41773')).toBe('CVE-2021-41773')
  })
  it('tones hard claims red, observations neutral', () => {
    expect(tagTone('cve:CVE-2021-41773')).toBe('red')
    expect(tagTone('greynoise:tor exit')).toBe('red')
    expect(tagTone('greynoise:web-crawler')).toBe('neutral')
  })
})

describe('labels', () => {
  it('maps adapter keys and falls back to title case', () => {
    expect(labelSource('virustotal')).toBe('VirusTotal')
    expect(labelSource('abusech-bazaar')).toBe('MalwareBazaar')
    expect(labelSource('brand_new_source')).toBe('Brand New Source')
    expect(labelSource('greynoise:whatever')).toBe('Greynoise')
    expect(labelSource(null)).toBe('Unknown source')
  })
  it('reads edges as sentences', () => {
    expect(edgeLabel('same_pulse')).toBe('shared campaign')
    expect(edgeLabel('resolves_to')).toBe('resolves to')
    expect(edgeLabel('some_new_edge')).toBe('some new edge')
  })
  it('buckets weights and hosting types', () => {
    expect(weightLabel(5)).toBe('strong')
    expect(weightLabel(2)).toBe('medium')
    expect(weightLabel(1)).toBe('trace')
    expect(hostingLabel('vps/cloud')).toBe('VPS / Cloud')
    expect(hostingLabel('unknown')).toBe('Unknown hosting')
  })
})
