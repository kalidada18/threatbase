#!/usr/bin/env python3
"""
HimalayaFeed — Threat Intelligence Feed Aggregator (v3)
=====================================================
Collects malicious IPv4 addresses, Domains, Hashes, and URLs from public feeds,
enriches IPs with GeoIP data, and outputs CSV, JSON, TXT, and STIX 2.1 formats.

Optimized for speed: all feeds fetched in parallel, single-pass GeoIP sweep.
"""

import bisect
import csv
import gzip
import heapq
import ipaddress
import json
import logging
import os
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Feed definitions
# ─────────────────────────────────────────────────────────────────────────────
FEEDS: Dict[str, str] = {
    "feodo_tracker": "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    "feodo_tracker_aggressive": "https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.txt",
    "bbcan177_ms1": "https://gist.githubusercontent.com/BBcan177/bf29d47ea04391cb3eb0/raw/",
    "ipsum": "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt",
    "firehol_level1": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset",
    "firehol_level2": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level2.netset",
    "firehol_level3": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level3.netset",
    "cins_army": "https://cinsscore.com/list/ci-badguys.txt",
    "emerging_threats": "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    "blocklist_de": "https://lists.blocklist.de/lists/all.txt",
    "binary_defense": "https://binarydefense.com/banlist.txt",
    "greensnow": "https://blocklist.greensnow.co/greensnow.txt",
    "spamhaus_drop": "https://www.spamhaus.org/drop/drop.txt",
    "dshield_blocklist": "https://feeds.dshield.org/block.txt",
    "criticalpath_security": "https://raw.githubusercontent.com/CriticalPathSecurity/Public-Intelligence-Feeds/master/compromised-ips.txt",
    "alienvault_reputation": "https://reputation.alienvault.com/reputation.data",
    "bruteforceblocker": "https://danger.rulez.sk/projects/bruteforceblocker/blist.php",
    "botvrij": "https://www.botvrij.eu/data/misp.text_ip-dst.ADMIN.txt",
}

FEED_CATEGORIES: Dict[str, str] = {
    "feodo_tracker": "C2",
    "feodo_tracker_aggressive": "C2",
    "bbcan177_ms1": "Malware",
    "ipsum": "Mixed",
    "firehol_level1": "Mixed",
    "firehol_level2": "Mixed",
    "firehol_level3": "Mixed",
    "cins_army": "Compromised",
    "emerging_threats": "Compromised",
    "blocklist_de": "Brute-Force",
    "binary_defense": "Mixed",
    "greensnow": "Brute-Force",
    "spamhaus_drop": "Spam",
    "dshield_blocklist": "Malware",
    "criticalpath_security": "Compromised",
    "alienvault_reputation": "Mixed",
    "abuseipdb": "Malicious",
    "bruteforceblocker": "Brute-Force",
    "botvrij": "Mixed",
    "threatfox_recent": "Mixed",
}

DOMAIN_FEEDS: Dict[str, str] = {
    "openphish": "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
    "urlhaus": "https://urlhaus.abuse.ch/downloads/text_online/",
    "romainmarcoux": "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/refs/heads/main/full-domains-aa.txt",
    "hagezi_ultimate": "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/ultimate.txt",
}

HASH_FEEDS: Dict[str, str] = {
    "malwarebazaar_recent": "https://bazaar.abuse.ch/export/txt/sha256/recent/",
}

URL_FEEDS: Dict[str, str] = {
    "urlhaus_online": "https://urlhaus.abuse.ch/downloads/text_online/",
    "urlhaus_recent": "https://urlhaus.abuse.ch/downloads/csv_recent/",
    "openphish_urls": "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
}

THREATFOX_FEEDS: Dict[str, str] = {
    "threatfox_recent": "https://threatfox.abuse.ch/export/json/recent/",
}

ABUSEIPDB_API_KEY: Optional[str] = os.environ.get("ABUSEIPDB_API_KEY")
if ABUSEIPDB_API_KEY:
    FEEDS["abuseipdb"] = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=90"

REQUEST_TIMEOUT = (10, 30)
MAX_WORKERS = 12  # Increased — all feed types now share one pool


def get_session():
    session = requests.Session()
    retry = Retry(
        total=2, read=2, connect=2,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
    )
    adapter = HTTPAdapter(max_retries=retry, pool_maxsize=MAX_WORKERS)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


global_session = get_session()

_IPV4_PATTERN = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}"
    r"(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$"
)
_DOMAIN_PATTERN = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)
_SHA256_PATTERN = re.compile(r'^[a-fA-F0-9]{64}$')
_MD5_PATTERN = re.compile(r'^[a-fA-F0-9]{32}$')
_URL_PATTERN = re.compile(r'^https?://.+')


# ─────────────────────────────────────────────────────────────────────────────
# GeoIP Engine — with single-pass sweep for batch lookups
# ─────────────────────────────────────────────────────────────────────────────
class GeoIPEngine:
    def __init__(self):
        self.starts = []
        self.ends = []
        self.asns = []
        self.countries = []
        self.isps = []

    def load(self, url="https://iptoasn.com/data/ip2asn-v4.tsv.gz"):
        db_file = "ip2asn-v4.tsv.gz"
        download_needed = True
        if os.path.exists(db_file):
            file_age = time.time() - os.path.getmtime(db_file)
            if file_age < 86400:
                download_needed = False
                log.info(f"Using cached GeoIP database (age: {int(file_age/3600)}h)")

        try:
            if download_needed:
                log.info("Downloading GeoIP database...")
                resp = global_session.get(url, stream=True, timeout=60)
                resp.raise_for_status()
                with open(db_file, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=65536):
                        f.write(chunk)

            log.info("Parsing GeoIP database...")
            starts = []
            ends = []
            asns = []
            countries = []
            isps = []
            with gzip.open(db_file, 'rt', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) >= 5:
                        starts.append(int(ipaddress.IPv4Address(parts[0])))
                        ends.append(int(ipaddress.IPv4Address(parts[1])))
                        asns.append(parts[2])
                        countries.append(parts[3])
                        isps.append(parts[4])
            self.starts = starts
            self.ends = ends
            self.asns = asns
            self.countries = countries
            self.isps = isps
            log.info(f"Loaded {len(self.starts)} GeoIP ranges.")
        except Exception as e:
            log.error(f"Failed to load GeoIP: {e}")

    def lookup(self, ip_str: str) -> tuple:
        """Single IP lookup (used for top-100 only)."""
        if not self.starts:
            return "Unknown", "0", "Unknown"
        try:
            ip_int = int(ipaddress.IPv4Address(ip_str))
            idx = bisect.bisect_right(self.starts, ip_int) - 1
            if idx >= 0 and self.starts[idx] <= ip_int <= self.ends[idx]:
                return self.countries[idx], self.asns[idx], self.isps[idx]
        except Exception:
            pass
        return "Unknown", "0", "Unknown"

    def batch_lookup(self, ip_int_pairs: List[tuple]) -> List[tuple]:
        """
        Single-pass sweep: given a list of (ip_int, original_index) sorted by ip_int,
        return (country, asn, isp) for each in original order.

        O(n + m) where n = number of IPs, m = number of GeoIP ranges.
        Much faster than n * log(m) individual bisect lookups.
        """
        if not self.starts:
            return [("Unknown", "0", "Unknown")] * len(ip_int_pairs)

        results = [None] * len(ip_int_pairs)
        geo_idx = 0
        geo_len = len(self.starts)
        default = ("Unknown", "0", "Unknown")

        for ip_int, orig_idx in ip_int_pairs:
            # Advance geo_idx until we find a range that could contain this IP
            while geo_idx < geo_len and self.ends[geo_idx] < ip_int:
                geo_idx += 1

            if geo_idx < geo_len and self.starts[geo_idx] <= ip_int <= self.ends[geo_idx]:
                results[orig_idx] = (self.countries[geo_idx], self.asns[geo_idx], self.isps[geo_idx])
            else:
                results[orig_idx] = default

        return results


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def is_public_ipv4(ip: str) -> bool:
    parts = ip.split('.')
    if len(parts) != 4:
        return False
    try:
        p1, p2, p3, p4 = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
        if not (0 <= p1 <= 255 and 0 <= p2 <= 255 and 0 <= p3 <= 255 and 0 <= p4 <= 255):
            return False
        if p1 in (10, 127, 0, 169) or (p1 == 172 and 16 <= p2 <= 31) or (p1 == 192 and p2 == 168) or p1 >= 224:
            return False
        return True
    except Exception:
        return False


def extract_domain(text: str) -> Optional[str]:
    text = text.strip()
    if text.startswith("http://") or text.startswith("https://"):
        try:
            text = text.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0]
        except Exception:
            pass
    text = text.lower()
    if _DOMAIN_PATTERN.match(text):
        return text
    return None


def ip_to_int(ip: str) -> int:
    """Fast IP string to integer conversion without ipaddress module overhead."""
    a, b, c, d = ip.split('.')
    return (int(a) << 24) | (int(b) << 16) | (int(c) << 8) | int(d)


def numerical_ip_key(ip: str) -> tuple:
    return tuple(int(octet) for octet in ip.split("."))


def load_custom_iocs(filename="custom_iocs.txt") -> dict:
    result = {"ips": set(), "domains": set(), "hashes": set(), "urls": set()}
    if not os.path.exists(filename):
        return result
    try:
        with open(filename, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith(('#', '//')):
                    continue
                if is_public_ipv4(line):
                    result["ips"].add(line)
                elif _SHA256_PATTERN.match(line.lower()):
                    result["hashes"].add(line.lower())
                elif _URL_PATTERN.match(line):
                    result["urls"].add(line)
                else:
                    domain = extract_domain(line)
                    if domain:
                        result["domains"].add(domain)
        log.info(f"Loaded custom IOCs: {len(result['ips'])} IPs, {len(result['domains'])} domains, {len(result['hashes'])} hashes, {len(result['urls'])} URLs")
    except Exception as e:
        log.error(f"Failed to load {filename}: {e}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Feed Fetchers
# ─────────────────────────────────────────────────────────────────────────────
def fetch_feed(name: str, url: str) -> Set[str]:
    headers = {"User-Agent": "HimalayaFeed-Aggregator/3.0"}
    if name == "abuseipdb" and ABUSEIPDB_API_KEY:
        headers["Key"] = ABUSEIPDB_API_KEY

    try:
        r = global_session.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()

        if name == "abuseipdb":
            data = r.json()
            return {d["ipAddress"] for d in data.get("data", []) if is_public_ipv4(d["ipAddress"])}

        ips = set()
        for line in r.text.splitlines():
            line = line.strip()
            if not line or line.startswith(("#", "//", "!", "/*")):
                continue
            token = line.split()[0].split(",")[0].strip("\"';")

            if "/" in token:
                try:
                    network = ipaddress.ip_network(token, strict=False)
                    if network.version == 4 and network.prefixlen >= 24:
                        for ip in network.hosts():
                            ip_str = str(ip)
                            if is_public_ipv4(ip_str):
                                ips.add(ip_str)
                except ValueError:
                    pass
            elif is_public_ipv4(token):
                ips.add(token)

        log.info(f"  ✓ {name}: {len(ips)} IPs")
        return ips
    except Exception as e:
        log.error(f"  ✗ Feed {name} failed: {e}")
    return set()


def fetch_domain_feed(name: str, url: str) -> Set[str]:
    try:
        r = global_session.get(url, timeout=REQUEST_TIMEOUT,
                               headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
        r.raise_for_status()

        domains = set()
        for line in r.text.splitlines():
            line = line.strip()
            if not line or line.startswith(("#", "//")):
                continue
            if line.startswith('"'):
                parts = line.split('","')
                if len(parts) > 2:
                    domain = extract_domain(parts[2])
                    if domain:
                        domains.add(domain)
            else:
                domain = extract_domain(line)
                if domain:
                    domains.add(domain)
        log.info(f"  ✓ {name}: {len(domains)} domains")
        return domains
    except Exception as e:
        log.error(f"  ✗ Domain feed {name} failed: {e}")
    return set()


def fetch_hash_feed(name: str, url: str) -> Set[str]:
    """Fetch SHA256 hashes from feeds."""
    try:
        r = global_session.get(url, timeout=REQUEST_TIMEOUT,
                               headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
        r.raise_for_status()
        hashes = set()
        for line in r.text.splitlines():
            line = line.strip()
            if not line or line.startswith(('#', '//', '"')):
                continue
            token = line.split()[0].split(',')[0].strip('"\';\r\n')
            if _SHA256_PATTERN.match(token):
                hashes.add(token.lower())
        log.info(f"  ✓ {name}: {len(hashes)} hashes")
        return hashes
    except Exception as e:
        log.error(f"  ✗ Hash feed {name} failed: {e}")
    return set()


def fetch_url_feed(name: str, url: str) -> Set[str]:
    """Fetch malicious URLs from feeds."""
    try:
        r = global_session.get(url, timeout=REQUEST_TIMEOUT, stream=True,
                               headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
        r.raise_for_status()
        if r.encoding is None:
            r.encoding = 'utf-8'
        urls = set()
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            line = line.strip()
            if not line or line.startswith(('#', '//')):
                continue
            if line.startswith('"'):
                parts = line.split('","')
                if len(parts) > 2:
                    candidate = parts[2].strip('"')
                    if _URL_PATTERN.match(candidate):
                        urls.add(candidate)
            elif _URL_PATTERN.match(line):
                urls.add(line)
        log.info(f"  ✓ {name}: {len(urls)} URLs")
        return urls
    except Exception as e:
        log.error(f"  ✗ URL feed {name} failed: {e}")
    return set()


def fetch_threatfox(name: str, url: str) -> dict:
    """
    Fetch from ThreatFox — returns dict with keys: ips, domains, hashes, urls.
    """
    result = {"ips": set(), "domains": set(), "hashes": set(), "urls": set()}
    try:
        r = global_session.get(url, timeout=60,
                               headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
        r.raise_for_status()
        data = r.json()
        entries = data.get("data", [])
        if isinstance(entries, dict):
            entries = list(entries.values())
        if isinstance(entries, list):
            flat = []
            for item in entries:
                if isinstance(item, list):
                    flat.extend(item)
                elif isinstance(item, dict):
                    flat.append(item)
            entries = flat
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            ioc = entry.get("ioc_value", "").strip()
            ioc_type = entry.get("ioc_type", "").lower()
            if not ioc:
                continue
            if "ip" in ioc_type:
                ip_part = ioc.split(":")[0]
                if is_public_ipv4(ip_part):
                    result["ips"].add(ip_part)
            elif "domain" in ioc_type:
                d = extract_domain(ioc)
                if d:
                    result["domains"].add(d)
            elif "sha256" in ioc_type and _SHA256_PATTERN.match(ioc):
                result["hashes"].add(ioc.lower())
            elif "url" in ioc_type and _URL_PATTERN.match(ioc):
                result["urls"].add(ioc)
        log.info(f"  ✓ ThreatFox {name}: {len(result['ips'])} IPs, {len(result['domains'])} domains, {len(result['hashes'])} hashes, {len(result['urls'])} URLs")
    except Exception as e:
        log.error(f"  ✗ ThreatFox {name} failed: {e}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Exporters
# ─────────────────────────────────────────────────────────────────────────────
def write_csv(sorted_ips: List[str], ip_map: Dict[str, set], geoip: GeoIPEngine) -> None:
    """
    Write malicious_ips.csv with GeoIP enrichment using batch sweep.
    Also produces top_100.json.
    """
    total = len(sorted_ips)
    log.info(f"  Enriching {total} IPs with GeoIP (batch sweep)...")

    # sorted_ips is already in numerical order, so ip_to_int preserves that order
    # No need to re-sort — just build the pairs directly
    ip_int_pairs = [(ip_to_int(ip), idx) for idx, ip in enumerate(sorted_ips)]

    # Single-pass GeoIP sweep — O(n+m) instead of O(n*log(m))
    geo_results = geoip.batch_lookup(ip_int_pairs)

    # Write CSV with pre-computed GeoIP data
    top_100 = []
    with open("malicious_ips.csv", "w", newline="", encoding="utf-8", buffering=1 << 16) as f:
        writer = csv.writer(f)
        writer.writerow(["ip", "sources", "source_count", "reputation", "categories", "country", "asn", "isp"])

        for idx, ip in enumerate(sorted_ips):
            src_set = ip_map[ip]
            source_count = len(src_set)
            reputation = min(100, source_count * 20)
            sources_str = "|".join(sorted(src_set))
            categories_str = "|".join(sorted({FEED_CATEGORIES.get(s, "Mixed") for s in src_set}))
            country, asn, isp = geo_results[idx]

            writer.writerow([ip, sources_str, source_count, reputation, categories_str, country, asn, isp])

            if reputation >= 40 or len(top_100) < 100:
                row_dict = {
                    "ip": ip, "sources": sources_str, "source_count": source_count,
                    "reputation": reputation, "categories": categories_str,
                    "country": country, "asn": asn, "isp": isp
                }
                heap_key = (reputation, source_count, ip)
                if len(top_100) < 100:
                    heapq.heappush(top_100, (heap_key, row_dict))
                else:
                    heapq.heappushpop(top_100, (heap_key, row_dict))

    top_100.sort(key=lambda x: x[0], reverse=True)
    top_100_records = [item[1] for item in top_100]

    with open("top_100.json", "w", encoding="utf-8") as f:
        json.dump(top_100_records, f, indent=2)

    log.info(f"  Wrote malicious_ips.csv ({total} IPs) and top_100.json")


# STIX namespace for deterministic UUIDs
_STIX_NS = uuid.UUID("a06e3c8f-7b2d-4f5a-9c1e-0d8f6b3a2e7c")


def write_stix(sorted_ips: List[str], ip_map: Dict[str, set],
               domains: set = None, hashes: set = None, urls: set = None):
    """
    Export STIX 2.1 bundle.
    - IPs: only reputation >= 80 (source_count >= 4)
    - Domains/Hashes/URLs: all included, capped for file size
    """
    domains = domains or set()
    hashes = hashes or set()
    urls = urls or set()

    high_conf = [ip for ip in sorted_ips if len(ip_map[ip]) >= 4]

    objects = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for ip in high_conf:
        objects.append({
            "type": "indicator", "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'ipv4:{ip}')}",
            "created": ts, "modified": ts,
            "name": f"Malicious IP {ip}",
            "pattern": f"[ipv4-addr:value = '{ip}']",
            "pattern_type": "stix", "valid_from": ts
        })

    for domain in sorted(domains)[:5000]:
        objects.append({
            "type": "indicator", "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'domain:{domain}')}",
            "created": ts, "modified": ts,
            "name": f"Malicious Domain {domain}",
            "pattern": f"[domain-name:value = '{domain}']",
            "pattern_type": "stix", "valid_from": ts
        })

    for h in sorted(hashes)[:5000]:
        objects.append({
            "type": "indicator", "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'sha256:{h}')}",
            "created": ts, "modified": ts,
            "name": f"Malicious File {h[:16]}...",
            "pattern": f"[file:hashes.'SHA-256' = '{h}']",
            "pattern_type": "stix", "valid_from": ts
        })

    for u in sorted(urls)[:2000]:
        safe_url = u.replace("'", "\\'")
        objects.append({
            "type": "indicator", "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'url:{u}')}",
            "created": ts, "modified": ts,
            "name": f"Malicious URL {u[:60]}...",
            "pattern": f"[url:value = '{safe_url}']",
            "pattern_type": "stix", "valid_from": ts
        })

    bundle = {
        "type": "bundle",
        "id": f"bundle--{uuid.uuid5(_STIX_NS, f'bundle:{ts[:10]}')}",
        "objects": objects
    }

    with open("stix2_feed.json", "w", encoding="utf-8") as f:
        json.dump(bundle, f)
    log.info(f"  Wrote stix2_feed.json with {len(objects)} indicators "
             f"({len(high_conf)} IPs, {min(len(domains),5000)} domains, "
             f"{min(len(hashes),5000)} hashes, {min(len(urls),2000)} URLs)")


def write_ip_prefixes(sorted_ips: List[str]):
    """Write 3-octet IP prefix map for fast client-side pre-filtering."""
    prefixes = {}
    for ip in sorted_ips:
        parts = ip.split('.')
        prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
        prefixes[prefix] = prefixes.get(prefix, 0) + 1

    with open("ip_prefixes.json", "w", encoding="utf-8") as f:
        json.dump(prefixes, f)
    log.info(f"  Wrote ip_prefixes.json with {len(prefixes)} /24 prefixes")


def write_hashes(hash_map: Dict[str, Set[str]]) -> set:
    """Write malicious_hashes.txt, malicious_hashes.csv, top_100_hashes.json."""
    hash_sources = {}  # hash -> set of source names
    for src, hashes in hash_map.items():
        for h in hashes:
            if h not in hash_sources:
                hash_sources[h] = set()
            hash_sources[h].add(src)

    all_hashes = set(hash_sources.keys())

    # Write TXT — no need to sort for a flat list
    with open("malicious_hashes.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        for h in all_hashes:
            f.write(h)
            f.write('\n')

    # CSV with source tracking + top 100
    top_100 = []
    with open("malicious_hashes.csv", "w", newline="", encoding="utf-8", buffering=1 << 16) as f:
        writer = csv.writer(f)
        writer.writerow(["hash", "type", "sources", "source_count"])
        for h, sources in hash_sources.items():
            src_sorted = sorted(sources)
            source_count = len(src_sorted)
            writer.writerow([h, "SHA-256", "|".join(src_sorted), source_count])
            entry = {"hash": h, "type": "SHA-256", "sources": "|".join(src_sorted), "source_count": source_count}
            if len(top_100) < 100:
                heapq.heappush(top_100, (source_count, h, entry))
            else:
                heapq.heappushpop(top_100, (source_count, h, entry))

    top_100.sort(key=lambda x: x[0], reverse=True)
    with open("top_100_hashes.json", "w", encoding="utf-8") as f:
        json.dump([item[2] for item in top_100], f, indent=2)

    log.info(f"  Wrote malicious_hashes.txt ({len(all_hashes)} hashes), malicious_hashes.csv, top_100_hashes.json")
    return all_hashes


def write_urls(url_map: Dict[str, Set[str]]) -> set:
    """Write malicious_urls.txt."""
    all_urls = set()
    for urls in url_map.values():
        all_urls.update(urls)

    with open("malicious_urls.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        for u in all_urls:
            f.write(u)
            f.write('\n')

    log.info(f"  Wrote malicious_urls.txt ({len(all_urls)} URLs)")
    return all_urls


def build_stats(ip_map, ip_sources, failed, ts, domains, hashes=None, urls=None):
    hashes = hashes or set()
    urls = urls or set()

    # Single-pass: count per-source IPs, multi-source IPs, and categories at once
    # Old code did O(sources * IPs) — this is O(IPs)
    ips_per_source = {src: 0 for src in ip_sources}
    multi_source = 0
    category_counts = {}

    for src_set in ip_map.values():
        if len(src_set) > 1:
            multi_source += 1
        for s in src_set:
            if s in ips_per_source:
                ips_per_source[s] += 1
            cat = FEED_CATEGORIES.get(s, "Mixed")
            category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "last_updated": ts,
        "total_unique_ips": len(ip_map),
        "total_unique_domains": len(domains),
        "total_unique_hashes": len(hashes),
        "total_unique_urls": len(urls),
        "total_ioc_count": len(ip_map) + len(domains) + len(hashes) + len(urls),
        "total_feeds_processed": len(ip_sources),
        "total_feeds_failed": len(failed),
        "multi_source_ips": multi_source,
        "failed_feeds": failed,
        "ips_per_source": ips_per_source,
        "category_counts": category_counts,
    }


def write_history(stats: dict) -> None:
    history_file = "history.json"
    history = []
    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception as e:
            log.error(f"Failed to load history.json: {e}")

    current_date = stats["last_updated"].split("T")[0]
    ips_per_source = stats.get("ips_per_source", {})
    top_sources = dict(sorted(ips_per_source.items(), key=lambda x: x[1], reverse=True)[:5])

    entry = {
        "date": current_date,
        "total_unique_ips": stats["total_unique_ips"],
        "total_unique_domains": stats.get("total_unique_domains", 0),
        "total_unique_hashes": stats.get("total_unique_hashes", 0),
        "total_unique_urls": stats.get("total_unique_urls", 0),
        "active_feeds": stats["total_feeds_processed"],
        "category_counts": stats.get("category_counts", {}),
        "top_sources": top_sources,
    }

    deduped = {h["date"]: h for h in history if "date" in h}
    deduped[current_date] = entry
    history = sorted(deduped.values(), key=lambda x: x["date"])[-90:]

    try:
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
        log.info(f"  Wrote history.json with {len(history)} records")
    except Exception as e:
        log.error(f"Failed to write history.json: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    t_start = time.time()
    log.info("═" * 55)
    log.info("  HimalayaFeed v3 — Advanced Threat Aggregator")
    log.info("═" * 55)

    # ── GeoIP (can overlap with feed fetches, but needs to finish before CSV write)
    geoip = GeoIPEngine()
    geoip.load()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Load Custom IOCs (once)
    custom_iocs = load_custom_iocs()

    # ── Fetch ALL feeds in parallel ──────────────────────────────────────────
    log.info("Fetching all feeds in parallel...")
    t0 = time.time()

    ip_sources = {}
    domain_results = {}
    hash_sources = {}
    url_sources = {}
    tf_results = {}
    failed = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all feed types at once
        ip_futures = {executor.submit(fetch_feed, n, u): ("ip", n) for n, u in FEEDS.items()}
        domain_futures = {executor.submit(fetch_domain_feed, n, u): ("domain", n) for n, u in DOMAIN_FEEDS.items()}
        hash_futures = {executor.submit(fetch_hash_feed, n, u): ("hash", n) for n, u in HASH_FEEDS.items()}
        url_futures = {executor.submit(fetch_url_feed, n, u): ("url", n) for n, u in URL_FEEDS.items()}
        tf_futures = {executor.submit(fetch_threatfox, n, u): ("tf", n) for n, u in THREATFOX_FEEDS.items()}

        all_futures = {}
        all_futures.update(ip_futures)
        all_futures.update(domain_futures)
        all_futures.update(hash_futures)
        all_futures.update(url_futures)
        all_futures.update(tf_futures)

        for future in as_completed(all_futures):
            feed_type, name = all_futures[future]
            try:
                result = future.result()
                if feed_type == "ip":
                    if result:
                        ip_sources[name] = result
                    else:
                        failed.append(name)
                elif feed_type == "domain":
                    if result:
                        domain_results[name] = result
                    else:
                        failed.append(name)
                elif feed_type == "hash":
                    if result:
                        hash_sources[name] = result
                    else:
                        failed.append(name)
                elif feed_type == "url":
                    if result:
                        url_sources[name] = result
                    else:
                        failed.append(name)
                elif feed_type == "tf":
                    tf_results[name] = result
            except Exception as e:
                log.error(f"  ✗ {name} raised exception: {e}")
                failed.append(name)

    log.info(f"All feeds fetched in {time.time()-t0:.1f}s")

    # ── Merge IPs ────────────────────────────────────────────────────────────
    log.info("Merging IOCs...")
    t0 = time.time()

    # Start with custom IOCs
    ip_map: Dict[str, set] = {ip: {"custom_iocs.txt"} for ip in custom_iocs["ips"]}
    for src, ips in ip_sources.items():
        for ip in ips:
            if ip not in ip_map:
                ip_map[ip] = set()
            ip_map[ip].add(src)

    # ── Merge Domains
    domain_set: set = custom_iocs["domains"].copy()
    for domains in domain_results.values():
        domain_set.update(domains)

    # ── Merge ThreatFox results into all categories
    for name, tf in tf_results.items():
        if tf["ips"]:
            ip_sources[name] = tf["ips"]
            for ip in tf["ips"]:
                if ip not in ip_map:
                    ip_map[ip] = set()
                ip_map[ip].add(name)
        domain_set.update(tf["domains"])
        if tf["hashes"]:
            hash_sources[name] = hash_sources.get(name, set()) | tf["hashes"]
        if tf["urls"]:
            url_sources[name] = url_sources.get(name, set()) | tf["urls"]

    # Add custom hashes/URLs
    if custom_iocs["hashes"]:
        hash_sources["custom_iocs.txt"] = custom_iocs["hashes"]
    if custom_iocs["urls"]:
        url_sources["custom_iocs.txt"] = custom_iocs["urls"]

    # ── Load historical hashes & URLs (feeds only give recent samples) ───────
    # IP/domain feeds provide full current datasets (700K+), no history needed.
    # But hash feeds give only ~450 recent samples per run — accumulation is key.
    if os.path.exists("malicious_hashes.txt"):
        try:
            historical_hashes = set()
            with open("malicious_hashes.txt", "r", encoding="utf-8") as f:
                for line in f:
                    h = line.strip()
                    if h and _SHA256_PATTERN.match(h):
                        historical_hashes.add(h)
            if historical_hashes:
                hash_sources["historical"] = historical_hashes
                log.info(f"  Loaded {len(historical_hashes)} historical hashes")
        except Exception as e:
            log.error(f"Failed to load malicious_hashes.txt: {e}")

    if os.path.exists("malicious_urls.txt"):
        try:
            historical_urls = set()
            with open("malicious_urls.txt", "r", encoding="utf-8") as f:
                for line in f:
                    u = line.strip()
                    if u and _URL_PATTERN.match(u):
                        historical_urls.add(u)
            if historical_urls:
                url_sources["historical"] = historical_urls
                log.info(f"  Loaded {len(historical_urls)} historical URLs")
        except Exception as e:
            log.error(f"Failed to load malicious_urls.txt: {e}")

    # Sort IPs once
    sorted_ips = sorted(ip_map.keys(), key=numerical_ip_key)
    log.info(f"Merged in {time.time()-t0:.1f}s — {len(ip_map)} IPs, {len(domain_set)} domains")

    # ── Write outputs ────────────────────────────────────────────────────────
    log.info("Writing output files...")
    t0 = time.time()

    all_hashes = write_hashes(hash_sources)
    all_urls = write_urls(url_sources)

    stats = build_stats(ip_map, ip_sources, failed, ts, domain_set, all_hashes, all_urls)
    with open("stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    # Plain text IP list
    with open("malicious_ips.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        for ip in sorted_ips:
            f.write(ip)
            f.write('\n')

    # Plain text domain list — skip sorting, order doesn't matter for a blocklist
    with open("malicious_domains.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        for d in domain_set:
            f.write(d)
            f.write('\n')

    write_csv(sorted_ips, ip_map, geoip)
    write_stix(sorted_ips, ip_map, domain_set, all_hashes, all_urls)
    write_ip_prefixes(sorted_ips)
    write_history(stats)

    elapsed = time.time() - t_start
    log.info(f"═" * 55)
    log.info(f"  Done in {elapsed:.1f}s — {stats['total_ioc_count']} IOCs "
             f"({len(ip_map)} IPs, {len(domain_set)} domains, "
             f"{len(all_hashes)} hashes, {len(all_urls)} URLs)")
    log.info(f"═" * 55)


if __name__ == "__main__":
    main()
