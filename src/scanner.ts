import {
  getBaseUrl,
  getDomainUrl,
  getHashUrl,
  getFeedChunks,
  selectChunkFor,
  CHUNKED_FEEDS,
} from './utils'
import supabaseClient from './supabaseClient'
import { isStrictIpv6 } from './lib/ipValidation'

type CompareFn = (query: string, line: string) => number

const feedCache: Record<string, { text: string }> = {}
const statsCache: Record<string, any> = {}

/**
 * Fetch stats.json, which carries the chunk layout for the two large feeds.
 *
 * Callers that already hold stats (the website) pass it in; the Pages Function
 * does not, so it is fetched and cached per feed version. A failure here is not
 * fatal — the chunk lookup falls back to the unsplit release assets.
 */
async function fetchStats(baseUrl: string, feedVersion: string | number, provided?: any): Promise<any> {
  if (provided) return provided
  const key = `stats?v=${feedVersion}`
  if (key in statsCache) return statsCache[key]
  try {
    const r = await fetch(`${baseUrl}stats.json?v=${feedVersion}`)
    statsCache[key] = r.ok ? await r.json() : null
  } catch (e) {
    console.error('stats.json fetch failed, falling back to unsplit feeds:', e)
    statsCache[key] = null
  }
  return statsCache[key]
}

async function fetchAndCacheFeedText(
  baseUrl: string,
  filename: string,
  feedVersion: string | number,
): Promise<{ text: string }> {
  const cacheKey = `${filename}?v=${feedVersion}`
  if (feedCache[cacheKey]) return feedCache[cacheKey]

  let text = ''

  try {
    const url = filename === 'threatbase-domain.txt'
      ? `${getDomainUrl()}?v=${feedVersion}`
      : filename === 'threatbase-hash.txt'
      ? `${getHashUrl()}?v=${feedVersion}`
      : `${baseUrl}${filename}?v=${feedVersion}`
    const r = await fetch(url)

    if (r.ok) {
      text = await r.text()
    } else {
      throw new Error(`GitHub Raw fetch error: ${r.status}`)
    }
  } catch (e) {
    console.error(`GitHub Raw fetch failed for ${filename}:`, e)
  }

  feedCache[cacheKey] = { text }
  return feedCache[cacheKey]
}

/**
 * Fetch only the part of a feed that could contain `query`.
 *
 * The domain and hash feeds are committed as chunks that partition the sorted
 * list, so exactly one chunk can hold any given key. That turns a ~90 MiB
 * download into a single ~45 MiB one, and when the query lands in the gap
 * between two chunks it is provably absent from the feed, so nothing is fetched
 * at all.
 *
 * Falls back to the whole unsplit feed if the chunk layout is unavailable (an
 * older stats.json, or a failed stats fetch), which is the pre-chunking
 * behaviour — slower, never wrong.
 */
async function fetchFeedTextForQuery(
  baseUrl: string,
  filename: string,
  query: string,
  feedVersion: string | number,
  stats: any,
): Promise<{ text: string }> {
  if (!(CHUNKED_FEEDS as readonly string[]).includes(filename)) {
    return fetchAndCacheFeedText(baseUrl, filename, feedVersion)
  }

  const chunks = getFeedChunks(stats, filename)
  if (chunks.length === 0) return fetchAndCacheFeedText(baseUrl, filename, feedVersion)

  const chunk = selectChunkFor(chunks, query)
  if (!chunk) return { text: '' }

  return fetchAndCacheFeedText(baseUrl, chunk.file, feedVersion)
}

/** Convert a dotted IPv4 string to an unsigned 32-bit integer. */
export function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let acc = 0
  for (let i = 0; i < 4; i++) {
    const oct = Number(parts[i])
    if (!Number.isInteger(oct) || oct < 0 || oct > 255) return null
    acc = (acc << 8) + oct
  }
  return acc >>> 0
}

interface ParsedCidr {
  line: string
  base: number
  bitmask: number
}
const cidrParsedCache = new Map<string, ParsedCidr[]>()

/**
 * Scan an IPv4 address against the malicious CIDR feed.
 * Closes the "hidden IP" gap: feeds like Spamhaus/FireHOL publish ranges,
 * so an IP malicious only by virtue of its subnet has no exact row in the IP feed.
 * Returns the matching CIDR string, or null.
 */
export function findMatchingCidr(cidrText: string, ipLong: number | null): string | null {
  if (!cidrText || ipLong === null) return null
  let list = cidrParsedCache.get(cidrText)
  if (!list) {
    list = []
    const lines = cidrText.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('#') || line.indexOf(':') !== -1) continue
      const slash = line.indexOf('/')
      if (slash === -1) continue
      const base = ipv4ToLong(line.slice(0, slash))
      if (base === null) continue
      const mask = Number(line.slice(slash + 1))
      if (!Number.isInteger(mask) || mask < 0 || mask > 32) continue
      const bitmask = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0
      list.push({ line, base, bitmask })
    }
    cidrParsedCache.set(cidrText, list)
  }

  for (let i = 0; i < list.length; i++) {
    const sub = list[i]
    if ((ipLong & sub.bitmask) === (sub.base & sub.bitmask)) return sub.line
  }
  return null
}

export function createIpCsvCompare(query: string): CompareFn {
  const parts = query.split('.').map(Number)
  const q0 = parts[0] || 0, q1 = parts[1] || 0, q2 = parts[2] || 0, q3 = parts[3] || 0
  return (_query: string, line: string): number => {
    if (line.startsWith('#') || line.startsWith('ip,')) return 1
    const commaIdx = line.indexOf(',')
    const ipStr = commaIdx === -1 ? line : line.slice(0, commaIdx)
    const dot1 = ipStr.indexOf('.')
    const dot2 = ipStr.indexOf('.', dot1 + 1)
    const dot3 = ipStr.indexOf('.', dot2 + 1)

    const b0 = Number(ipStr.slice(0, dot1))
    const b1 = Number(ipStr.slice(dot1 + 1, dot2))
    const b2 = Number(ipStr.slice(dot2 + 1, dot3))
    const b3 = Number(ipStr.slice(dot3 + 1))

    if (q0 < b0) return -1
    if (q0 > b0) return 1
    if (q1 < b1) return -1
    if (q1 > b1) return 1
    if (q2 < b2) return -1
    if (q2 > b2) return 1
    if (q3 < b3) return -1
    if (q3 > b3) return 1
    return 0
  }
}

export function ipCsvCompare(query: string, line: string): number {
  return createIpCsvCompare(query)(query, line)
}

export function stringCompare(query: string, line: string): number {
  if (line.startsWith('#') || line.startsWith('ip,')) return 1;
  const key = line.split(',')[0];
  if (query < key) return -1
  if (query > key) return 1
  return 0
}

export function binarySearchString(text: string, query: string, compareFn: CompareFn): string | null {
  if (!text) return null;
  let low = 0;
  let high = text.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    let start = mid;
    while (start > 0 && text[start - 1] !== '\n') start--;

    let end = mid;
    while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end++;

    const line = text.slice(start, end).trim();
    if (line.length === 0) {
      // Empty line, safely move past it
      low = end + 1;
      continue;
    }

    const comp = compareFn(query, line);
    if (comp === 0) {
      if (line.startsWith('#') || line.startsWith('ip,')) return null;
      return line;
    }

    if (comp < 0) {
      high = start - 1;
    } else {
      low = end + 1;
    }
  }
  return null;
}


/**
 * Refang a defanged IOC — analysts paste indicators as `hxxp://evil[.]com`
 * or `1.2.3[.]4` to make them non-clickable. Normalize back to the real form
 * so they scan correctly. Also strips whitespace and a trailing dot (FQDN form).
 */
export function refangIndicator(raw: string): string {
  let s = raw.trim()
    .replace(/^hxxps:\/\//i, 'https://')
    .replace(/^hxxp:\/\//i, 'http://')
    .replace(/\[\.\]|\(\.\)|\{\.\}/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[\/\/\]|\[\/\]/g, '/')
    .replace(/\[at\]|\(at\)/gi, '@')
  if (s.endsWith('.') && !s.endsWith('..')) s = s.slice(0, -1)
  return s
}

/** Extract the hostname from a URL string, or null if unparseable. */
export function extractUrlHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

/**
 * Parent domains of a host, nearest first, down to the registrable-ish level.
 * `a.b.evil.com` → ['b.evil.com', 'evil.com']. Naive on multi-part TLDs
 * (co.uk etc.) — a miss there is a false negative, never a false positive,
 * since we only report parents actually present in the feed.
 */
export function parentDomains(host: string): string[] {
  const parts = host.split('.')
  const out: string[] = []
  for (let i = 1; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'))
  return out
}

/**
 * Classify a raw indicator string into its type. Pure (no network I/O) and
 * exported so the classification rules can be unit-tested in isolation.
 *
 * Input is refanged first, so defanged IOCs (hxxp://, [.]) classify as their
 * real type.
 *
 * Hash detection is restricted to the three standard hex lengths — MD5 (32),
 * SHA-1 (40) and SHA-256 (64) — so odd-length hex (e.g. 56 chars) is no longer
 * misrouted to the hash feed.
 */
export function classifyIndicator(rawInput: string) {
  rawInput = refangIndicator(rawInput)
  const isURL = /^https?:\/\/.+/.test(rawInput)
  const isHash = /^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(rawInput)
  const ip = isURL && !isHash ? rawInput : rawInput.toLowerCase()

  const isIP =
    /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)
  const isIPv6 = ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip) && !ip.includes('/')
  const isCIDR = ip.includes('/') && /^[a-fA-F0-9:.]+\/\d{1,3}$/.test(ip)
  const isDomain =
    !isIP &&
    !isIPv6 &&
    !isCIDR &&
    !isURL &&
    !isHash &&
    /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.[A-Za-z]{2,}$/.test(ip)

  let type = 'invalid'
  if (isIP) type = 'IP Address'
  else if (isIPv6) type = 'IPv6 Address'
  else if (isCIDR) type = 'CIDR Block'
  else if (isHash) type = 'File Hash'
  else if (isURL) type = 'URL'
  else if (isDomain) type = 'Domain'

  return { ip, type, isIP, isIPv6, isCIDR, isHash, isURL, isDomain }
}

/**
 * Indicator types accepted by POST /api/v1/scan batch requests.
 * 'cidr' is deliberately absent — the batch API exposes exactly the types
 * promised in issue #10; GET /scan still auto-detects CIDRs.
 */
export const BATCH_SCAN_TYPES = ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256'] as const

const BATCH_TYPE_TO_CLASS: Record<string, string> = {
  ipv4: 'IP Address',
  ipv6: 'IPv6 Address',
  domain: 'Domain',
  url: 'URL',
  md5: 'File Hash',
  sha1: 'File Hash',
  sha256: 'File Hash',
}

const BATCH_HASH_LENGTH: Record<string, number> = { md5: 32, sha1: 40, sha256: 64 }

/**
 * Validate an indicator against its declared type for the batch scan API.
 * Delegates detection to classifyIndicator (so refanged input is accepted and
 * the regex rules live in one place), then checks the declaration matches:
 * type mismatches (an IPv4 sent as 'domain') and wrong hash lengths are errors.
 * Returns the normalized value or a human-readable error string.
 */
export function validateTypedIndicator(
  rawType: string,
  rawValue: string,
): { value: string } | { error: string } {
  const type = rawType.trim().toLowerCase()
  const expected = BATCH_TYPE_TO_CLASS[type]
  if (!expected) {
    return { error: `Unsupported indicator type '${rawType}'. Supported: ${BATCH_SCAN_TYPES.join(', ')}` }
  }
  if (!rawValue.trim()) return { error: `Empty value for type '${type}'` }

  const c = classifyIndicator(rawValue)
  if (c.type === 'invalid') return { error: `'${rawValue}' is not a valid ${type}` }
  if (c.type !== expected) return { error: `'${rawValue}' does not match declared type '${type}' (looks like a ${c.type})` }
  if (BATCH_HASH_LENGTH[type] && c.ip.length !== BATCH_HASH_LENGTH[type]) {
    return { error: `'${rawValue}' is not a valid ${type} (expected ${BATCH_HASH_LENGTH[type]} hex characters)` }
  }
  // classifyIndicator's ipv6 check is loose (any colon-hex string); the batch
  // API promises strict per-type validation, so reject 'dead:beef' / '::::'.
  if (type === 'ipv6' && !isStrictIpv6(c.ip)) {
    return { error: `'${rawValue}' is not a valid ${type}` }
  }
  return { value: c.ip }
}

/**
 * Parse a feed line `IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen,Sources`.
 * Tags and Sources are pipe-joined. Legacy 4-column lines simply yield no
 * sources. Pure and exported so the column rules can be unit-tested.
 */
export function parseIpFeedLine(line: string) {
  const parts = line.split(',')
  const feedCount = parts.length >= 3 ? parts[1] : '1'
  const riskScore = parts.length >= 3 ? parts[2] : 'Low'
  const tags = parts.length >= 4 ? parts[3].split('|').filter((t) => t.trim() !== '' && t !== 'Mixed') : []
  const sources = parts.length >= 7 ? parts[6].split('|').filter(Boolean) : []
  return { feedCount, riskScore, tags, sources }
}

/**
 * Classify the indicator type and search against cached feed files.
 *
 * `statsData` is optional: pass it when the caller already has stats.json (the
 * website does) to save a request. Without it, stats are fetched on demand so
 * the chunk layout of the large feeds can be resolved.
 *
 * Returns { type, isMalicious, riskScore, feedCount }
 */
export async function scanIndicatorLogic(rawInput: string, feedVersion: string | number, statsData?: any) {
  const { ip, type, isIP, isIPv6, isCIDR, isHash, isURL, isDomain } = classifyIndicator(rawInput)

  if (type === 'invalid') {
    return { type: 'invalid', ip, isIP, isDomain, isHash, isURL, isIPv6, isCIDR, isMalicious: false, riskScore: 'Low', feedCount: 1 }
  }

  const scanType = type

  const RAW = getBaseUrl()
  // Only needed to locate chunks of the domain/hash feeds.
  const stats = isDomain || isHash || isURL ? await fetchStats(RAW, feedVersion, statsData) : null
  let isMalicious = false
  let riskScore = 'Low'
  let feedCount: number | string = 1
  let isDisputed = false
  let disputeCount = 0
  let tags: string[] = []
  let sources: string[] = []
  let matchedCidr: string | null = null
  // Pivot detection: the exact indicator wasn't listed, but a related one was
  // (URL's host, a parent domain, the host's resolved-in-feed IP form, etc).
  let relatedMatch: { indicator: string; reason: string } | null = null

  try {
    let textData = ''
    let compareFn: CompareFn = stringCompare

    if (isIP) {
      ;({ text: textData } = await fetchAndCacheFeedText(RAW, 'threatbase-ip.txt', feedVersion))
      compareFn = createIpCsvCompare(ip)
    } else if (isIPv6) {
      ;({ text: textData } = await fetchAndCacheFeedText(RAW, 'threatbase-ipv6.txt', feedVersion))
    } else if (isCIDR) {
      ;({ text: textData } = await fetchAndCacheFeedText(RAW, 'threatbase-cidr.txt', feedVersion))
    } else if (isDomain) {
      ;({ text: textData } = await fetchFeedTextForQuery(RAW, 'threatbase-domain.txt', ip, feedVersion, stats))
    } else if (isHash) {
      ;({ text: textData } = await fetchFeedTextForQuery(RAW, 'threatbase-hash.txt', ip, feedVersion, stats))
    } else if (isURL) {
      ;({ text: textData } = await fetchAndCacheFeedText(RAW, 'threatbase-url.txt', feedVersion))
    }

    let result: string | null = null
    result = binarySearchString(textData, ip, compareFn)

    // CIDR fallback: an IPv4 with no exact row may still be malicious because
    // it falls inside a listed malicious subnet (Spamhaus/FireHOL/etc).
    if (!result && isIP) {
      const { text: cidrText } = await fetchAndCacheFeedText(RAW, 'threatbase-cidr.txt', feedVersion)
      matchedCidr = findMatchingCidr(cidrText, ipv4ToLong(ip))
    }

    // Domain pivot: an unlisted subdomain of a listed domain is still hostile
    // infrastructure (evil.com listed → mail.evil.com flagged).
    // Each parent is looked up in its own chunk — sibling parents rarely share
    // one — and chunk fetches are cached, so this costs at most one download per
    // distinct chunk touched.
    if (!result && isDomain) {
      for (const parent of parentDomains(ip)) {
        const { text: dText } = await fetchFeedTextForQuery(RAW, 'threatbase-domain.txt', parent, feedVersion, stats)
        if (!dText) continue
        const hit = binarySearchString(dText, parent, stringCompare)
        if (hit) {
          relatedMatch = { indicator: parent, reason: 'Subdomain of listed malicious domain' }
          result = hit
          break
        }
      }
    }

    // URL pivot: the exact URL isn't listed, but its host (or a parent of it,
    // or a host IP) is — an unlisted path on malicious infra is still malicious.
    if (!result && isURL) {
      const host = extractUrlHost(ip)
      if (host) {
        const hostIsIp = ipv4ToLong(host) !== null
        if (hostIsIp) {
          const { text: ipText } = await fetchAndCacheFeedText(RAW, 'threatbase-ip.txt', feedVersion)
          const hit = binarySearchString(ipText, host, ipCsvCompare)
          if (hit) {
            relatedMatch = { indicator: host, reason: 'URL hosted on listed malicious IP' }
            result = hit
          }
          if (!result) {
            const { text: cidrText } = await fetchAndCacheFeedText(RAW, 'threatbase-cidr.txt', feedVersion)
            const cidrHit = findMatchingCidr(cidrText, ipv4ToLong(host))
            if (cidrHit) {
              relatedMatch = { indicator: cidrHit, reason: 'URL hosted inside listed malicious subnet' }
              matchedCidr = cidrHit
            }
          }
        } else {
          for (const candidate of [host, ...parentDomains(host)]) {
            const { text: dText } = await fetchFeedTextForQuery(RAW, 'threatbase-domain.txt', candidate, feedVersion, stats)
            if (!dText) continue
            const hit = binarySearchString(dText, candidate, stringCompare)
            if (hit) {
              relatedMatch = { indicator: candidate, reason: candidate === host ? 'URL host is a listed malicious domain' : 'URL host is a subdomain of a listed malicious domain' }
              result = hit
              break
            }
          }
        }
      }
    }

    if (result || matchedCidr) {
      isMalicious = true
      if (result) {
        const parsed = parseIpFeedLine(result)
        feedCount = parsed.feedCount
        riskScore = parsed.riskScore
        tags = parsed.tags
        sources = parsed.sources
      } else if (matchedCidr) {
        // Range-based detection: high confidence, surface the matched subnet.
        riskScore = 'High'
        feedCount = 1
        tags = ['Malicious Subnet']
      }
      if (relatedMatch && !tags.includes('Related Infrastructure')) {
        tags = [...tags, 'Related Infrastructure']
      }

      if (supabaseClient) {
        try {
          const { count } = await supabaseClient
            .from('disputes')
            .select('*', { count: 'exact', head: true })
            .eq('ip', ip)

          if (count !== null) {
            disputeCount = count
            if (count >= 3) {
              isMalicious = false
              isDisputed = true
            }
          }
        } catch (err) {
          console.error('Failed to check disputes:', err)
        }
      }
    }
  } catch (e) {
    console.error(e)
  }

  return { type: scanType, ip, isIP, isDomain, isHash, isURL, isIPv6, isCIDR, isMalicious, riskScore, feedCount, isDisputed, disputeCount, tags, sources, matchedCidr, relatedMatch }
}
