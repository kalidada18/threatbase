import { getBaseUrl, getDomainUrl, getHashUrl } from './utils'
import supabaseClient from './supabaseClient'
import { BloomFilter } from './bloomFilter'

type CompareFn = (query: string, line: string) => number

const feedCache: Record<string, { text: string; filter: null }> = {}

async function fetchAndCacheFeedText(
  baseUrl: string,
  filename: string,
  feedVersion: string | number,
): Promise<{ text: string; filter: null }> {
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

  feedCache[cacheKey] = { text, filter: null }
  return feedCache[cacheKey]
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
 * Classify the indicator type and search against cached feed files.
 * Returns { type, isMalicious, riskScore, feedCount }
 */
export async function scanIndicatorLogic(rawInput: string, feedVersion: string | number) {
  const { ip, type, isIP, isIPv6, isCIDR, isHash, isURL, isDomain } = classifyIndicator(rawInput)

  if (type === 'invalid') {
    return { type: 'invalid', ip, isIP, isDomain, isHash, isURL, isIPv6, isCIDR, isMalicious: false, riskScore: 'Low', feedCount: 1 }
  }

  const scanType = type

  const RAW = getBaseUrl()
  let isMalicious = false
  let riskScore = 'Low'
  let feedCount: number | string = 1
  let isDisputed = false
  let disputeCount = 0
  let tags: string[] = []
  let matchedCidr: string | null = null
  // Pivot detection: the exact indicator wasn't listed, but a related one was
  // (URL's host, a parent domain, the host's resolved-in-feed IP form, etc).
  let relatedMatch: { indicator: string; reason: string } | null = null

  try {
    let textData = ''
    let filter: BloomFilter | null = null
    let compareFn: CompareFn = stringCompare

    if (isIP) {
      ;({ text: textData } = await fetchAndCacheFeedText(RAW, 'threatbase-ip.txt', feedVersion))
      compareFn = createIpCsvCompare(ip)
    } else if (isIPv6) {
      ;({ text: textData, filter } = await fetchAndCacheFeedText(RAW, 'threatbase-ipv6.txt', feedVersion))
    } else if (isCIDR) {
      ;({ text: textData, filter } = await fetchAndCacheFeedText(RAW, 'threatbase-cidr.txt', feedVersion))
    } else if (isDomain) {
      ;({ text: textData, filter } = await fetchAndCacheFeedText(RAW, 'threatbase-domain.txt', feedVersion))
    } else if (isHash) {
      ;({ text: textData, filter } = await fetchAndCacheFeedText(RAW, 'threatbase-hash.txt', feedVersion))
    } else if (isURL) {
      ;({ text: textData, filter } = await fetchAndCacheFeedText(RAW, 'threatbase-url.txt', feedVersion))
    }

    let result: string | null = null
    if (!filter || filter.has(ip)) {
      result = binarySearchString(textData, ip, compareFn)
    }

    // CIDR fallback: an IPv4 with no exact row may still be malicious because
    // it falls inside a listed malicious subnet (Spamhaus/FireHOL/etc).
    if (!result && isIP) {
      const { text: cidrText } = await fetchAndCacheFeedText(RAW, 'threatbase-cidr.txt', feedVersion)
      matchedCidr = findMatchingCidr(cidrText, ipv4ToLong(ip))
    }

    // Domain pivot: an unlisted subdomain of a listed domain is still hostile
    // infrastructure (evil.com listed → mail.evil.com flagged).
    if (!result && isDomain) {
      const { text: dText, filter: dFilter } = await fetchAndCacheFeedText(RAW, 'threatbase-domain.txt', feedVersion)
      for (const parent of parentDomains(ip)) {
        if (dFilter && !dFilter.has(parent)) continue
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
          const { text: ipText, filter: ipFilter } = await fetchAndCacheFeedText(RAW, 'threatbase-ip.txt', feedVersion)
          if (!ipFilter || ipFilter.has(host)) {
            const hit = binarySearchString(ipText, host, ipCsvCompare)
            if (hit) {
              relatedMatch = { indicator: host, reason: 'URL hosted on listed malicious IP' }
              result = hit
            }
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
          const { text: dText, filter: dFilter } = await fetchAndCacheFeedText(RAW, 'threatbase-domain.txt', feedVersion)
          for (const candidate of [host, ...parentDomains(host)]) {
            if (dFilter && !dFilter.has(candidate)) continue
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
        const parts = result.split(',')
        if (parts.length >= 3) {
          feedCount = parts[1]
          riskScore = parts[2]
        }
        if (parts.length >= 4) {
          tags = parts[3].split('|').filter((t) => t.trim() !== '' && t !== 'Mixed')
        }
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

  return { type: scanType, ip, isIP, isDomain, isHash, isURL, isIPv6, isCIDR, isMalicious, riskScore, feedCount, isDisputed, disputeCount, tags, matchedCidr, relatedMatch }
}
