/**
 * RDAP registration lookup, proxied through our own origin.
 *
 * The browser cannot do this itself: our CSP `connect-src` is a fixed
 * allowlist, and rdap.org answers with a 302 to whichever registry owns the
 * object (rdap.apnic.net, rdap.arin.net, a registrar's host for domains, …).
 * CSP applies to redirect targets too, and that set is unbounded for domains,
 * so no allowlist can cover it. Server-side there is no CSP and no CORS, and
 * the edge cache means repeat scans of the same indicator cost nothing. The
 * fetch itself lives in `_net.ts` (rdapLookup) so /api/investigate can reuse
 * it without a self-subrequest.
 *
 * GET /api/rdap?q=<ip|domain>[&kind=domain]
 * 404 means "not in the registry" (or an upstream error), which the UI renders
 * as an answer rather than an error.
 */

import { rdapLookup } from './_net'

// Only the shapes RDAP takes: IPv4/IPv6/domain, plus an optional CIDR suffix.
// No slashes (beyond the prefix length), no percent, no scheme: the upstream
// host is hard-coded, so this keeps the caller to the path segment it owns.
const QUERY = /^[a-z0-9.:-]{3,253}(\/\d{1,3})?$/

export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url)
  const kind = url.searchParams.get('kind') === 'domain' ? 'domain' : 'ip'
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()

  if (!QUERY.test(q)) {
    return new Response(JSON.stringify({ error: 'invalid query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let rec: any | null
  try {
    rec = await rdapLookup(q, kind)
  } catch {
    return new Response(JSON.stringify({ error: 'upstream unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  return new Response(rec ? JSON.stringify(rec) : JSON.stringify({ error: 'not found', q }), {
    status: rec ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': rec ? 'public, max-age=86400' : 'no-store',
    },
  })
}
