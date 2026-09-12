/** Raw source tag → analyst-readable chip label. Tags keep their canonical
 *  `source:key` wire format in the dossier (feed-line contract, see memory);
 *  only presentation is humanized here. cve: values stay verbatim IDs. */
export function tagLabel(tag: string): string {
  if (tag.startsWith('cve:')) return tag.slice(4)
  const words = (s: string) => humanize(s.replace(/[_-]+/g, ' ').trim())
  if (tag.startsWith('greynoise_actor:')) return `${words(tag.slice('greynoise_actor:'.length))} actor`
  if (tag.startsWith('greynoise:')) return words(tag.slice('greynoise:'.length))
  return words(tag)
}

// Display-only security-acronym casing. Adapters lowercase everything
// (normalizeGreynoise), so chips would render "ssh bruteforcer" — this maps
// the common set to analyst form. Wire tags are never touched.
const ACRONYM = /\b(ssh|xss|rce|phpunit|php|icmpv4|rat|c2|tor|url|dns|sql|https|http|rdp|smb|ldap|ftp|bruteforcer|bruteforce)\b/gi
const KEEP: Record<string, string> = {
  ssh: 'SSH', xss: 'XSS', rce: 'RCE', phpunit: 'PHPUnit', php: 'PHP', icmpv4: 'ICMPv4',
  rat: 'RAT', c2: 'C2', tor: 'Tor', url: 'URL', dns: 'DNS', sql: 'SQL',
  https: 'HTTPS', http: 'HTTP', rdp: 'RDP', smb: 'SMB', ldap: 'LDAP', ftp: 'FTP',
  bruteforcer: 'brute-forcer', bruteforce: 'brute-force',
}
function humanize(s: string): string {
  if (!s) return s
  const t = s.replace(ACRONYM, (m) => KEEP[m.toLowerCase()] ?? m)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Hard IOC claims earn the red chip: a CVE hit, or a known-bad infra role
 *  (tor exit / botnet / c2 / scanner). Everything observational stays neutral
 *  so the chip wall keeps signal-to-noise. BAD_ROLE tests case-insensitively,
 *  so humanized output ("Tor exit") keeps the tone. */
const BAD_ROLE = /(^|\s)(tor exit|tor-exit|botnet|\bc2\b|scanner)(\s|$)/i
export function tagTone(tag: string): 'red' | 'neutral' {
  if (tag.startsWith('cve:')) return 'red'
  return BAD_ROLE.test(tagLabel(tag)) ? 'red' : 'neutral'
}
