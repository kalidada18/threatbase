/**
 * /ioc/* — KV-cached mirror of the ioc/ tree (GitHub raw is the origin).
 * Your Website → this Worker → env.IOC_CACHE → GitHub raw on miss.
 *
 * KV stores one value up to 25 MiB, and the big feeds (ip.txt 56 MB,
 * domain 90 MB) exceed that — those stream straight through untouched.
 * Small files (stats/history/geo/top_ips/categories/chunks) get cached for
 * KV_TTL; the cron pipeline rewrites feeds ~daily, so a short TTL is plenty.
 *
 * If the IOC_CACHE binding is missing (dashboard → Settings → Functions),
 * this degrades to a plain transparent proxy — never errors.
 */

const RAW_BASE = 'https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/'
const KV_TTL = 21600 // 6 h
// Tiny UI-facing metadata (stats/history/manifest/checksums) drives the
// "Synced" badge — 6 h staleness there reads as "the site is broken", and
// raw happily serves a few KB. Keep the long TTL for everything bigger.
const META_TTL = 600 // 10 min
const META_KEYS = ['data/stats.json', 'data/history.json', 'data/manifest.json', 'data/feed_health.json', 'data/geo.json', 'data/community_reports.json', 'ip/top_ips.json']
const KV_MAX = 25_000_000 // Cloudflare KV hard limit per value

// Pro-only products; they no longer exist in the public repo, so upstream would
// 404 anyway — but this mirror caches for 6 h, and without the guard a key
// cached before the cutover would keep serving a paid file for free.
// The paywalled path is /feed/<token>/… (functions/feed/[[path]].ts).
const PAID_PREFIXES = ['ip/categories/', 'firewall/', 'stix/']

const baseHeaders = (contentType?: string | null, immutable = false) => ({
  'Content-Type': contentType || 'text/plain; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  // A ?v=<last_updated> URL is content-addressed by convention: the pipeline
  // bump rewrites the query, so the answer for THIS url never changes and the
  // browser can hold it a day instead of revalidating every hunt. Unversioned
  // requests keep the 5-minute TTL.
  'Cache-Control': immutable ? 'public, max-age=86400, immutable' : 'public, max-age=300',
})

export const onRequestGet = async (context: any) => {
  const rel = decodeURIComponent((context.params.path || []).join('/'))
  if (!rel || rel.includes('..')) return new Response('Not found', { status: 404 })
  // Versioned URL (?v=… from the scanner / ?_=… polls) ⇒ immutable cache headers.
  const versioned = new URL(context.request.url).searchParams.has('v')
  const bh = (ct?: string | null) => baseHeaders(ct, versioned)
  if (PAID_PREFIXES.some((p) => rel.startsWith(p))) {
    return new Response('This is a Threatbase Pro feed — see /pricing.', { status: 402, headers: bh() })
  }

  const kv = context.env.IOC_CACHE
  const key = 'feed/' + rel

  if (kv) {
    try {
      const hit = await kv.getWithMetadata(key, 'arrayBuffer')
      if (hit.value) {
        // ExpirationTtl only applies at WRITE time — shortening META_TTL in a
        // deploy does nothing until old entries expire on their original clock.
        // So meta entries also carry their store timestamp and are revalidated
        // here once older than META_TTL. (Missing storedAt = written by an old
        // deploy = stale by definition for META keys.)
        const staleMeta = META_KEYS.includes(rel) &&
          Date.now() - (Number(hit.metadata?.storedAt) || 0) > META_TTL * 1000
        if (!staleMeta) {
          return new Response(hit.value, { headers: { ...bh(), 'X-KV-Cache': 'HIT' } })
        }
      }
    } catch {
      /* KV read failure must not take down the feed */
    }
  }

  const upstream = await fetch(RAW_BASE + rel, {
    headers: { 'User-Agent': 'threatbase-feed-cache' },
  })

  // Only buffer files small enough to cache; stream everything else through.
  const len = Number(upstream.headers.get('Content-Length') || 0)
  if (!kv || upstream.status !== 200 || len > KV_MAX) {
    return new Response(upstream.body, { status: upstream.status, headers: bh(upstream.headers.get('Content-Type')) })
  }

  const buf = await upstream.arrayBuffer()
  let headers = bh(upstream.headers.get('Content-Type'))
  if (buf.byteLength <= KV_MAX) {
    context.waitUntil(kv.put(key, buf, {
      expirationTtl: META_KEYS.includes(rel) ? META_TTL : KV_TTL,
      metadata: { storedAt: Date.now() },
    }).catch(() => {}))
    headers = { ...headers, 'X-KV-Cache': 'MISS-STORED' }
  }
  return new Response(buf, { headers })
}
