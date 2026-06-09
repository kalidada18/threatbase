#!/usr/bin/env python3
"""
HimalayaFeed — Threat Intelligence Feed Aggregator (v3)
=====================================================
Collects malicious IPv4 addresses, Domains, Hashes, and URLs from public feeds,
enriches IPs with GeoIP data, and outputs CSV, JSON, TXT, and STIX 2.1 formats.

Optimized for speed: all feeds fetched in parallel, single-pass GeoIP sweep.
"""

import bisect
import gzip
import heapq
import ipaddress
import json
import logging
import os
import re
import time
import uuid
import zipfile
import glob
import io
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
    "ipsum": "https://raw.githubusercontent.com/stamparm/ipsum/master/levels/1.txt",
    "firehol_level1": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset",
    "firehol_level2": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level2.netset",
    "firehol_level3": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level3.netset",
    "cins_army": "https://cinsscore.com/list/ci-badguys.txt",
    "emerging_threats": "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    "blocklist_de": "https://lists.blocklist.de/lists/all.txt",
    "binary_defense": "https://binarydefense.com/banlist.txt",
    "greensnow": "https://blocklist.greensnow.co/greensnow.txt",
    "spamhaus_drop": "https://www.spamhaus.org/drop/drop.txt",
    "spamhaus_edrop": "https://www.spamhaus.org/drop/edrop.txt",
    "dshield_blocklist": "https://feeds.dshield.org/block.txt",
    "criticalpath_security": "https://raw.githubusercontent.com/CriticalPathSecurity/Public-Intelligence-Feeds/master/compromised-ips.txt",

    "bruteforceblocker": "https://danger.rulez.sk/projects/bruteforceblocker/blist.php",
    "botvrij": "https://www.botvrij.eu/data/misp.text_ip-dst.ADMIN.txt",
    "dan_tor": "https://www.dan.me.uk/torlist/?full",
    "tor_bulk_exit": "https://check.torproject.org/torbulkexitlist",
    "romainmarcoux_outgoing_40k": "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-40k.txt",
    "romainmarcoux_outgoing_aa": "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-aa.txt",
    "romainmarcoux_outgoing_ab": "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-ab.txt",
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
    "abuseipdb": "Malicious",
    "bruteforceblocker": "Brute-Force",
    "botvrij": "Mixed",
    "threatfox_recent": "Mixed",
    "dan_tor": "Tor",
    "tor_bulk_exit": "Tor",
    "romainmarcoux_outgoing_40k": "Malicious",
    "romainmarcoux_outgoing_aa": "Malicious",
    "romainmarcoux_outgoing_ab": "Malicious",
}

DOMAIN_FEEDS: Dict[str, str] = {
    "openphish": "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
    "urlhaus": "https://urlhaus.abuse.ch/downloads/text_online/",
    "romainmarcoux": "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/refs/heads/main/full-domains-aa.txt",
    "hagezi_ultimate": "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/ultimate.txt",
    "stevenblack_hosts": "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "blocklist_malware": "https://blocklistproject.github.io/Lists/malware.txt",
    "blocklist_torrent": "https://blocklistproject.github.io/Lists/torrent.txt",
    "blocklist_fraud": "https://blocklistproject.github.io/Lists/fraud.txt",
    "blocklist_phishing": "https://blocklistproject.github.io/Lists/phishing.txt",
}

HASH_FEEDS: Dict[str, str] = {
    "malwarebazaar_recent": "https://bazaar.abuse.ch/export/txt/sha256/recent/",
    "malwarebazaar_full": "https://bazaar.abuse.ch/export/txt/sha256/full/",
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
    FEEDS["abuseipdb"] = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=70"



REQUEST_TIMEOUT = (5, 10)
MAX_WORKERS = 12  # Increased — all feed types now share one pool


def get_session():
    session = requests.Session()
    retry = Retry(
        total=3, read=3, connect=3,
        backoff_factor=1.0,
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
_HASH_PATTERN = re.compile(r'^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$')
_URL_PATTERN = re.compile(r'^https?://.+')



# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def is_valid_ipv6(ip: str) -> bool:
    if ":" not in ip:
        return False
    try:
        ip_obj = ipaddress.IPv6Address(ip)
        if (ip_obj.is_private or ip_obj.is_multicast or ip_obj.is_loopback or 
            ip_obj.is_link_local or ip_obj.is_reserved or ip_obj.is_unspecified):
            return False
        return True
    except Exception:
        return False

def is_valid_ipv4(ip: str) -> bool:
    parts = ip.split('.')
    if len(parts) != 4:
        return False
    try:
        ip_obj = ipaddress.IPv4Address(ip)
        if (ip_obj.is_private or 
            ip_obj.is_multicast or 
            ip_obj.is_loopback or 
            ip_obj.is_link_local or 
            ip_obj.is_reserved or 
            ip_obj.is_unspecified):
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
    result = {"ips": set(), "ipv6": set(), "cidrs": set(), "domains": set(), "hashes": set(), "urls": set()}
    if not os.path.exists(filename):
        return result
    try:
        with open(filename, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith(('#', '//')):
                    continue
                if is_valid_ipv4(line):
                    result["ips"].add(line)
                elif _HASH_PATTERN.match(line.lower()):
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


def load_existing_iocs() -> dict:
    """Load historical IOCs so the feed keeps past items forever and only grows."""
    result = {"ips": set(), "ipv6": set(), "cidrs": set(), "domains": set(), "hashes": set(), "urls": set()}
    
    file_map = {
        "ioc/malicious_ips.txt": "ips",
        "ioc/malicious_ipv6.txt": "ipv6",
        "ioc/malicious_cidrs.txt": "cidrs",
        "ioc/malicious_domains.txt": "domains",
        "ioc/malicious_hashes.txt": "hashes",
        "ioc/malicious_urls.txt": "urls"
    }
    
    for filepath, key in file_map.items():
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(('#', '//')):
                            continue
                        result[key].add(line)
            except Exception as e:
                log.error(f"Failed to load existing IOCs from {filepath}: {e}")
                
    log.info(f"Loaded existing IOCs: {len(result['ips'])} IPs, {len(result['ipv6'])} IPv6, {len(result['cidrs'])} CIDRs, {len(result['domains'])} domains, {len(result['hashes'])} hashes, {len(result['urls'])} URLs")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Feed Fetchers
# ─────────────────────────────────────────────────────────────────────────────
def fetch_feed(name: str, url: str) -> dict:
    headers = {"User-Agent": "HimalayaFeed-Aggregator/3.0"}
    
    if name == "abuseipdb":
        if ABUSEIPDB_API_KEY:
            headers["Key"] = ABUSEIPDB_API_KEY
        else:
            return {'ipv4': set(), 'ipv6': set(), 'cidrs': set()}
            
        cache_file = ".abuseipdb_cache.txt"
        if os.path.exists(cache_file):
            if time.time() - os.path.getmtime(cache_file) < 86400:
                log.info(f"  ✓ {name}: Loading from local cache (under 24h old)")
                try:
                    with open(cache_file, "r") as f:
                        ips = {line.strip() for line in f if line.strip()}
                    return {'ipv4': ips, 'ipv6': set(), 'cidrs': set()}
                except Exception as e:
                    log.warning(f"Failed to read abuseipdb cache: {e}")

    try:
        r = global_session.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()

        if name == "abuseipdb":
            data = r.json()
            ips = {d["ipAddress"] for d in data.get("data", []) if is_valid_ipv4(d["ipAddress"])}
            try:
                with open(".abuseipdb_cache.txt", "w") as f:
                    for ip in ips:
                        f.write(ip + "\n")
            except Exception as e:
                log.warning(f"Failed to write abuseipdb cache: {e}")
            log.info(f"  ✓ {name}: {len(ips)} IPs (Saved to cache)")
            return {'ipv4': ips, 'ipv6': set(), 'cidrs': set()}

        ips = set()
        ipv6s = set()
        cidrs = set()
        raw_lines = 0
        for line in r.text.splitlines():
            line = line.strip()
            if not line or line.startswith(("#", "//", "!", "/*")):
                continue
            raw_lines += 1
            token = line.split()[0].split(",")[0].strip("\"';")

            if "/" in token:
                try:
                    network = ipaddress.ip_network(token, strict=False)
                    if network.version == 4:
                        if network.prefixlen >= 24:
                            for ip in network.hosts():
                                ip_str = str(ip)
                                if is_valid_ipv4(ip_str):
                                    ips.add(ip_str)
                        else:
                            cidrs.add(token)
                    elif network.version == 6:
                        cidrs.add(token)
                except ValueError:
                    pass
            elif is_valid_ipv4(token):
                ips.add(token)
            elif is_valid_ipv6(token):
                ipv6s.add(token)

        if name == "greensnow":
            duplicates = raw_lines - len(ips)
            log.info(f"  ✓ {name}: {len(ips)} IPs (Removed {duplicates} duplicate/invalid entries from source)")
        else:
            log.info(f"  ✓ {name}: {len(ips)} IPs")
        return {'ipv4': ips, 'ipv6': ipv6s, 'cidrs': cidrs}
    except Exception as e:
        log.error(f"  ✗ Feed {name} failed: {e}")
    return {'ipv4': set(), 'ipv6': set(), 'cidrs': set()}





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
                candidate = line
                if candidate.startswith("0.0.0.0 ") or candidate.startswith("127.0.0.1 "):
                    candidate = candidate.split(maxsplit=1)[1]
                domain = extract_domain(candidate)
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
        # Increased timeout for large feeds like the full hash list
        r = global_session.get(url, timeout=60,
                               headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
        r.raise_for_status()
        hashes = set()
        
        content_type = r.headers.get('Content-Type', '')
        if 'application/zip' in content_type or url.endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                for filename in z.namelist():
                    if filename.endswith('.txt') or filename.endswith('.csv'):
                        with z.open(filename) as f:
                            for line_bytes in f:
                                line = line_bytes.decode('utf-8', errors='ignore').strip()
                                if not line or line.startswith(('#', '//', '"')):
                                    continue
                                token = line.split()[0].split(',')[0].strip('"\';\r\n')
                                if _SHA256_PATTERN.match(token):
                                    hashes.add(token.lower())
        else:
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
    result = {"ips": set(), "ipv6": set(), "cidrs": set(), "domains": set(), "hashes": set(), "urls": set()}
    try:
        r = global_session.get(url, timeout=60,
                               headers={"User-Agent": "HimalayaFeed-Aggregator/3.0"})
        r.raise_for_status()
        data = r.json()
        entries = data.get("data", data)
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
                if is_valid_ipv4(ip_part):
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


def write_hashes(hash_map: Dict[str, Set[str]]) -> set:
    """Write malicious_hashes.txt."""
    hash_sources = {}  # hash -> set of source names
    for src, hashes in hash_map.items():
        for h in hashes:
            if h not in hash_sources:
                hash_sources[h] = set()
            hash_sources[h].add(src)

    all_hashes = sorted(hash_sources.keys())

    # Write TXT
    with open("ioc/malicious_hashes.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        timestamp = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
        f.write("# HimalayaFeed Threat Intelligence Feed - Hashes\n")
        f.write("# (https://github.com/kalidada18/himalayafeed)\n")
        f.write("#\n")
        f.write(f"# Last update: {timestamp}\n")
        f.write("#\n")
        for h in all_hashes:
            f.write(h)
            f.write('\n')

    log.info(f"  Wrote malicious_hashes.txt ({len(all_hashes)} hashes)")
    return all_hashes


def write_urls(url_map: Dict[str, Set[str]]) -> set:
    """Write malicious_urls.txt."""
    all_urls = sorted(set(u for urls in url_map.values() for u in urls))

    with open("ioc/malicious_urls.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        timestamp = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
        f.write("# HimalayaFeed Threat Intelligence Feed - URLs\n")
        f.write("# (https://github.com/kalidada18/himalayafeed)\n")
        f.write("#\n")
        f.write(f"# Last update: {timestamp}\n")
        f.write("#\n")
        for u in all_urls:
            f.write(u)
            f.write('\n')

    log.info(f"  Wrote malicious_urls.txt ({len(all_urls)} URLs)")
    return all_urls


def build_stats(ip_map, ip_sources, failed, ts, domain_map, hashes=None, urls=None, ipv6_map=None, cidr_map=None):
    hashes = hashes or set()
    urls = urls or set()
    ipv6_map = ipv6_map or {}
    cidr_map = cidr_map or {}

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
        "total_unique_ipv6": len(ipv6_map),
        "total_unique_cidrs": len(cidr_map),
        "total_unique_domains": len(domain_map),
        "total_unique_hashes": len(hashes),
        "total_unique_urls": len(urls),
        "total_ioc_count": len(ip_map) + len(ipv6_map) + len(cidr_map) + len(domain_map) + len(hashes) + len(urls),
        "total_feeds_processed": len(ip_sources),
        "total_feeds_failed": len(failed),
        "multi_source_ips": multi_source,
        "failed_feeds": failed,
        "ips_per_source": ips_per_source,
        "category_counts": category_counts,
    }


def write_history(stats: dict) -> None:
    history_file = "ioc/history.json"
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
        "total_unique_ipv6": stats.get("total_unique_ipv6", 0),
        "total_unique_cidrs": stats.get("total_unique_cidrs", 0),
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


    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Load Custom IOCs and Existing IOCs (Cumulative feature)
    custom_iocs = load_custom_iocs()
    existing_iocs = load_existing_iocs()

    # ── Fetch ALL feeds in parallel ──────────────────────────────────────────
    log.info("Fetching all feeds in parallel...")
    t0 = time.time()

    ip_sources = {}
    ipv6_sources = {}
    cidr_sources = {}
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
                        ip_sources[name] = result.get('ipv4', set())
                        ipv6_sources[name] = result.get('ipv6', set())
                        cidr_sources[name] = result.get('cidrs', set())
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

    # Start with custom IOCs and existing historical IOCs
    ip_map: Dict[str, set] = {ip: {"custom_iocs.txt"} for ip in custom_iocs["ips"]}
    for ip in existing_iocs["ips"]:
        if ip not in ip_map:
            ip_map[ip] = set()
        ip_map[ip].add("historical")
        
    for src, ips in ip_sources.items():
        for ip in ips:
            if ip not in ip_map:
                ip_map[ip] = set()
            ip_map[ip].add(src)

    # ── Merge Domains
    domain_map: Dict[str, set] = {d: {"custom_iocs.txt"} for d in custom_iocs["domains"]}
    for d in existing_iocs["domains"]:
        if d not in domain_map:
            domain_map[d] = set()
        domain_map[d].add("historical")
        
    for src, domains in domain_results.items():
        for d in domains:
            if d not in domain_map:
                domain_map[d] = set()
            domain_map[d].add(src)

    # ── Merge IPv6 & CIDR
    ipv6_map: Dict[str, set] = {ip: {"historical"} for ip in existing_iocs["ipv6"]}
    for src, ips in ipv6_sources.items():
        for ip in ips:
            if ip not in ipv6_map:
                ipv6_map[ip] = set()
            ipv6_map[ip].add(src)
            
    cidr_map: Dict[str, set] = {c: {"historical"} for c in existing_iocs["cidrs"]}
    for src, cidrs in cidr_sources.items():
        for c in cidrs:
            if c not in cidr_map:
                cidr_map[c] = set()
            cidr_map[c].add(src)

    # ── Merge ThreatFox results into all categories
    for name, tf in tf_results.items():
        if tf["ips"]:
            ip_sources[name] = tf["ips"]
            for ip in tf["ips"]:
                if ip not in ip_map:
                    ip_map[ip] = set()
                ip_map[ip].add(name)
        for d in tf["domains"]:
            if d not in domain_map:
                domain_map[d] = set()
            domain_map[d].add(name)
        if tf["hashes"]:
            hash_sources[name] = hash_sources.get(name, set()) | tf["hashes"]
        if tf["urls"]:
            url_sources[name] = url_sources.get(name, set()) | tf["urls"]



    # Add custom hashes/URLs and historical ones
    if custom_iocs["hashes"]:
        hash_sources["custom_iocs.txt"] = custom_iocs["hashes"]
    if existing_iocs["hashes"]:
        hash_sources["historical"] = existing_iocs["hashes"]
        
    if custom_iocs["urls"]:
        url_sources["custom_iocs.txt"] = custom_iocs["urls"]
    if existing_iocs["urls"]:
        url_sources["historical"] = existing_iocs["urls"]

    # Sort IPs once
    sorted_ips = sorted(ip_map.keys(), key=numerical_ip_key)
    log.info(f"Merged in {time.time()-t0:.1f}s — {len(ip_map)} IPs, {len(domain_map)} domains")

    # ── Write outputs ────────────────────────────────────────────────────────
    log.info("Writing output files...")
    t0 = time.time()

    all_hashes = write_hashes(hash_sources)
    all_urls = write_urls(url_sources)

    stats = build_stats(ip_map, ip_sources, failed, ts, domain_map, all_hashes, all_urls, ipv6_map, cidr_map)
    os.makedirs("ioc", exist_ok=True)
    with open("ioc/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    # Plain text IP list
    with open("ioc/malicious_ips.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        timestamp = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
        f.write("# HimalayaFeed Threat Intelligence Feed - IPs\n")
        f.write("# (https://github.com/kalidada18/himalayafeed)\n")
        f.write("# Format: IP\n")
        f.write("#\n")
        f.write(f"# Last update: {timestamp}\n")
        f.write("#\n")
        for ip in sorted_ips:
            f.write(f"{ip}\n")

    # Plain text domain list
    sorted_domains = sorted(domain_map.keys())
    with open("ioc/malicious_domains.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        timestamp = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
        f.write("# HimalayaFeed Threat Intelligence Feed - Domains\n")
        f.write("# (https://github.com/kalidada18/himalayafeed)\n")
        f.write("#\n")
        f.write(f"# Last update: {timestamp}\n")
        f.write("#\n")
        for d in sorted_domains:
            f.write(d)
            f.write('\n')

    # Write IPv6
    sorted_ipv6 = sorted(ipv6_map.keys())
    with open("ioc/malicious_ipv6.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        f.write("# HimalayaFeed Threat Intelligence Feed - IPv6\n")
        f.write(f"# Last update: {timestamp}\n")
        for ip in sorted_ipv6:
            f.write(ip + '\n')
            
    # Write CIDRs
    sorted_cidrs = sorted(cidr_map.keys())
    with open("ioc/malicious_cidrs.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        f.write("# HimalayaFeed Threat Intelligence Feed - CIDRs\n")
        f.write(f"# Last update: {timestamp}\n")
        for c in sorted_cidrs:
            f.write(c + '\n')

            
    write_history(stats)

    elapsed = time.time() - t_start
    log.info(f"═" * 55)
    log.info(f"  Done in {elapsed:.1f}s — {stats['total_ioc_count']} IOCs "
             f"({len(ip_map)} IPs, {len(domain_map)} domains, "
             f"{len(all_hashes)} hashes, {len(all_urls)} URLs)")
    log.info(f"═" * 55)


if __name__ == "__main__":
    main()
