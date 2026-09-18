// Pro feature copy, shared by /pricing and the landing Pro band so the two
// never drift. Ranked by what research says people actually pay for
// (2026-09 pass): suppression first, then category aim, first-hand speed,
// source liveness. Formats/token URL are the compatibility promise, parked
// last on purpose.
export const PRO_FEATURES = [
  'False positives reviewed and pulled before every publish',
  'Your own allowlist applied server-side to every download',
  'Per-category lists: block C2 without blocking Tor',
  'First-hand intel, listed minutes after our sensors see it',
  'Every source liveness-monitored: dead ones dropped, never stale',
  'Bulk / CSV hunt at Pro scale: 10 scans a day, up to 10,000 indicators each',
  'Formats for your firewall, IDS/IPS and SIEM, under one stable auto-update URL',
] as const

/** The three the landing band leads with, in the same ranked order. */
export const PRO_LANDING_CLAIMS = [PRO_FEATURES[0], PRO_FEATURES[2], PRO_FEATURES[3]] as const

/** Waitlist price, quoted on both surfaces. */
export const PRO_PRICE = 25
