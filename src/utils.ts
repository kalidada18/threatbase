/** Number formatter */
export const fmt = (n) => new Intl.NumberFormat('en-US').format(n)



/** Get the base URL for IOC data files */
export function getBaseUrl() {
  return 'https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/'
}

/** Get the media URL for Git LFS domain file */
export function getDomainUrl() {
  return 'https://media.githubusercontent.com/media/kalidada18/threatbase/refs/heads/main/ioc/threatbase-domain.txt'
}

/** Get the media URL for Git LFS hash file */
export function getHashUrl() {
  return 'https://media.githubusercontent.com/media/kalidada18/threatbase/refs/heads/main/ioc/threatbase-hash.txt'
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
