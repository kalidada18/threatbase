// DNS & CDN/Cloud Provider Whitelist IP CIDRs
export const DNS_WHITELIST_CIDRS = [
  // DNS resolvers
  "1.0.0.0/24",       // Cloudflare DNS
  "1.1.1.0/24",       // Cloudflare DNS
  "8.8.8.0/24",       // Google DNS
  "8.8.4.0/24",       // Google DNS
  "9.9.9.0/24",       // Quad9
  "9.9.9.10/32",      // Quad9 ECS
  "149.112.112.0/24", // Quad9
  "208.67.222.0/24",  // OpenDNS
  "208.67.220.0/24",  // OpenDNS
  "4.4.4.4/32",       // Level3 DNS
  "4.2.2.0/24",       // Level3 DNS
  "94.140.14.0/24",   // AdGuard DNS
  "94.140.15.0/24",   // AdGuard DNS
  // Cloudflare CDN
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "162.158.0.0/15",
  "198.41.128.0/17",
  "197.234.240.0/22",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "185.221.0.0/22",
  // Fastly CDN
  "23.235.32.0/20",
  "43.249.72.0/22",
  "103.244.50.0/24",
  "103.245.222.0/23",
  "103.245.224.0/24",
  "104.156.80.0/20",
  "140.248.64.0/18",
  "140.248.128.0/17",
  "150.101.128.0/17",
  "151.101.0.0/16",
  "157.52.64.0/18",
  "167.82.0.0/17",
  "167.82.128.0/20",
  "167.82.160.0/20",
  "167.82.224.0/20",
  "172.111.64.0/18",
  "185.31.16.0/22",
  "199.27.72.0/21",
  "199.232.0.0/16",
  // AWS CloudFront
  "13.32.0.0/15",
  "13.35.0.0/16",
  "52.46.0.0/18",
  "52.84.0.0/15",
  "54.182.0.0/16",
  "54.192.0.0/16",
  "54.230.0.0/16",
  "54.239.128.0/18",
  "54.239.192.0/19",
  "64.252.64.0/18",
  "64.252.128.0/18",
  "70.132.0.0/18",
  "71.152.0.0/17",
  "99.84.0.0/16",
  "204.246.164.0/22",
  "204.246.168.0/22",
  "204.246.174.0/23",
  "204.246.176.0/20",
  "205.251.192.0/19",
  "205.251.249.0/24",
  "205.251.250.0/23",
  "205.251.252.0/23",
  "205.251.254.0/24",
  "216.137.32.0/19",
  // Azure (main ranges — full list at aka.ms/azureipranges)
  "13.64.0.0/11",
  "13.96.0.0/13",
  "13.104.0.0/14",
  "20.36.0.0/14",
  "20.40.0.0/13",
  "20.48.0.0/12",
  "40.64.0.0/10",
  "40.74.0.0/15",
  "40.76.0.0/14",
  "40.80.0.0/12",
  "40.96.0.0/12",
  "40.112.0.0/13",
  "40.120.0.0/14",
  "40.124.0.0/16",
  "40.125.0.0/17",
  // GCP
  "34.0.0.0/9",
  "34.128.0.0/10",
  "35.184.0.0/13",
  "35.192.0.0/14",
  "35.196.0.0/15",
  "35.198.0.0/16",
  "35.199.0.0/17",
  "35.199.128.0/18",
  "35.200.0.0/13",
  "35.208.0.0/12",
  "35.224.0.0/12",
  "35.240.0.0/13",
  // Akamai
  "23.32.0.0/11",
  "23.64.0.0/14",
  "23.72.0.0/13",
  "104.64.0.0/10",
  "184.24.0.0/13",
  "184.50.0.0/15",
  "184.84.0.0/14",
  // User manual FP
  "192.195.233.204/32",
]

// RFC 1918, loopback, multicast, link-local and reserved IPv4 CIDRs
export const PRIVATE_RESERVED_CIDRS = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32"
]

export function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function inCidr(ip: string, cidr: string): boolean {
  try {
    const [baseIp, maskStr] = cidr.split('/');
    const mask = parseInt(maskStr, 10);
    const ipLong = ipToLong(ip);
    const baseLong = ipToLong(baseIp);
    if (mask === 0) return true;
    const bitmask = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
    return (ipLong & bitmask) === (baseLong & bitmask);
  } catch (e) {
    return false;
  }
}

export function isPrivateReservedIpv6(ip: string): boolean {
  const norm = ip.toLowerCase().trim();
  if (norm === '::1' || norm === '::' || norm.startsWith('::/')) return true;
  if (norm.startsWith('::ffff:')) return true; // IPv4-mapped (e.g. ::ffff:7f00:1 = 127.0.0.1) — report the v4 form instead
  if (norm.startsWith('64:ff9b:')) return true; // NAT64 well-known prefix
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(norm)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(norm)) return true;
  if (/^ff[0-9a-f]{2}:/i.test(norm)) return true;
  if (norm.startsWith('2001:db8:') || norm.startsWith('2001:0db8:')) return true;
  if (norm.startsWith('100::') || norm.startsWith('0100::') || /^0100:0{0,3}:/i.test(norm)) return true;
  return false;
}

/**
 * Strict IPv6: eight hextets, or exactly one '::' compression (pure-hex only,
 * no dotted v4-suffix). Rejects junk like ':', '1:2:3', 'dead:beef', '12345::'
 * that a loose colon-hex check would wave through. Shared by the batch scan
 * validator and the report-endpoint public-IP guard.
 */
export function isStrictIpv6(s: string): boolean {
  const hextet = /^[0-9a-fA-F]{1,4}$/
  const ok = (groups: string[]) => groups.every((g) => hextet.test(g))
  if (!s.includes(':') || s.includes(':::')) return false
  if (!s.includes('::')) {
    const g = s.split(':')
    return g.length === 8 && ok(g)
  }
  const parts = s.split('::')
  if (parts.length !== 2) return false
  const head = parts[0] === '' ? [] : parts[0].split(':')
  const tail = parts[1] === '' ? [] : parts[1].split(':')
  return head.length + tail.length <= 7 && ok(head) && ok(tail)
}
