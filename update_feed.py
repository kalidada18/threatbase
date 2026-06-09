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
import concurrent.futures
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
    "ipsum_level2": "https://raw.githubusercontent.com/stamparm/ipsum/master/levels/2.txt",
    "ipsum_level3": "https://raw.githubusercontent.com/stamparm/ipsum/master/levels/3.txt",
    "ipsum_level4": "https://raw.githubusercontent.com/stamparm/ipsum/master/levels/4.txt",
    "ipsum_level5": "https://raw.githubusercontent.com/stamparm/ipsum/master/levels/5.txt",
    "blackbook": "https://raw.githubusercontent.com/stamparm/blackbook/master/blackbook.txt",
    "firehol_level1": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset",
    "firehol_level2": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level2.netset",
    "firehol_level3": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level3.netset",
    "cins_army": "https://cinsscore.com/list/ci-badguys.txt",
    "emerging_threats": "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    "emerging_threats_fwrules": "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt",
    "blocklist_de": "https://lists.blocklist.de/lists/all.txt",
    "blocklist_de_ssh": "https://lists.blocklist.de/lists/ssh.txt",
    "blocklist_de_mail": "https://lists.blocklist.de/lists/mail.txt",
    "blocklist_de_apache": "https://lists.blocklist.de/lists/apache.txt",
    "binary_defense": "https://www.binarydefense.com/banlist.txt",
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
    "ipsum_level2": "Mixed",
    "ipsum_level3": "Mixed",
    "ipsum_level4": "Mixed",
    "ipsum_level5": "Mixed",
    "blackbook": "Mixed",
    "firehol_level1": "Mixed",
    "firehol_level2": "Mixed",
    "firehol_level3": "Mixed",
    "cins_army": "Compromised",
    "emerging_threats": "Compromised",
    "emerging_threats_fwrules": "Malicious",
    "blocklist_de": "Brute-Force",
    "blocklist_de_ssh": "Brute-Force",
    "blocklist_de_mail": "Spam",
    "blocklist_de_apache": "Exploit",
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
        status_forcelist=(429, 500, 502, 503, 504)
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
            headers["Accept"] = "application/json"
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


def write_hashes(hash_sources: Dict[str, Set[str]]) -> set:
    """Write malicious_hashes.txt."""
    all_hashes = sorted(set(h for hashes in hash_sources.values() for h in hashes))

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


def build_stats(ip_count, ip_sources, failed, ts, all_domains, hashes=None, urls=None, all_ipv6=None, all_cidrs=None, custom_iocs=None, existing_iocs=None):
    hashes = hashes or set()
    urls = urls or set()
    all_ipv6 = all_ipv6 or set()
    all_cidrs = all_cidrs or set()
    custom_iocs = custom_iocs or {}
    existing_iocs = existing_iocs or {}

    ips_per_source = {src: len(ips) for src, ips in ip_sources.items()}
    multi_source = sum(1 for count in ip_count.values() if count > 1)
    category_counts = {}

    for src, ips in ip_sources.items():
        cat = FEED_CATEGORIES.get(src, "Mixed")
        category_counts[cat] = category_counts.get(cat, 0) + len(ips)
        
    cat = FEED_CATEGORIES.get("historical", "Mixed")
    category_counts[cat] = category_counts.get(cat, 0) + len(existing_iocs.get("ips", set()))
    
    cat = FEED_CATEGORIES.get("custom_iocs.txt", "Mixed")
    category_counts[cat] = category_counts.get(cat, 0) + len(custom_iocs.get("ips", set()))

    return {
        "last_updated": ts,
        "total_unique_ips": len(ip_count),
        "total_unique_ipv6": len(all_ipv6),
        "total_unique_cidrs": len(all_cidrs),
        "total_unique_domains": len(all_domains),
        "total_unique_hashes": len(hashes),
        "total_unique_urls": len(urls),
        "total_ioc_count": len(ip_count) + len(all_ipv6) + len(all_cidrs) + len(all_domains) + len(hashes) + len(urls),
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

    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
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

    pending = set(all_futures.keys())
    max_waits = 6
    waits = 0
    while pending and waits < max_waits:
        done, pending = concurrent.futures.wait(pending, timeout=10)
        for future in done:
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
        
        if pending:
            hanging = [all_futures[f][1] for f in pending]
            log.warning(f"Still waiting on {len(pending)} feeds: {hanging}")
            import sys; sys.stderr.flush()
            waits += 1

    if pending:
        hanging = [all_futures[f][1] for f in pending]
        log.error(f"Abandoning {len(pending)} feeds that hung for over 60s: {hanging}")
        for f in pending:
            failed.append(all_futures[f][1])

    executor.shutdown(wait=False, cancel_futures=True)

    log.info(f"All feeds fetched in {time.time()-t0:.1f}s")
    import sys; sys.stderr.flush()

    # ── Merge IPs ────────────────────────────────────────────────────────────
    log.info("Merging IOCs... (IPs)")
    sys.stderr.flush()
    t0 = time.time()

    from collections import Counter
    ip_count = Counter()
    ip_count.update(custom_iocs["ips"])
    ip_count.update(existing_iocs["ips"])
    for ips in ip_sources.values():
        ip_count.update(ips)

    # ── Merge Domains
    log.info("Merging Domains...")
    sys.stderr.flush()
    all_domains = set()
    all_domains.update(custom_iocs["domains"])
    all_domains.update(existing_iocs["domains"])
    for domains in domain_results.values():
        all_domains.update(domains)

    # ── Merge IPv6 & CIDR
    log.info("Merging IPv6 & CIDRs...")
    sys.stderr.flush()
    all_ipv6 = set()
    all_ipv6.update(existing_iocs["ipv6"])
    for ips in ipv6_sources.values():
        all_ipv6.update(ips)
            
    all_cidrs = set()
    all_cidrs.update(existing_iocs["cidrs"])
    for cidrs in cidr_sources.values():
        all_cidrs.update(cidrs)

    # ── Merge ThreatFox results into all categories
    for name, tf in tf_results.items():
        if tf["ips"]:
            ip_sources[name] = tf["ips"]
            ip_count.update(tf["ips"])
        if tf["domains"]:
            all_domains.update(tf["domains"])
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
    log.info("Sorting IPs...")
    import sys; sys.stderr.flush()
    sorted_ips = sorted(ip_count.keys(), key=numerical_ip_key)
    log.info(f"Merged in {time.time()-t0:.1f}s — {len(ip_count)} IPs, {len(all_domains)} domains")
    sys.stderr.flush()

    # ── Write outputs ────────────────────────────────────────────────────────
    log.info("Writing output files... (Hashes & URLs)")
    sys.stderr.flush()
    t0 = time.time()

    all_hashes = write_hashes(hash_sources)
    all_urls = write_urls(url_sources)

    log.info("Building stats...")
    sys.stderr.flush()
    stats = build_stats(ip_count, ip_sources, failed, ts, all_domains, all_hashes, all_urls, all_ipv6, all_cidrs, custom_iocs, existing_iocs)
    
    log.info("Saving stats.json...")
    sys.stderr.flush()
    os.makedirs("ioc", exist_ok=True)
    with open("ioc/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    # Plain text IP list
    log.info("Saving malicious_ips.txt...")
    sys.stderr.flush()
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
    log.info("Sorting and saving malicious_domains.txt...")
    sys.stderr.flush()
    sorted_domains = sorted(all_domains)
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
    log.info("Sorting and saving malicious_ipv6.txt...")
    sys.stderr.flush()
    sorted_ipv6 = sorted(all_ipv6)
    with open("ioc/malicious_ipv6.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        f.write("# HimalayaFeed Threat Intelligence Feed - IPv6\n")
        f.write(f"# Last update: {timestamp}\n")
        for ip in sorted_ipv6:
            f.write(ip + '\n')
            
    # Write CIDRs
    log.info("Sorting and saving malicious_cidrs.txt...")
    sys.stderr.flush()
    sorted_cidrs = sorted(all_cidrs)
    with open("ioc/malicious_cidrs.txt", "w", encoding="utf-8", buffering=1 << 16) as f:
        f.write("# HimalayaFeed Threat Intelligence Feed - CIDRs\n")
        f.write(f"# Last update: {timestamp}\n")
        for c in sorted_cidrs:
            f.write(c + '\n')

    log.info("Writing history.json...")
    sys.stderr.flush()
    write_history(stats)

    elapsed = time.time() - t_start
    log.info(f"═" * 55)
    log.info(f"  Done in {elapsed:.1f}s — {stats['total_ioc_count']} IOCs "
             f"({len(ip_count)} IPs, {len(all_domains)} domains, "
             f"{len(all_hashes)} hashes, {len(all_urls)} URLs)")
    log.info(f"═" * 55)
    os._exit(0)


if __name__ == "__main__":
    main()
