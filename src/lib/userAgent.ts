/**
 * Dependency-free user-agent classification for the "where you're signed in"
 * session list.
 *
 * Kept out of the component on purpose: it is pure string logic, so it is unit
 * tested directly (userAgent.test.ts) instead of through a rendered tree, and it
 * never pulls framer-motion or lucide into the test environment.
 *
 * We intentionally do NOT try to render brand glyphs (no Chrome/Safari logos):
 * lucide dropped brand icons, and hand-rolling SVG logos is off-system. The
 * security-relevant signal is desktop-vs-mobile, so the icon encodes the device
 * class and the browser/OS are shown as text.
 */

export type DeviceClass = 'desktop' | 'mobile' | 'tablet' | 'unknown'

export interface DeviceInfo {
  browser: string
  os: string
  device: DeviceClass
  /** Display label, e.g. "Chrome on Windows". */
  label: string
}

const UNKNOWN: DeviceInfo = {
  browser: 'Unknown browser',
  os: 'Unknown OS',
  device: 'unknown',
  label: 'Unknown device',
}

/** Order matters: Edge, Opera, Samsung and the iOS variants all also contain
 *  "Chrome"/"Safari", so the more specific tokens must win first. */
function browser(ua: string): string {
  if (/Edg(A|iOS|WSL)?\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox'
  if (/CriOS\//.test(ua)) return 'Chrome'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Version\/.*Safari\//.test(ua) || /Safari\//.test(ua)) return 'Safari'
  return 'Browser'
}

function os(ua: string, device: DeviceClass): string {
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/iPhone|iPad|iPod/.test(ua)) return device === 'tablet' ? 'iPadOS' : 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/Linux|X11/.test(ua)) return 'Linux'
  return 'Unknown OS'
}

function deviceClass(ua: string): DeviceClass {
  // A bare "Mobile" token plus a phone signature is a phone; Android tablets
  // omit "Mobile", and iPad self-identifies. Everything else with a desktop
  // signature is a computer; no recognised signature is unknown.
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet'
  if (/iPhone|iPod|Windows Phone|IEMobile/.test(ua) || /Android.*Mobile|Mobile.*Android/.test(ua)) return 'mobile'
  if (/Macintosh|Windows NT|Linux|X11|CrOS/.test(ua)) return 'desktop'
  if (/Mobile/.test(ua)) return 'mobile'
  return 'unknown'
}

export function describeUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua || typeof ua !== 'string') return UNKNOWN
  const device = deviceClass(ua)
  const b = browser(ua)
  const o = os(ua, device)
  const label = `${b} on ${o}`
  // If neither family resolved to something meaningful, collapse to the generic
  // unknown rather than showing "Browser on Unknown OS".
  if (b === 'Browser' && o === 'Unknown OS') return { ...UNKNOWN, device }
  return { browser: b, os: o, device, label }
}
