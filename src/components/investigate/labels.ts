/** One presentation vocabulary for the dossier: raw server strings (adapter
 *  keys, edge codes, hosting slugs, weights) → human labels. Wire values are
 *  never renamed; these are display-only maps (same contract as tagLabel). */

/** Keys verified against the fan-out in functions/api/investigate/index.ts
 *  plus the verdict-part aliases in _lib.ts SOURCE_WEIGHT. */
const SOURCE_LABELS: Record<string, string> = {
  onsite: 'Threatbase Feeds', threatbase: 'Threatbase Feeds',
  otx: 'AlienVault OTX', geo: 'GeoIP', rdap: 'RDAP', shodan: 'Shodan',
  virustotal: 'VirusTotal', malwarebazaar: 'MalwareBazaar', 'abusech-bazaar': 'MalwareBazaar',
  feodo: 'Feodo Tracker', urlhaus: 'URLhaus', greynoise: 'GreyNoise',
  spamhaus: 'Spamhaus', ripestat: 'RIPEstat', unknown: 'Unknown source',
}

const titleCase = (slug: string) => slug.split(/[_-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

/** Adapter key → vendor display name. Falls back to title-casing the slug so a
 *  new source never renders as a raw snake_case key; covers `source:slug` rows too. */
export function labelSource(key: string | null | undefined): string {
  if (!key) return 'Unknown source'
  return SOURCE_LABELS[key] ?? titleCase(key.split(':')[0])
}

/** Relation edge codes → reads as sentences, not enums. */
const EDGE_LABELS: Record<string, string> = {
  same_pulse: 'shared campaign',
  vt_resolution: 'seen resolving to',
  shodan_hostname: 'hostname on host',
  greynoise_rdns: 'reverse DNS',
  resolves_to: 'resolves to',
  resolved_by: 'resolved by',
  same_asn: 'same ASN',
  same_host: 'same host',
  dropped_by: 'dropped by',
  delivered_with: 'delivered with',
}
export function edgeLabel(edge: string | null | undefined): string {
  if (!edge) return ''
  return EDGE_LABELS[edge] ?? edge.replace(/_/g, ' ')
}

/** Relation/edge `via` is overloaded on the wire: most adapters put a source
 *  key there, but the OTX same_pulse adapter puts the free-text *pulse title*
 *  (joined with ';' across pulses). Humanize only the source keys; pulse
 *  titles are already human and labelSource would mangle them at the colon. */
export function viaLabel(edge: string | null | undefined, via: string | null | undefined): string {
  if (!via) return 'direct'
  return edge === 'same_pulse' ? via : labelSource(via)
}

/** Corroboration weight (count of feeds/pulses tying two IOCs together):
 *  a word analysts triage by, with the raw number available on hover. */
export function weightLabel(w: number): 'strong' | 'medium' | 'trace' {
  return w >= 4 ? 'strong' : w >= 2 ? 'medium' : 'trace'
}

/** identity.hosting_type values produced by _lib.ts hostingType(). */
const HOSTING_LABELS: Record<string, string> = {
  'vps/cloud': 'VPS / Cloud',
  backbone: 'Backbone',
  'residential/business': 'Residential / Business',
  hosting: 'Hosting',
  unknown: 'Unknown hosting',
}
export function hostingLabel(s: string | null | undefined): string {
  if (!s) return 'Unknown hosting'
  return HOSTING_LABELS[s] ?? titleCase(s)
}

/** Static ATT&CK names for the techniques the narrative prompt can emit
 *  (mirrors index.ts narrate rules). Unknown IDs render bare, still linked. */
export const TECHNIQUE_NAMES: Record<string, string> = {
  T1071: 'Application Layer Protocol',
  T1566: 'Phishing',
  T1021: 'Remote Services',
}

/** verdict.dominant_source is nullable even when the label map knows the key. */
export const labelDominantSource = (k: string | null | undefined) => (k ? labelSource(k) : null)
