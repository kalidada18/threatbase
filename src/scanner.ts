import { getBaseUrl } from './utils'
import supabaseClient from './supabaseClient'

const feedCache = {}

export async function fetchAndCacheFeed(url) {
  if (feedCache[url]) return feedCache[url]
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const text = await r.text()
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('ip,'))
    feedCache[url] = lines
    return lines
  } catch (e) {
    console.error('Failed to fetch feed:', e)
    return []
  }
}

function ipCsvCompare(query, line) {
  const ipPart = line.split(',')[0]
  const pA = query.split('.').map(Number)
  const pB = ipPart.split('.').map(Number)
  for (let i = 0; i < 4; i++) {
    if ((pA[i] || 0) < (pB[i] || 0)) return -1
    if ((pA[i] || 0) > (pB[i] || 0)) return 1
  }
  return 0
}

function stringCompare(query, line) {
  if (query < line) return -1
  if (query > line) return 1
  return 0
}

function binarySearchArray(arr, query, compareFn) {
  let low = 0
  let high = arr.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const comp = compareFn(query, arr[mid])
    if (comp === 0) return arr[mid]
    if (comp < 0) high = mid - 1
    else low = mid + 1
  }
  return null
}

/**
 * Classify the indicator type and search against cached feed files.
 * Returns { type, isMalicious, riskScore, feedCount }
 */
export async function scanIndicatorLogic(rawInput, feedVersion) {
  const isURL = /^https?:\/\/.+/.test(rawInput)
  const isHash = /^[a-fA-F0-9]{32}(?:[a-fA-F0-9]{8})?(?:[a-fA-F0-9]{24})?$/.test(rawInput)
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

  if (!isIP && !isIPv6 && !isCIDR && !isDomain && !isHash && !isURL) {
    return { type: 'invalid', ip, isIP, isDomain, isHash, isURL, isIPv6, isCIDR, isMalicious: false, riskScore: 'Low', feedCount: 1 }
  }

  let scanType = 'Indicator'
  if (isIP) scanType = 'IP Address'
  else if (isIPv6) scanType = 'IPv6 Address'
  else if (isCIDR) scanType = 'CIDR Block'
  else if (isHash) scanType = 'File Hash'
  else if (isURL) scanType = 'URL'
  else if (isDomain) scanType = 'Domain'

  const RAW = getBaseUrl()
  let isMalicious = false
  let riskScore = 'Low'
  let feedCount = 1

  try {
    let list = []
    let compareFn = stringCompare

    if (isIP) {
      list = await fetchAndCacheFeed(RAW + 'malicious_ips.txt?v=' + feedVersion)
      compareFn = ipCsvCompare
    } else if (isIPv6) {
      list = await fetchAndCacheFeed(RAW + 'malicious_ipv6.txt?v=' + feedVersion)
    } else if (isCIDR) {
      list = await fetchAndCacheFeed(RAW + 'malicious_cidrs.txt?v=' + feedVersion)
    } else if (isDomain) {
      list = await fetchAndCacheFeed(RAW + 'malicious_domains.txt?v=' + feedVersion)
    } else if (isHash) {
      list = await fetchAndCacheFeed(RAW + 'malicious_hashes.txt?v=' + feedVersion)
    } else if (isURL) {
      list = await fetchAndCacheFeed(RAW + 'malicious_urls.txt?v=' + feedVersion)
    }

    const result = binarySearchArray(list, ip, compareFn)
    let isDisputed = false
    let disputeCount = 0

    if (result) {
      isMalicious = true
      if (isIP) {
        const parts = result.split(',')
        if (parts.length >= 3) {
          feedCount = parts[1]
          riskScore = parts[2]
        }
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

  return { type: scanType, ip, isIP, isDomain, isHash, isURL, isIPv6, isCIDR, isMalicious, riskScore, feedCount, isDisputed, disputeCount }
}
