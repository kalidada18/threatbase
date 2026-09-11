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

/** Only a hard IOC claim (CVE hit) earns the red chip; activity/observational
 * tags go neutral so the wall of chips keeps signal-to-noise. */
export function tagTone(tag: string): 'red' | 'neutral' {
  return tag.startsWith('cve:') ? 'red' : 'neutral'
}
