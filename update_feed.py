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
    "charles_haley_malware_ips": "https://raw.githubusercontent.com/Ultimate-Hosts-Blacklist/Ultimate.Hosts.Blacklist/master/ips/ips0.list",
    "criticalpath_security": "https://raw.githubusercontent.com/CriticalPathSecurity/Public-Intelligence-Feeds/master/compromised-ips.txt",
    "alienvault_reputation": "http://reputation.alienvault.com/reputation.data",
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
    "charles_haley_malware_ips": "Malware",
    "criticalpath_security": "Compromised",
    "alienvault_reputation": "Mixed",
    "abuseipdb": "Malicious",
}

DOMAIN_FEEDS: Dict[str, str] = {
    "openphish": "https://openphish.com/feed.txt",
    "urlhaus": "https://urlhaus.abuse.ch/downloads/text_online/",
}

ABUSEIPDB_API_KEY: Optional[str] = os.environ.get("ABUSEIPDB_API_KEY")
if ABUSEIPDB_API_KEY:
    FEEDS["abuseipdb"] = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=90"

REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_DELAY = 5
MAX_WORKERS = 8

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
                resp = requests.get(url, stream=True, timeout=60)
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
def is_public_ipv4(ip: str) -> bool:
    return bool(_IPV4_PATTERN.match(ip)) and not bool(_PRIVATE_PATTERN.match(ip))

def extract_domain(text: str) -> Optional[str]:
    text = text.strip()
    if text.startswith("http://") or text.startswith("https://"):
        try:
            parsed = urllib.parse.urlparse(text)
            text = parsed.hostname or ""
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
            r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, stream=True)
            r.raise_for_status()
            
            if name == "abuseipdb":
                data = r.json()
                return {d["ipAddress"] for d in data.get("data", []) if is_public_ipv4(d["ipAddress"])}
            
            if r.encoding is None:
                r.encoding = 'utf-8'
                
            ips = set()
            for line in r.iter_lines(decode_unicode=True):
                if not line: continue
                line = line.strip()
                if not line or line.startswith(("#", "//", "!", "/*")): continue
                token = line.split()[0].split(",")[0].strip('"\';')
                
                if "/" in token:
                    try:
                        network = ipaddress.ip_network(token, strict=False)
                        if network.prefixlen >= 24:
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
            r = requests.get(url, timeout=REQUEST_TIMEOUT, stream=True)
            r.raise_for_status()
            if r.encoding is None:
                r.encoding = 'utf-8'
                
            domains = set()
            for line in r.iter_lines(decode_unicode=True):
                if not line: continue
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

def build_stats(ip_map, ip_sources, failed, ts, domains):
    ips_per_source = {src: sum(1 for src_list in ip_map.values() if src in src_list) for src in ip_sources}
    multi_source = sum(1 for src_list in ip_map.values() if len(src_list) > 1)
    
    return {
        "last_updated": ts,
        "total_unique_ips": len(ip_map),
        "total_unique_domains": len(domains),
        "total_feeds_processed": len(ip_sources),
        "total_feeds_failed": len(failed),
        "multi_source_ips": multi_source,
        "failed_feeds": failed,
        "ips_per_source": ips_per_source,
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
        writer.writerow(["ip", "sources", "source_count", "reputation", "categories", "country", "asn"])
        
        for ip in sorted_ips:
            sources = ip_map[ip]
            source_count = len(sources)
            reputation = min(100, source_count * 20)
            categories = list(set([FEED_CATEGORIES.get(s, "Mixed") for s in sources]))
            country, asn, isp = geoip.lookup(ip)
            
            row = [ip, "|".join(sources), source_count, reputation, "|".join(categories), country, asn]
            writer.writerow(row)
            
            heap_key = (reputation, source_count, ip)
            row_dict = {
                "ip": ip,
                "sources": row[1],
                "source_count": source_count,
                "reputation": reputation,
                "categories": row[4],
                "country": country,
                "asn": asn
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

def write_stix(sorted_ips: List[str], ip_map: Dict[str, List[str]]):
    # Only export critical confidence (reputation >= 80) to keep file size well under 100MB limit
    high_conf = [ip for ip in sorted_ips if min(100, len(ip_map[ip]) * 20) >= 80]
    
    objects = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    for ip in high_conf:
        objects.append({
            "type": "indicator",
            "spec_version": "2.1",
            "id": f"indicator--{uuid.uuid4()}",
            "created": ts,
            "modified": ts,
            "name": f"Malicious IP {ip}",
            "pattern": f"[ipv4-addr:value = '{ip}']",
            "pattern_type": "stix",
            "valid_from": ts
        })
        
    bundle = {
        "type": "bundle",
        "id": f"bundle--{uuid.uuid4()}",
        "objects": objects
    }
    
    with open("stix2_feed.json", "w") as f:
        json.dump(bundle, f)
    log.info(f"Wrote stix2_feed.json with {len(high_conf)} indicators")

def write_bloom(sorted_ips: List[str]):
    # Simple hash-based bloom filter substitute for frontend
    # Since we use JS, we just hash the IPs and store in a bit array encoded as hex
    # For a few hundred thousand IPs, a flat JSON array of prefixes is very small
    # Actually, the simplest high-performance frontend filter is to build a compressed trie or just a prefix dict.
    # Let's write the first two octets of all IPs as keys.
    prefixes = {}
    for ip in sorted_ips:
        parts = ip.split('.')
        prefix = f"{parts[0]}.{parts[1]}"
        prefixes[prefix] = 1
        
    with open("bloom.json", "w") as f:
        json.dump(list(prefixes.keys()), f)
    log.info("Wrote bloom.json filter")

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
    
    entry = {
        "date": current_date,
        "total_unique_ips": stats["total_unique_ips"],
        "active_feeds": stats["total_feeds_processed"]
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
    log.info("  HimalayaFeed v2 — Advanced Threat Aggregator")
    log.info("═" * 55)

    geoip = GeoIPEngine()
    geoip.load()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
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

    # ── Merge IPs
    ip_map = {}
    for src, ips in ip_sources.items():
        for ip in ips:
            if ip not in ip_map: ip_map[ip] = []
            ip_map[ip].append(src)
            
    sorted_ips = sorted(ip_map.keys(), key=numerical_ip_key)

    # ── Fetch Domains
    domain_map = set()
    for name, url in DOMAIN_FEEDS.items():
        domains = fetch_domain_feed(name, url)
        domain_map.update(domains)

    # ── Outputs
    stats = build_stats(ip_map, ip_sources, failed, ts, domain_map)
    with open("stats.json", "w") as f: json.dump(stats, f, indent=2)
    
    with open("malicious_ips.txt", "w") as f:
        f.write("\n".join(sorted_ips) + "\n")
        
    with open("malicious_domains.txt", "w") as f:
        f.write("\n".join(sorted(list(domain_map))) + "\n")
        
    write_csv(sorted_ips, ip_map, geoip)
    write_stix(sorted_ips, ip_map)
    write_bloom(sorted_ips)
    write_history(stats)
    
    log.info("Done.")

if __name__ == "__main__":
    main()
