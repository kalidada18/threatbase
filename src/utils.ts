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

/** Category → badge CSS class map */
export function getCategoryBadge(category) {
  const map = {
    'Brute Force': 'rip-cat-brute',
    'Port Scan': 'rip-cat-scan',
    'Phishing': 'rip-cat-phishing',
    'Malware / C2': 'rip-cat-malware',
    'DDoS': 'rip-cat-ddos',
    'Spam': 'rip-cat-spam',
    'Exploit Attempt': 'rip-cat-exploit',
    'Other': 'rip-cat-other',
  }
  return map[category] || 'rip-cat-other'
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
