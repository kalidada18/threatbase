import { describe, expect, it } from 'vitest'
import { refang, sniffType } from './indicator'
import { sniffType as serverSniffType } from '../../functions/api/investigate/_lib'

/** Parity: the client's live type chip must agree with the server's cache-key
 *  sniff on the same inputs (fixtures mirrored from _lib.test.ts). */
describe('client/server indicator sniff parity', () => {
  const cases: [string, ReturnType<typeof sniffType>][] = [
    ['45.155.205.23', 'ipv4'],
    ['2001:db8::1', 'ipv6'],
    ['evil.example.com', 'domain'],
    ['hxxp://evil.com/a[.]php', 'url'],
    ['44d88612fea8a8f36de82e1278abb02f', 'md5'],
    ['a'.repeat(64), 'sha256'],
    ['not an indicator!', null],
    ['999.1.1.1', null],
    ['', null],
  ]
  it.each(cases)('sniffs %j as %j', (input, expected) => {
    expect(sniffType(input)).toBe(expected)
    expect(serverSniffType(input)).toBe(expected)
  })
  it('refangs the same ways the server does', () => {
    expect(refang('evil[.]com')).toBe('evil.com')
    expect(refang('hxxps://x.com[:]80')).toBe('https://x.com:80')
  })
})
