/**
 * Per-customer false-positive suppression: drop feed lines for IPs the
 * customer has allowlisted. Runs in the /feed Worker on cache-miss, so the
 * customer's allowlist is applied server-side and survives every refresh and
 * every firewall reinstall — the thing DIY pfBlockerNG whitelists cannot do.
 *
 * Line formats handled (see pipeline/update_feed.py header comment):
 *   plain:       "1.2.3.4"
 *   CSV:         "1.2.3.4,5,HIGH,Botnet|...,dates,sources"
 *   ipset/EDL:   "name add 1.2.3.4" / "0.0.0.0/0 1.2.3.4" style token lines
 * Any comma/whitespace-separated token that exactly equals an allowlisted IP
 * drops the whole line. '#' comment/header lines are always kept.
 *
 * ponytail: exact-IP match only. A CIDR entry in a netset line
 * ("set add 10.0.0.0/24") is not subtracted by a single allowlisted IP inside
 * it; add prefix matching when a real customer asks for range-level allowlists.
 */
export function filterAllowlist(text: string, allowed: readonly string[]): string {
  if (allowed.length === 0) return text
  const set = new Set(allowed)
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) { out.push(line); continue }
    let drop = false
    for (const tok of line.split(/[,\s]+/)) {
      if (set.has(tok)) { drop = true; break }
    }
    if (!drop) out.push(line)
  }
  return out.join('\n')
}
