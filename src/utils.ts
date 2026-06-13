/** Number formatter */
export const fmt = (n) => new Intl.NumberFormat('en-US').format(n)

/** Animate a numeric value in an element from 0 to `end` */
export function animateValue(el, end, dur = 1600) {
  if (!el) return
  const t0 = performance.now()
  ;(function frame(now) {
    const p = Math.min((now - t0) / dur, 1)
    const ease = 1 - Math.pow(1 - p, 3)
    el.textContent = fmt(Math.round(end * ease))
    if (p < 1) requestAnimationFrame(frame)
  })(t0)
}

/** Get the base URL for IOC data files */
export function getBaseUrl() {
  return 'https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/'
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





/** Predict male/female avatar based on name heuristically */
export function getAvatarForName(name) {
  if (!name || name === 'Anonymous') return `${import.meta.env.BASE_URL}img/maledefender.png`
  
  const n = name.toLowerCase()
  const femaleIndicators = ['sarah', 'jessica', 'emily', 'mary', 'linda', 'anna', 'emma', 'olivia', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'maria', 'jane', 'jennifer', 'susan', 'lisa', 'karen', 'betty', 'helen', 'sandra', 'ashley', 'kimberly', 'donna', 'carol', 'michelle', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'shirley', 'angela', 'heather', 'nicole', 'girl', 'woman', 'lady', 'queen']
  
  for (const f of femaleIndicators) {
      if (n.includes(f)) return `${import.meta.env.BASE_URL}img/femaledefender.png`
  }
  
  // Rough heuristic for typical feminine suffixes in English and Latin names
  if (/a[0-9_]*$/.test(n) || /ie[0-9_]*$/.test(n) || /ynn[0-9_]*$/.test(n) || /ella[0-9_]*$/.test(n) || /ia[0-9_]*$/.test(n)) {
      return `${import.meta.env.BASE_URL}img/femaledefender.png`
  }
  
  return `${import.meta.env.BASE_URL}img/maledefender.png`
}

/** Get the PNG icon path for a threat category label */
export function getCategoryIconPath(label) {
  if (!label) return `${import.meta.env.BASE_URL}img/other.png`
  const l = label.toLowerCase()
  if (l.includes('malware')) return `${import.meta.env.BASE_URL}img/malware.png`
  if (l.includes('phish')) return `${import.meta.env.BASE_URL}img/phishing.png`
  if (l.includes('spam')) return `${import.meta.env.BASE_URL}img/spam.png`
  if (l.includes('ddos')) return `${import.meta.env.BASE_URL}img/DDoS.png`
  if (l.includes('brute')) return `${import.meta.env.BASE_URL}img/bruteforce.png`
  if (l.includes('botnet')) return `${import.meta.env.BASE_URL}img/botnet.png`
  return `${import.meta.env.BASE_URL}img/other.png`
}
