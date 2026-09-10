/**
 * Shared upstream helpers for Pages Functions.
 *
 * Lifted out of geo.ts / rdap.ts so /api/investigate can call them directly —
 * a Pages Function cannot subrequest its own routes (Workers blocks the
 * self-loop), and the alternative was duplicating the provider chains.
 * `_`-prefixed => un-routed. Behavior identical to the inline versions.
 */

// Shape check only: the upstream hosts are hard-coded, so this exists to keep
// the caller inside the path segment it owns (no scheme, no slashes, no query).
const IP = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]{2,45})$/

// Only the shapes RDAP takes: IPv4/IPv6/domain, plus an optional CIDR suffix.
const QUERY = /^[a-z0-9.:-]{3,253}(\/\d{1,3})?$/

export type Geo = {
  ip: string
  country: string | null
  country_code: string | null
  city: string | null
  region: string | null
  isp: string | null
  asn: string | null
  source: string
}

const CF = { cacheTtl: 86400, cacheEverything: true }
const UA = { 'User-Agent': 'Threatbase/1.0 (+https://threatbase.qzz.io)', Accept: 'application/json' }

/** ipwho.is: free, no key, and it knows the city for most routable addresses. */
async function ipwhois(ip: string): Promise<Geo | null> {
  const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { headers: UA, cf: CF } as RequestInit)
  if (!r.ok) return null
  const d: any = await r.json()
  if (!d?.success) return null
  return {
    ip: d.ip || ip,
    country: d.country || null,
    country_code: d.country_code || null,
    city: d.city || null,
    region: d.region || null,
    isp: d.connection?.isp || d.connection?.org || null,
    asn: d.connection?.asn ? `AS${d.connection.asn}` : null,
    source: 'ipwho.is',
  }
}

/** GeoJS: thinner on cities, but unmetered, so it is the safety net. */
async function geojs(ip: string): Promise<Geo | null> {
  const r = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, { headers: UA, cf: CF } as RequestInit)
  if (!r.ok) return null
  const d: any = await r.json()
  if (!d?.ip) return null
  return {
    ip: d.ip,
    country: d.country || null,
    country_code: d.country_code || null,
    city: d.city || null,
    region: d.region || null,
    isp: d.organization_name || d.organization || null,
    asn: d.asn ? `AS${d.asn}` : null,
    source: 'geojs.io',
  }
}

/**
 * Resolve an IP via ipwho.is, falling back to GeoJS. Returns null when both
 * providers answered but could not place the address; throws when the safety
 * net itself was unreachable (callers map that to 502, same as before).
 */
export async function geoLookup(ip: string): Promise<Geo | null> {
  let geo: Geo | null = null
  try {
    geo = await ipwhois(ip)
  } catch { /* fall through to the net below */ }
  if (!geo) geo = await geojs(ip)
  return geo
}

/**
 * Fetch an RDAP record (IP or domain) from rdap.org. Returns the parsed JSON,
 * or null on any non-ok upstream answer (404 "not in the registry" included).
 * Throws only on network/parse failure — a failed lookup, not an empty one.
 */
export async function rdapLookup(q: string, kind: 'ip' | 'domain'): Promise<any | null> {
  if (!QUERY.test(q)) return null
  const upstream = await fetch(`https://rdap.org/${kind}/${encodeURIComponent(q)}`, {
    // rdap.org 403s any request without a User-Agent, and the Workers
    // runtime sends none by default. Identify ourselves instead.
    headers: {
      Accept: 'application/rdap+json, application/json',
      'User-Agent': 'Threatbase/1.0 (+https://threatbase.qzz.io)',
    },
    redirect: 'follow',
    // Registration data changes on the order of days; a day of edge cache is
    // conservative and keeps a popular IP from hammering the RIR.
    cf: { cacheTtl: 86400, cacheEverything: true },
  } as RequestInit)
  if (!upstream.ok) return null
  return await upstream.json()
}
