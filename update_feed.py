#!/usr/bin/env python3
"""
HimalayaFeed — Threat Intelligence Feed Aggregator (v2)
=====================================================
Collects malicious IPv4 addresses and Domains, enriches them with GeoIP,
and outputs standard CSV, JSON, and STIX 2.1 formats.
"""

import ipaddress
import json
import logging
import os
import re
import time
import uuid
import gzip
import bisect
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import csv
import heapq
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
}

DOMAIN_FEEDS: Dict[str, str] = {
    "openphish": "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
    "urlhaus": "https://urlhaus.abuse.ch/downloads/text_online/",
    "romainmarcoux": "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/refs/heads/main/full-domains-aa.txt",
    "hagezi_ultimate": "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/ultimate.txt",
}

HASH_FEEDS: Dict[str, str] = {
    # MalwareBazaar — free, no API key needed for recent samples
    "malwarebazaar_recent": "https://bazaar.abuse.ch/export/txt/sha256/recent/",
    # "malwarebazaar_full": "https://bazaar.abuse.ch/export/txt/sha256/full/",  # large ~daily
}

URL_FEEDS: Dict[str, str] = {
    "urlhaus_online": "https://urlhaus.abuse.ch/downloads/text_online/",
    "urlhaus_recent": "https://urlhaus.abuse.ch/downloads/csv_recent/",
    "openphish_urls": "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
}

THREATFOX_FEEDS: Dict[str, str] = {
    # ThreatFox — all IOC types in one place (IPs, URLs, domains, hashes)
    "threatfox_recent": "https://threatfox.abuse.ch/export/json/recent/",
}

ABUSEIPDB_API_KEY: Optional[str] = os.environ.get("ABUSEIPDB_API_KEY")
if ABUSEIPDB_API_KEY:
    FEEDS["abuseipdb"] = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=90"


REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_DELAY = 5
MAX_WORKERS = 8

def get_session():
    session = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        read=MAX_RETRIES,
        connect=MAX_RETRIES,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

global_session = get_session()


_IPV4_PATTERN = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}"
    r"(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$"
)

_DOMAIN_PATTERN = re.compile(
    r"^(?:[a-zA-Z0-9]"
    r"(?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+"
    r"[a-zA-Z]{2,}$"
)

_PRIVATE_PATTERN = re.compile(
    r"^(?:"
    r"0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|"
    r"172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.0\.|192\.0\.2\.|192\.168\.|"
    r"198\.1[89]\.|198\.51\.100\.|203\.0\.113\.|2(?:2[4-9]|[3-5]\d)\.|"
    r"255\.255\.255\.255"
    r")"
)

_SHA256_PATTERN = re.compile(r'^[a-fA-F0-9]{64}$')
_MD5_PATTERN = re.compile(r'^[a-fA-F0-9]{32}$')
_URL_PATTERN = re.compile(r'^https?://.+')

# ─────────────────────────────────────────────────────────────────────────────
# GeoIP Engine
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
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
            
            log.info("Parsing GeoIP database...")
            with gzip.open(db_file, 'rt', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) >= 5:
                        self.starts.append(int(ipaddress.IPv4Address(parts[0])))
                        self.ends.append(int(ipaddress.IPv4Address(parts[1])))
                        self.asns.append(parts[2])
                        self.countries.append(parts[3])
                        self.isps.append(parts[4])
            log.info(f"Loaded {len(self.starts)} GeoIP ranges.")
        except Exception as e:
            log.error(f"Failed to load GeoIP: {e}")

    def lookup(self, ip_str: str) -> tuple:
        if not self.starts: return "Unknown", "0", "Unknown"
        try:
            ip_int = int(ipaddress.IPv4Address(ip_str))
            idx = bisect.bisect_right(self.starts, ip_int) - 1
            if idx >= 0 and self.starts[idx] <= ip_int <= self.ends[idx]:
                return self.countries[idx], self.asns[idx], self.isps[idx]
        except Exception:
            pass
        return "Unknown", "0", "Unknown"

# ─────────────────────────────────────────────────────────────────────────────
# Core Logic
# ─────────────────────────────────────────────────────────────────────────────

def load_custom_iocs(filename="custom_iocs.txt") -> dict:
    result = {"ips": set(), "domains": set(), "hashes": set(), "urls": set()}
    if not os.path.exists(filename):
        return result
    try:
        with open(filename, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith(('#', '//')): continue
                if is_public_ipv4(line):
                    result["ips"].add(line)
                elif _SHA256_PATTERN.match(line.lower()):
                    result["hashes"].add(line.lower())
                elif _URL_PATTERN.match(line):
                    result["urls"].add(line)
                else:
                    domain = extract_domain(line)
                    if domain: result["domains"].add(domain)
        log.info(f"Loaded custom IOCs: {len(result['ips'])} IPs, {len(result['domains'])} domains, {len(result['hashes'])} hashes, {len(result['urls'])} URLs")
    except Exception as e:
        log.error(f"Failed to load {filename}: {e}")
    return result

def is_public_ipv4(ip: str) -> bool:
    parts = ip.split('.')
    if len(parts) != 4: return False
    try:
        p1, p2, p3, p4 = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
        if not (0 <= p1 <= 255 and 0 <= p2 <= 255 and 0 <= p3 <= 255 and 0 <= p4 <= 255): return False
        if p1 in (10, 127, 0, 169) or (p1 == 172 and 16 <= p2 <= 31) or (p1 == 192 and p2 == 168) or p1 >= 224: return False
        return True
    except: return False

def extract_domain(text: str) -> Optional[str]:
    text = text.strip()
    if text.startswith("http://") or text.startswith("https://"):
        try:
            # Much faster than urllib.parse for simple domain extraction
            text = text.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0]
        except: pass
    text = text.lower()
    if _DOMAIN_PATTERN.match(text):
        return text
    return None

def fetch_feed(name: str, url: str) -> Set[str]:
    headers = {"User-Agent": "HimalayaFeed-Aggregator/2.0"}
    if name == "abuseipdb" and ABUSEIPDB_API_KEY:
        headers["Key"] = ABUSEIPDB_API_KEY

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = global_session.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            
            if name == "abuseipdb":
                data = r.json()
                return {d["ipAddress"] for d in data.get("data", []) if is_public_ipv4(d["ipAddress"])}
                
            ips = set()
            for line in r.text.splitlines():
                line = line.strip()
                if not line or line.startswith(("#", "//", "!", "/*")): continue
                token = line.split()[0].split(",")[0].strip('"\';')
                
                if "/" in token:
                    try:
                        network = ipaddress.ip_network(token, strict=False)
                        if network.version == 4 and network.prefixlen >= 24:
                            for ip in network.hosts():
                                ip_str = str(ip)
                                if is_public_ipv4(ip_str): ips.add(ip_str)
                    except ValueError: pass
                elif is_public_ipv4(token):
                    ips.add(token)
            
            return ips
        except Exception as e:
            if attempt == MAX_RETRIES:
                log.error(f"Feed {name} failed: {e}")
            else:
                time.sleep(RETRY_DELAY)
    return set()

def fetch_domain_feed(name: str, url: str) -> Set[str]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = global_session.get(url, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
                
            domains = set()
            for line in r.text.splitlines():
                line = line.strip()
                if not line or line.startswith(("#", "//")): continue
                # For URLhaus, CSV style
                if line.startswith('"'):
                    parts = line.split('","')
                    if len(parts) > 2:
                        domain = extract_domain(parts[2])
                        if domain: domains.add(domain)
                else:
                    domain = extract_domain(line)
                    if domain: domains.add(domain)
            return domains
        except Exception as e:
            if attempt == MAX_RETRIES:
                log.error(f"Domain Feed {name} failed: {e}")
            else:
                time.sleep(RETRY_DELAY)
    return set()

def fetch_hash_feed(name: str, url: str) -> Set[str]:
    """Fetch SHA256 hashes from feeds."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = global_session.get(url, timeout=REQUEST_TIMEOUT,
                           headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
            r.raise_for_status()
            hashes = set()
            for line in r.text.splitlines():
                line = line.strip()
                if not line or line.startswith(('#', '//', '"')): continue
                token = line.split()[0].split(',')[0].strip('"\';\r\n')
                if _SHA256_PATTERN.match(token):
                    hashes.add(token.lower())
            return hashes
        except Exception as e:
            if attempt == MAX_RETRIES:
                log.error(f"Hash feed {name} failed: {e}")
            else:
                time.sleep(RETRY_DELAY)
    return set()

def fetch_url_feed(name: str, url: str) -> Set[str]:
    """Fetch malicious URLs from feeds."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = global_session.get(url, timeout=REQUEST_TIMEOUT, stream=True,
                           headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
            r.raise_for_status()
            if r.encoding is None:
                r.encoding = 'utf-8'
            urls = set()
            for line in r.iter_lines(decode_unicode=True):
                if not line: continue
                line = line.strip()
                if not line or line.startswith(('#', '//')): continue
                # URLhaus CSV: extract URL from quoted fields
                if line.startswith('"'):
                    parts = line.split('","')
                    if len(parts) > 2:
                        candidate = parts[2].strip('"')
                        if _URL_PATTERN.match(candidate):
                            urls.add(candidate)
                elif _URL_PATTERN.match(line):
                    urls.add(line)
            return urls
        except Exception as e:
            if attempt == MAX_RETRIES:
                log.error(f"URL feed {name} failed: {e}")
            else:
                time.sleep(RETRY_DELAY)
    return set()

def fetch_threatfox(name: str, url: str) -> dict:
    """
    Fetch from ThreatFox — returns dict with keys: ips, domains, hashes, urls.
    ThreatFox JSON gives ioc_type field — split on that.
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
            # Could be list of lists or list of dicts
            flat = []
            for item in entries:
                if isinstance(item, list):
                    flat.extend(item)
                elif isinstance(item, dict):
                    flat.append(item)
            entries = flat
        for entry in entries:
            if not isinstance(entry, dict): continue
            ioc = entry.get("ioc_value", "").strip()
            ioc_type = entry.get("ioc_type", "").lower()
            if not ioc: continue
            if "ip" in ioc_type:
                ip_part = ioc.split(":")[0]
                if is_public_ipv4(ip_part):
                    result["ips"].add(ip_part)
            elif "domain" in ioc_type:
                d = extract_domain(ioc)
                if d: result["domains"].add(d)
            elif "sha256" in ioc_type and _SHA256_PATTERN.match(ioc):
                result["hashes"].add(ioc.lower())
            elif "url" in ioc_type and _URL_PATTERN.match(ioc):
                result["urls"].add(ioc)
        log.info(f"ThreatFox {name}: {len(result['ips'])} IPs, {len(result['domains'])} domains, {len(result['hashes'])} hashes, {len(result['urls'])} URLs")
    except Exception as e:
        log.error(f"ThreatFox {name} failed: {e}")
    return result

def build_stats(ip_map, ip_sources, failed, ts, domains, hashes=None, urls=None):
    hashes = hashes or set()
    urls = urls or set()
    ips_per_source = {src: sum(1 for src_list in ip_map.values() if src in src_list) for src in ip_sources}
    multi_source = sum(1 for src_list in ip_map.values() if len(src_list) > 1)

    # Per-category breakdown
    category_counts = {}
    for src_list in ip_map.values():
        cats = set(FEED_CATEGORIES.get(s, "Mixed") for s in src_list)
        for cat in cats:
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

# ─────────────────────────────────────────────────────────────────────────────
# Exporters
# ─────────────────────────────────────────────────────────────────────────────
def numerical_ip_key(ip: str) -> tuple:
    return tuple(int(octet) for octet in ip.split("."))

def write_csv(sorted_ips: List[str], ip_map: Dict[str, List[str]], geoip: GeoIPEngine) -> None:
    top_100 = []
    
    with open("malicious_ips.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["ip", "sources", "source_count", "reputation", "categories", "country", "asn", "isp"])
        
        for ip in sorted_ips:
            sources = sorted(ip_map[ip]) if isinstance(ip_map[ip], set) else ip_map[ip]
            source_count = len(sources)
            reputation = min(100, source_count * 20)
            categories = sorted(set(FEED_CATEGORIES.get(s, "Mixed") for s in sources))
            country, asn, isp = geoip.lookup(ip)
            
            row = [ip, "|".join(sources), source_count, reputation, "|".join(categories), country, asn, isp]
            writer.writerow(row)
            
            heap_key = (reputation, source_count, ip)
            row_dict = {
                "ip": ip,
                "sources": row[1],
                "source_count": source_count,
                "reputation": reputation,
                "categories": row[4],
                "country": country,
                "asn": asn,
                "isp": isp
            }
            if len(top_100) < 100:
                heapq.heappush(top_100, (heap_key, row_dict))
            else:
                heapq.heappushpop(top_100, (heap_key, row_dict))
                
    top_100.sort(key=lambda x: x[0], reverse=True)
    top_100_records = [item[1] for item in top_100]
    
    with open("top_100.json", "w", encoding="utf-8") as f:
        json.dump(top_100_records, f, indent=2)
        
    log.info("Wrote malicious_ips.csv and top_100.json")

# STIX namespace for deterministic UUIDs — same IOC always gets the same UUID
_STIX_NS = uuid.UUID("a06e3c8f-7b2d-4f5a-9c1e-0d8f6b3a2e7c")

def write_stix(sorted_ips: List[str], ip_map: Dict[str, List[str]],
               domains: set = None, hashes: set = None, urls: set = None):
    """
    Export STIX 2.1 bundle.
    - IPs: only reputation >= 80 (i.e. source_count >= 4). This threshold is
      chosen because reputation = min(100, source_count * 20), so >= 80 means
      the IP was independently confirmed by 4+ feeds.
    - Domains/Hashes/URLs: all included (already curated by source feeds).
    - Uses uuid5 for deterministic indicator IDs so downstream consumers
      can deduplicate across hourly runs.
    """
    domains = domains or set()
    hashes = hashes or set()
    urls = urls or set()

    high_conf = [ip for ip in sorted_ips if min(100, len(ip_map[ip]) * 20) >= 80]
    
    objects = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # ── Load Custom IOCs ──
    custom_iocs = load_custom_iocs()
    
    for ip in high_conf:
        objects.append({
            "type": "indicator",
            "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'ipv4:{ip}')}",
            "created": ts,
            "modified": ts,
            "name": f"Malicious IP {ip}",
            "pattern": f"[ipv4-addr:value = '{ip}']",
            "pattern_type": "stix",
            "valid_from": ts
        })

    for domain in sorted(domains)[:5000]:  # cap to keep file size reasonable
        objects.append({
            "type": "indicator",
            "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'domain:{domain}')}",
            "created": ts,
            "modified": ts,
            "name": f"Malicious Domain {domain}",
            "pattern": f"[domain-name:value = '{domain}']",
            "pattern_type": "stix",
            "valid_from": ts
        })

    for h in sorted(hashes)[:5000]:
        objects.append({
            "type": "indicator",
            "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'sha256:{h}')}",
            "created": ts,
            "modified": ts,
            "name": f"Malicious File {h[:16]}...",
            "pattern": f"[file:hashes.'SHA-256' = '{h}']",
            "pattern_type": "stix",
            "valid_from": ts
        })

    for u in sorted(urls)[:2000]:
        safe_url = u.replace("'", "\\'")
        objects.append({
            "type": "indicator",
            "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid5(_STIX_NS, f'url:{u}')}",
            "created": ts,
            "modified": ts,
            "name": f"Malicious URL {u[:60]}...",
            "pattern": f"[url:value = '{safe_url}']",
            "pattern_type": "stix",
            "valid_from": ts
        })

    bundle = {
        "type": "bundle",
        "id": f"bundle--{uuid.uuid5(_STIX_NS, f'bundle:{ts[:10]}')}",
        "objects": objects
    }
    
    with open("stix2_feed.json", "w", encoding="utf-8") as f:
        json.dump(bundle, f)
    total = len(objects)
    log.info(f"Wrote stix2_feed.json with {total} indicators ({len(high_conf)} IPs, {min(len(domains),5000)} domains, {min(len(hashes),5000)} hashes, {min(len(urls),2000)} URLs)")

def write_ip_prefixes(sorted_ips: List[str]):
    """Write 3-octet IP prefix map for fast client-side pre-filtering.
    
    Replaces the old bloom.json which only stored 2-octet prefixes (X.Y)
    and was too broad to meaningfully reduce false positives.
    The 3-octet map (X.Y.Z -> count) allows the frontend to skip the
    full CSV download when the queried IP's /24 has zero known threats.
    """
    prefixes = {}
    for ip in sorted_ips:
        parts = ip.split('.')
        prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
        prefixes[prefix] = prefixes.get(prefix, 0) + 1
        
    with open("ip_prefixes.json", "w", encoding="utf-8") as f:
        json.dump(prefixes, f)
    log.info(f"Wrote ip_prefixes.json with {len(prefixes)} /24 prefixes")

def write_hashes(hash_map: Dict[str, Set[str]]) -> None:
    """Write hash output files: malicious_hashes.txt, malicious_hashes.csv, top_100_hashes.json."""
    all_hashes = set()
    hash_sources = {}  # hash -> set of source names
    for src, hashes in hash_map.items():
        for h in hashes:
            all_hashes.add(h)
            if h not in hash_sources: hash_sources[h] = set()
            hash_sources[h].add(src)
    
    sorted_hashes = sorted(all_hashes)
    
    with open("malicious_hashes.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted_hashes) + "\n")
    
    # CSV with source tracking
    top_100 = []
    with open("malicious_hashes.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["hash", "type", "sources", "source_count"])
        for h in sorted_hashes:
            sources = sorted(hash_sources.get(h, set()))
            source_count = len(sources)
            writer.writerow([h, "SHA-256", "|".join(sources), source_count])
            entry = {"hash": h, "type": "SHA-256", "sources": "|".join(sources), "source_count": source_count}
            if len(top_100) < 100:
                heapq.heappush(top_100, (source_count, h, entry))
            else:
                heapq.heappushpop(top_100, (source_count, h, entry))
    
    top_100.sort(key=lambda x: x[0], reverse=True)
    with open("top_100_hashes.json", "w", encoding="utf-8") as f:
        json.dump([item[2] for item in top_100], f, indent=2)
    
    log.info(f"Wrote malicious_hashes.txt ({len(all_hashes)} hashes), malicious_hashes.csv, top_100_hashes.json")
    return all_hashes

def write_urls(url_map: Dict[str, Set[str]]) -> None:
    """Write malicious_urls.txt."""
    all_urls = set()
    for src, urls in url_map.items():
        all_urls.update(urls)
    
    sorted_urls = sorted(all_urls)
    with open("malicious_urls.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted_urls) + "\n")
    
    log.info(f"Wrote malicious_urls.txt ({len(all_urls)} URLs)")
    return all_urls

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

    # Per-source top 5 for compact history
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
    
    # Deduplicate by date, keeping the latest run for each day
    deduped = {h["date"]: h for h in history if "date" in h}
    deduped[current_date] = entry
    
    history = sorted(deduped.values(), key=lambda x: x["date"])[-90:]
    
    try:
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
        log.info(f"Wrote history.json with {len(history)} records")
    except Exception as e:
        log.error(f"Failed to write history.json: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    log.info("═" * 55)
    log.info("  HimalayaFeed v3 — Advanced Threat Aggregator")
    log.info("═" * 55)

    geoip = GeoIPEngine()
    geoip.load()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # ── Load Custom IOCs ──
    custom_iocs = load_custom_iocs()
    
    # ── Load Historical Data (Stateful merge) ──
    # First, preload custom IOCs as 'custom_iocs.txt' source
    historical_ip_map = {ip: {"custom_iocs.txt"} for ip in custom_iocs["ips"]}
    historical_domain_map = custom_iocs["domains"].copy()
    historical_hash_map = {h: {"custom_iocs.txt"} for h in custom_iocs["hashes"]}
    historical_url_map = custom_iocs["urls"].copy()

    
    if os.path.exists("malicious_ips.csv"):
        try:
            with open("malicious_ips.csv", "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                next(reader, None)  # skip header
                for row in reader:
                    if len(row) >= 2:
                        ip = row[0]
                        sources = set(row[1].split("|"))
                        historical_ip_map[ip] = sources
            log.info(f"Loaded {len(historical_ip_map)} historical IPs from malicious_ips.csv")
        except Exception as e:
            log.error(f"Failed to load malicious_ips.csv: {e}")

    
    if os.path.exists("malicious_domains.txt"):
        try:
            with open("malicious_domains.txt", "r", encoding="utf-8") as f:
                for line in f:
                    d = line.strip()
                    if d and not d.startswith("#"):
                        historical_domain_map.add(d)
            log.info(f"Loaded {len(historical_domain_map)} historical domains")
        except Exception as e:
            log.error(f"Failed to load malicious_domains.txt: {e}")

    
    if os.path.exists("malicious_hashes.csv"):
        try:
            with open("malicious_hashes.csv", "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                next(reader, None)  # skip header
                for row in reader:
                    if len(row) >= 3:
                        h = row[0]
                        sources = set(row[2].split("|"))
                        historical_hash_map[h] = sources
            log.info(f"Loaded {len(historical_hash_map)} historical hashes")
        except Exception as e:
            log.error(f"Failed to load malicious_hashes.csv: {e}")

    
    if os.path.exists("malicious_urls.txt"):
        try:
            with open("malicious_urls.txt", "r", encoding="utf-8") as f:
                for line in f:
                    u = line.strip()
                    if u and not u.startswith("#"):
                        historical_url_map.add(u)
            log.info(f"Loaded {len(historical_url_map)} historical URLs")
        except Exception as e:
            log.error(f"Failed to load malicious_urls.txt: {e}")

    # ── Fetch IPs
    ip_sources = {}
    failed = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_feed, name, url): name for name, url in FEEDS.items()}
        for future in as_completed(futures):
            name = futures[future]
            ips = future.result()
            if ips:
                ip_sources[name] = ips
            else:
                failed.append(name)

    # ── Merge IPs (use sets to prevent duplicate source names from CIDR+direct overlap)
    ip_map = historical_ip_map.copy()
    for src, ips in ip_sources.items():
        for ip in ips:
            if ip not in ip_map: ip_map[ip] = set()
            ip_map[ip].add(src)
            
    sorted_ips = sorted(ip_map.keys(), key=numerical_ip_key)

    # ── Fetch Domains
    domain_map = historical_domain_map.copy()
    for name, url in DOMAIN_FEEDS.items():
        domains = fetch_domain_feed(name, url)
        domain_map.update(domains)

    # ── Fetch Hashes
    hash_sources = {}
    # Load historical hashes into hash_sources
    for h, sources in historical_hash_map.items():
        for src in sources:
            if src not in hash_sources: hash_sources[src] = set()
            hash_sources[src].add(h)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_hash_feed, name, url): name for name, url in HASH_FEEDS.items()}
        for future in as_completed(futures):
            name = futures[future]
            hashes = future.result()
            if hashes:
                hash_sources[name] = hashes
                log.info(f"Hash feed {name}: {len(hashes)} hashes")
            else:
                failed.append(name)

    # ── Fetch URLs
    url_sources = {}
    if historical_url_map:
        url_sources["historical"] = historical_url_map.copy()
        
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_url_feed, name, url): name for name, url in URL_FEEDS.items()}
        for future in as_completed(futures):
            name = futures[future]
            fetched_urls = future.result()
            if fetched_urls:
                url_sources[name] = fetched_urls
                log.info(f"URL feed {name}: {len(fetched_urls)} URLs")
            else:
                failed.append(name)

    # ── Fetch ThreatFox (multi-IOC: IPs + domains + hashes + URLs)
    for name, url in THREATFOX_FEEDS.items():
        tf = fetch_threatfox(name, url)
        # Merge ThreatFox IPs into ip_sources
        if tf["ips"]:
            ip_sources[name] = tf["ips"]
            for ip in tf["ips"]:
                if ip not in ip_map: ip_map[ip] = set()
                ip_map[ip].add(name)
        # Merge ThreatFox domains
        domain_map.update(tf["domains"])
        # Merge ThreatFox hashes
        if tf["hashes"]:
            hash_sources[name] = tf["hashes"]
        # Merge ThreatFox URLs
        if tf["urls"]:
            url_sources[name] = tf["urls"]

    # Re-sort IPs after ThreatFox merge
    sorted_ips = sorted(ip_map.keys(), key=numerical_ip_key)

    # ── Write hash and URL outputs
    all_hashes = write_hashes(hash_sources)
    all_urls = write_urls(url_sources)

    # ── Outputs
    stats = build_stats(ip_map, ip_sources, failed, ts, domain_map, all_hashes, all_urls)
    with open("stats.json", "w", encoding="utf-8") as f: json.dump(stats, f, indent=2)
    
    with open("malicious_ips.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted_ips) + "\n")
        
    with open("malicious_domains.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(list(domain_map))) + "\n")
        
    write_csv(sorted_ips, ip_map, geoip)
    write_stix(sorted_ips, ip_map, domain_map, all_hashes, all_urls)
    write_ip_prefixes(sorted_ips)
    write_history(stats)
    
    log.info(f"Done. Total IOC: {stats['total_ioc_count']} ({len(ip_map)} IPs, {len(domain_map)} domains, {len(all_hashes)} hashes, {len(all_urls)} URLs)")

if __name__ == "__main__":
    main()
