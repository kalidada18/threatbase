import { describe, it, expect } from 'vitest'
import { isValidPublicIp, isValidCategory, MAX_CATEGORY_LENGTH } from './apiValidation'

describe('isValidPublicIp', () => {
  it('accepts publicly routable IPv4', () => {
    expect(isValidPublicIp('8.8.8.8')).toBe(true)
    expect(isValidPublicIp('1.1.1.1')).toBe(true)
  })

  it('rejects private / reserved / loopback / link-local IPv4', () => {
    expect(isValidPublicIp('10.0.0.1')).toBe(false)
    expect(isValidPublicIp('192.168.1.1')).toBe(false)
    expect(isValidPublicIp('172.16.0.1')).toBe(false)
    expect(isValidPublicIp('127.0.0.1')).toBe(false)
    expect(isValidPublicIp('169.254.1.1')).toBe(false)
  })

  it('rejects malformed IPv4', () => {
    expect(isValidPublicIp('256.1.1.1')).toBe(false)
    expect(isValidPublicIp('1.2.3')).toBe(false)
    expect(isValidPublicIp('')).toBe(false)
  })

  it('handles IPv6 public vs reserved', () => {
    expect(isValidPublicIp('2001:4860:4860::8888')).toBe(true)
    expect(isValidPublicIp('::1')).toBe(false)
    expect(isValidPublicIp('fd00::1')).toBe(false)
  })

  it('rejects structurally invalid IPv6 (blocklist-poisoning guard)', () => {
    expect(isValidPublicIp(':')).toBe(false)
    expect(isValidPublicIp('1:2:3')).toBe(false)
    expect(isValidPublicIp('dead:beef')).toBe(false)
    expect(isValidPublicIp('12345::9')).toBe(false)
    expect(isValidPublicIp('1::2::3')).toBe(false)
  })

  it('rejects IPv4-mapped / NAT64 IPv6 that would smuggle internal addrs', () => {
    expect(isValidPublicIp('::ffff:7f00:1')).toBe(false) // 127.0.0.1 mapped
    expect(isValidPublicIp('::ffff:0a00:1')).toBe(false) // 10.0.0.1 mapped
    expect(isValidPublicIp('64:ff9b::808:808')).toBe(false) // NAT64
  })
})

describe('isValidCategory', () => {
  it('accepts short alphanumeric labels with safe punctuation', () => {
    expect(isValidCategory('Malware')).toBe(true)
    expect(isValidCategory('C2/Botnet')).toBe(true)
    expect(isValidCategory('Brute-Force')).toBe(true)
  })

  it('rejects empty, overlong, or markup-bearing labels', () => {
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory('a'.repeat(MAX_CATEGORY_LENGTH + 1))).toBe(false)
    expect(isValidCategory('<script>')).toBe(false)
    expect(isValidCategory('bad;drop')).toBe(false)
  })
})
