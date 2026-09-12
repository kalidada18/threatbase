/** Client-side mirror of the server's indicator sniffing so the input can
 *  detect types live and block junk round-trips. Ported VERBATIM from
 *  functions/api/investigate/_lib.ts (refang + sniffType); the parity test
 *  keeps the two copies honest. Server stays authoritative. */
import type { IndicatorType } from '@/investigationTypes'

// Refang first: attackers write hxxp://, [.], [:] to dodge scanners. Strip whitespace.
export function refang(raw: string): string {
  return raw.trim()
    .replace(/\[\.\]/g, '.').replace(/\(\.\)/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/^hxxps?:\/\//i, (m) => m.replace(/xx/i, 'tt'))
}

const IP4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IP6 = /^[0-9a-f:]{2,45}$/
const DOMAIN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/
const MD5 = /^[0-9a-f]{32}$/
const SHA1 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

export function sniffType(rawQ: string): IndicatorType | null {
  const q = refang(rawQ).toLowerCase()
  if (!q || q.length > 255) return null
  if (IP4.test(q)) return q.split('.').every((o) => +o <= 255) ? 'ipv4' : null
  if (IP6.test(q) && q.includes(':')) return 'ipv6'
  if (/^https?:\/\//.test(q)) { try { new URL(q); return 'url' } catch { return null } }
  if (MD5.test(q)) return 'md5'
  if (SHA1.test(q)) return 'sha1'
  if (SHA256.test(q)) return 'sha256'
  if (DOMAIN.test(q)) return 'domain'
  return null
}

/** Looks refanged but isn't yet (evil[.]com typed mid-paste): worth previewing. */
export function hasDefangMarks(raw: string): boolean {
  return /\[\.\]|\(\.\)|\[:\]|hxxp/i.test(raw)
}
