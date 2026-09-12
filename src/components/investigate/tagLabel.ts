/** Raw source tag → analyst-readable chip label. Tags keep their canonical
 * `source:key` wire format in the dossier (feed-line contract, see memory);
 * only presentation is humanized here. cve: values stay verbatim IDs. */
export function tagLabel(tag: string): string {
  if (tag.startsWith('cve:')) return tag.slice(4)
  const words = (s: string) => s.replace(/[_-]+/g, ' ').trim()
  if (tag.startsWith('greynoise_actor:')) return `${words(tag.slice('greynoise_actor:'.length))} actor`
  if (tag.startsWith('greynoise:')) return words(tag.slice('greynoise:'.length))
  return words(tag)
}

/** Hard IOC claims earn the red chip: a CVE hit, or a known-bad infra role
 *  (tor exit / botnet / c2 / scanner). Everything observational stays neutral
 *  so the chip wall keeps signal-to-noise. */
const BAD_ROLE = /(^|\s)(tor exit|tor-exit|botnet|\bc2\b|scanner)(\s|$)/i
export function tagTone(tag: string): 'red' | 'neutral' {
  if (tag.startsWith('cve:')) return 'red'
  return BAD_ROLE.test(tagLabel(tag)) ? 'red' : 'neutral'
}
