/** Number formatter */
export const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

/**
 * The one ordered accent ramp for every data surface on the site: hot ruby,
 * through warm amber, into cool platinum. Charts, stat glows, and feed stripes
 * all read from this so the page can never pick up an off-palette hue.
 *
 * It replaces four independent palettes that had drifted apart (indigo/sky
 * stat tiles, a purple hash series, an emerald CIDR series, a cyan donut tail).
 * Ordered rather than categorical on purpose: every consumer plots magnitude,
 * so ramp position carries meaning instead of being decoration.
 */
export const DATA_RAMP = [
  '#cf1733', // ruby — the house accent
  '#e2566c', // blush
  '#ed6b4a', // vermilion
  '#f48d34', // amber
  '#f0a97a', // sand
  '#cdd3de', // platinum
  '#aeb6c4', // platinum, dim
  '#8f98a8', // platinum, deep
  '#65758b', // slate
] as const

/** Per-indicator accent, taken from DATA_RAMP in descending volume order. */
export const INDICATOR_ACCENT = {
  ip: DATA_RAMP[0],
  domain: DATA_RAMP[1],
  hash: DATA_RAMP[2],
  url: DATA_RAMP[3],
  cidr: DATA_RAMP[6],
  ipv6: DATA_RAMP[8],
} as const

export type IndicatorKey = keyof typeof INDICATOR_ACCENT

/**
 * Threat categories read as severity, not as a per-category rainbow: ruby
 * (critical), orange (high), amber (medium), platinum (low), slate (unknown).
 * Same warm-to-cool ordering as DATA_RAMP, so category chips can never drift
 * off-palette into purple/blue/cyan. The label and icon carry *which* category
 * it is; colour only carries how bad it is.
 */
export type SeverityTier = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

/**
 * The single category vocabulary: keyword -> severity + icon, first match wins.
 *
 * Severity and icon used to be two independent keyword cascades over the same
 * words, which is how 'command' ended up rated critical by one and drawn with
 * the generic icon by the other. One table, two lookups, no drift.
 */
const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, SeverityTier, string]> = [
  [/malware|exploit|zero-day|malicious/, 'critical', 'malware'],
  [/botnet|mirai|c2|command/, 'critical', 'botnet'],
  [/brute|force/, 'high', 'bruteforce'],
  [/ddos/, 'high', 'DDoS'],
  [/phish|harvest/, 'medium', 'phishing'],
  [/spam/, 'medium', 'spam'],
  [/scan|recon/, 'low', 'other'],
]

const matchCategory = (cat?: string | null) =>
  cat ? CATEGORY_RULES.find(([re]) => re.test(cat.toLowerCase())) : undefined

export function categoryTier(cat?: string | null): SeverityTier {
  return matchCategory(cat)?.[1] ?? 'unknown'
}

/** Chip classes (background + text + hairline) for a category, by severity. */
export const TIER_CHIP: Record<SeverityTier, string> = {
  critical: 'bg-red-500/10 text-red-400 border border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  low: 'bg-platinum-400/10 text-platinum-300 border border-platinum-400/25',
  unknown: 'bg-slate-500/10 text-slate-300 border border-slate-500/20',
}

/** Text-only variant of TIER_CHIP, for dense table cells. */
export const TIER_TEXT: Record<SeverityTier, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-amber-400',
  low: 'text-platinum-300',
  unknown: 'text-slate-300',
}

/** Split background / border classes, for panels that tint their own surface. */
export const TIER_ACCENT: Record<SeverityTier, { bg: string; border: string; card: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', card: 'border-red-500/10' },
  high: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', card: 'border-orange-500/10' },
  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', card: 'border-amber-500/10' },
  low: { bg: 'bg-platinum-400/10', border: 'border-platinum-400/25', card: 'border-platinum-400/15' },
  unknown: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', card: 'border-slate-500/10' },
}



/** Get the base URL for IOC data files */
export function getBaseUrl() {
  // Same-origin feed mirror served by functions/ioc/[[path]].ts:
  // browser → Pages Function → KV cache (small files, 6 h TTL) → GitHub raw.
  // Old direct-raw consumers keep working; that URL is still the origin.
  return 'https://threatbase.qzz.io/ioc/'
}

/**
 * Folder each ioc/ file now lives in, keyed by plain filename. The feed tree is
 * organised by type (ip/, domain/, hash/, url/, data/); this map keeps every
 * consumer spelling feeds by plain filename as before. Names that already carry
 * a '/' (chunk metadata from stats.json/manifest.json) pass through untouched.
 */
const FEED_DIR: Record<string, string> = {
  'threatbase-ip.txt': 'ip/',
  'threatbase-ipv6.txt': 'ip/',
  'threatbase-cidr.txt': 'ip/',
  'top_ips.json': 'ip/',
  'threatbase-domain.txt': 'domain/',
  'threatbase-hash.txt': 'hash/',
  'threatbase-url.txt': 'url/',
}

export function feedPath(filename: string): string {
  if (filename.includes('/')) return filename
  // Chunk names (threatbase-domain-01.txt, …) arrive verbatim from already
  // published stats.json/manifest.json files, so route the prefixes too.
  if (filename.startsWith('threatbase-domain-')) return 'domain/' + filename
  if (filename.startsWith('threatbase-hash-')) return 'hash/' + filename
  return (FEED_DIR[filename] ?? 'data/') + filename
}

/**
 * Base URL for the rolling `latest` release, which always holds the current
 * build of the two large feeds as single unsplit files. The scanner uses the
 * committed chunks instead (see CHUNKED_FEEDS below).
 */
function getReleaseUrl() {
  return 'https://github.com/kalidada18/threatbase/releases/download/latest/'
}

/** Get the release asset URL for the (unsplit) domain feed */
export function getDomainUrl() {
  return `${getReleaseUrl()}threatbase-domain.txt`
}

/** Get the release asset URL for the (unsplit) hash feed */
export function getHashUrl() {
  return `${getReleaseUrl()}threatbase-hash.txt`
}

/**
 * The two feeds that exceed GitHub's file size limits and are therefore
 * committed as chunks rather than as one file.
 */
export const CHUNKED_FEEDS = ['threatbase-domain.txt', 'threatbase-hash.txt'] as const

/** One committed chunk of a large feed, as published in stats.json / manifest.json. */
export interface FeedChunk {
  file: string
  /** First key in the chunk (inclusive). */
  first: string
  /** Last key in the chunk (inclusive). */
  last: string
  lines: number
  bytes: number
}

/**
 * Read the chunk layout for a feed out of stats.json.
 *
 * Returns [] when the feed is not chunked, or when stats.json predates chunking —
 * callers treat that as "fetch the unsplit file", so an old stats.json degrades to
 * the previous behaviour instead of breaking.
 */
export function getFeedChunks(statsData: any, filename: string): FeedChunk[] {
  const chunks = statsData?.chunks?.[filename]
  if (!Array.isArray(chunks)) return []
  return chunks.filter(
    (c: any) => c && typeof c.file === 'string' && typeof c.first === 'string' && typeof c.last === 'string',
  )
}

/**
 * Pick the single chunk whose key range can contain `query`.
 *
 * The chunks partition a sorted feed, so at most one can hold any given key and
 * the scanner never needs to download the rest — one ~45 MiB fetch instead of the
 * whole ~90 MiB feed. Returns null when the query falls in the gap between two
 * chunks, which is itself a definitive "not in the feed" answer requiring no
 * download at all.
 *
 * Comparisons use the same plain string ordering as the Python side's sorted()
 * and as binarySearchString, so the three agree on every boundary.
 */
export function selectChunkFor(chunks: FeedChunk[], query: string): FeedChunk | null {
  for (const c of chunks) {
    if (query >= c.first && query <= c.last) return c
  }
  return null
}

/** Format a sync timestamp for display */
export function formatSyncTime(timestamp: number | string | null | undefined): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true }
  if (timestamp) {
    return 'Synced ' + new Intl.DateTimeFormat('en-US', options).format(new Date(timestamp)) + ' (NPT)'
  }
  return 'Live Mode'
}

/** Simple relative time formatting */
export function timeAgo(dateStr: string | number | Date): string {
  const now = new Date()
  const date = new Date(dateStr)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}





/** Helper to get base url safely in both Vite and Worker envs */
const safeBaseUrl = () => {
  try {
    return import.meta.env.BASE_URL || '/'
  } catch (e) {
    return '/'
  }
}

/** Neutral avatar for reporters with no uploaded picture. */
export const DEFAULT_AVATAR = `${safeBaseUrl()}img/security_robot.png`

/** Get the PNG icon path for a threat category label, via CATEGORY_RULES. */
export function getCategoryIconPath(label: string | null | undefined): string {
  return `${safeBaseUrl()}img/${matchCategory(label)?.[2] ?? 'other'}.png`
}

/** Normalize, clean, and deduplicate tags from external intelligence sources */
export function normalizeTags(tags: string[]): string[] {
  if (!tags) return [];
  
  const noiseList = [
    'tpot', 'cowrie', 'suricata', 'dionaea', 'honeytrap', 'p0f', 'fatt', 
    'mailoney', 'tanner', 'sentrypeer', 'vultr', 'digital ocean', 'sensor-tagged',
    'automated', 'threat intel', 'known attacker', 'tor', 'vpn', 'proxy'
  ];

  const standardized: Record<string, string> = {
    'bruteforce': 'Brute-Force',
    'ssh': 'SSH',
    'portscan': 'Port Scan',
    'scanners': 'Scanner',
    'scanner': 'Scanner',
    'nginx': 'Nginx',
    'credential-harvesting': 'Credential Harvesting',
    'env-hunting': 'ENV Hunting',
    'web3': 'Web3',
    'exploit': 'Exploit',
    'vulnerability-exploitation': 'Exploit',
    'zero-day': 'Zero-Day',
    'c2': 'Command & Control',
    'malware': 'Malware',
    'phishing': 'Phishing',
    'ddos': 'DDoS',
    'botnet': 'Botnet',
    'mirai': 'Mirai Botnet'
  };

  const cleanTags = tags
    .map(t => t.toLowerCase().trim())
    .filter(t => !noiseList.includes(t))
    .map(t => standardized[t] || t.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')); // Capitalize unknown tags

  return Array.from(new Set(cleanTags)).slice(0, 8); // Deduplicate and keep top 8
}
