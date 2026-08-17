/** Number formatter */
export const fmt = (n) => new Intl.NumberFormat('en-US').format(n)

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

export function categoryTier(cat?: string | null): SeverityTier {
  if (!cat) return 'unknown'
  const c = cat.toLowerCase()
  if (c.includes('malware') || c.includes('exploit') || c.includes('zero-day') ||
      c.includes('c2') || c.includes('command') || c.includes('botnet') ||
      c.includes('mirai') || c.includes('malicious')) return 'critical'
  if (c.includes('brute') || c.includes('force') || c.includes('ddos')) return 'high'
  if (c.includes('phish') || c.includes('harvest') || c.includes('spam')) return 'medium'
  if (c.includes('scan') || c.includes('recon')) return 'low'
  return 'unknown'
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
  return 'https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/'
}

/**
 * Base URL for the rolling `latest` release, which always holds the current
 * build of the two large feeds. These are too big to keep in the git tree, so
 * they ship as release assets rather than via raw/LFS endpoints.
 */
export function getReleaseUrl() {
  return 'https://github.com/kalidada18/threatbase/releases/download/latest/'
}

/** Get the release asset URL for the domain feed */
export function getDomainUrl() {
  return `${getReleaseUrl()}threatbase-domain.txt`
}

/** Get the release asset URL for the hash feed */
export function getHashUrl() {
  return `${getReleaseUrl()}threatbase-hash.txt`
}

/** Format a sync timestamp for display */
export function formatSyncTime(timestamp) {
  const options = { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true }
  if (timestamp) {
    return 'Synced ' + new Intl.DateTimeFormat('en-US', options).format(new Date(timestamp)) + ' (NPT)'
  }
  return 'Live Mode'
}

/** Simple relative time formatting */
export function timeAgo(dateStr) {
  const now = new Date()
  const date = new Date(dateStr)
  const seconds = Math.floor((now - date) / 1000)

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

/** Predict male/female avatar based on name heuristically */
export function getAvatarForName(name) {
  if (!name || name === 'Anonymous') return `${safeBaseUrl()}img/maledefender.png`
  
  const n = name.toLowerCase()
  const femaleIndicators = ['sarah', 'jessica', 'emily', 'mary', 'linda', 'anna', 'emma', 'olivia', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'maria', 'jane', 'jennifer', 'susan', 'lisa', 'karen', 'betty', 'helen', 'sandra', 'ashley', 'kimberly', 'donna', 'carol', 'michelle', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'shirley', 'angela', 'heather', 'nicole', 'girl', 'woman', 'lady', 'queen']
  
  for (const f of femaleIndicators) {
      if (n.includes(f)) return `${safeBaseUrl()}img/femaledefender.png`
  }
  
  // Rough heuristic for typical feminine suffixes in English and Latin names
  if (/a[0-9_]*$/.test(n) || /ie[0-9_]*$/.test(n) || /ynn[0-9_]*$/.test(n) || /ella[0-9_]*$/.test(n) || /ia[0-9_]*$/.test(n)) {
      return `${safeBaseUrl()}img/femaledefender.png`
  }
  
  return `${safeBaseUrl()}img/maledefender.png`
}

/** Get the PNG icon path for a threat category label */
export function getCategoryIconPath(label) {
  if (!label) return `${safeBaseUrl()}img/other.png`
  const l = label.toLowerCase()
  if (l.includes('malware') || l.includes('exploit') || l.includes('zero-day') || l.includes('malicious')) return `${safeBaseUrl()}img/malware.png`
  if (l.includes('phish') || l.includes('harvest')) return `${safeBaseUrl()}img/phishing.png`
  if (l.includes('spam')) return `${safeBaseUrl()}img/spam.png`
  if (l.includes('ddos')) return `${safeBaseUrl()}img/DDoS.png`
  if (l.includes('brute')) return `${safeBaseUrl()}img/bruteforce.png`
  if (l.includes('botnet') || l.includes('c2')) return `${safeBaseUrl()}img/botnet.png`
  if (l.includes('scan') || l.includes('recon')) return `${safeBaseUrl()}img/other.png`
  return `${safeBaseUrl()}img/other.png`
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
