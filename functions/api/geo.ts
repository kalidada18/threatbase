/**
 * IP geolocation, proxied and normalised through our own origin.
 *
 * The browser used to call get.geojs.io directly, which meant a third-party
 * host in `connect-src`, one uncached round trip per scan, and whatever fields
 * that one provider happened to know (GeoJS returns no city for a large share
 * of IPs, which is where the "City N/A" rows came from).
 *
 * Server-side we can ask a provider with better city coverage first and fall
 * back to GeoJS when it declines, then hand the client one flat shape either
 * way. A day of edge cache means a popular IP costs one upstream call, not one
 * per visitor. The provider chain itself lives in `_net.ts` (geoLookup) so
 * /api/investigate can reuse it without a self-subrequest.
 *
 * GET /api/geo?ip=<ipv4|ipv6>  ->  { ip, country, country_code, city, region,
 *                                    isp, asn, source }
 * 404 means "no provider could place this address", which the UI renders as an
 * answer rather than an error.
 */

import { geoLookup, type Geo } from './_net'

// Shape check only: the upstream hosts are hard-coded, so this exists to keep
// the caller inside the path segment it owns (no scheme, no slashes, no query).
const IP = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]{2,45})$/

export type { Geo }

export const onRequestGet = async (context: any) => {
  const ip = (new URL(context.request.url).searchParams.get('ip') || '').trim().toLowerCase()

  if (!IP.test(ip)) {
    return new Response(JSON.stringify({ error: 'invalid ip' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let geo: Geo | null
  try {
    geo = await geoLookup(ip)
  } catch {
    return new Response(JSON.stringify({ error: 'upstream unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  return new Response(JSON.stringify(geo ?? { error: 'not found', ip }), {
    status: geo ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      // Registration and routing move on the order of days; a miss is not
      // cached at all, so a transient provider failure does not stick.
      'Cache-Control': geo ? 'public, max-age=86400' : 'no-store',
    },
  })
}
