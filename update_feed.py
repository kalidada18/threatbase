#!/usr/bin/env python3
"""
Threatbase — Threat Intelligence Feed Aggregator (v5)
=====================================================
Collects malicious IPv4 addresses, Domains, Hashes, and URLs from public feeds.
Highly optimized: fully asynchronous I/O with streaming, C-level fast IP validation.
Outputs CSV, JSON, TXT.

Writes to ioc/ folder:
  - threatbase-ip.txt       (sorted by IP, CSV: IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen)
  - top_ips.json            (top 100 IPs by feed corroboration, powers /hall-of-shame)
  - threatbase-ip.json      (detailed JSON with tags and sources)
  - threatbase-ipv6.txt     (sorted)
  - threatbase-cidr.txt     (sorted)
  - threatbase-domain.txt   (sorted; also split into -NN chunks, see below)
  - threatbase-hash.txt     (sorted; also split into -NN chunks, see below)
  - threatbase-url.txt      (sorted)
  - stats.json              (summary counts + last_updated + chunk layout)
  - manifest.json           (chunk layout for third-party consumers)
  - history.json            (daily snapshots for trend charts)

The domain and hash feeds are additionally written as threatbase-domain-01.txt,
-02.txt, … chunks of at most CHUNK_TARGET_BYTES each. The chunks are what gets
committed to git; the unsplit files are git-ignored and ship as GitHub Release
assets. See the comment above write_chunked_feed for why.
"""

import asyncio
import io
import json
import logging
import csv
import os
import re
import socket
import sys
import time
import zipfile
import bisect
import gzip
from collections import defaultdict, Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

import aiohttp
import ipaddress
from datetime import date, datetime, timedelta, timezone

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
    "blackbook": "https://raw.githubusercontent.com/stamparm/blackbook/master/blackbook.txt",
    "firehol_level1": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset",
    "firehol_level2": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level2.netset",
    "cins_army": "https://cinsscore.com/list/ci-badguys.txt",
    "emerging_threats": "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    "emerging_threats_fwrules": "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt",
    "blocklist_de": "https://lists.blocklist.de/lists/all.txt",
    "blocklist_de_ssh": "https://lists.blocklist.de/lists/ssh.txt",
    "blocklist_de_mail": "https://lists.blocklist.de/lists/mail.txt",
    "blocklist_de_apache": "https://lists.blocklist.de/lists/apache.txt",
    "binary_defense": "https://binarydefense.com/banlist.txt",
    "greensnow": "https://blocklist.greensnow.co/greensnow.txt",
    "spamhaus_drop": "https://www.spamhaus.org/drop/drop.txt",
    "spamhaus_edrop": "https://www.spamhaus.org/drop/edrop.txt",
    "spamhaus_dropv6": "https://www.spamhaus.org/drop/dropv6.txt",
    "dshield_blocklist": "https://feeds.dshield.org/block.txt",
    "criticalpath_security": "https://raw.githubusercontent.com/CriticalPathSecurity/Public-Intelligence-Feeds/master/compromised-ips.txt",
    "bruteforceblocker": "https://danger.rulez.sk/projects/bruteforceblocker/blist.php",
    "botvrij": "https://www.botvrij.eu/data/misp.text_ip-dst.ADMIN.txt",
    "dan_tor": "https://www.dan.me.uk/torlist/?full",
    "tor_bulk_exit": "https://check.torproject.org/torbulkexitlist",
    "romainmarcoux_outgoing_40k": "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-40k.txt",
    "romainmarcoux_outgoing_aa": "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-aa.txt",
    "romainmarcoux_outgoing_ab": "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-ab.txt",
    "alienvault_reputation": "https://reputation.alienvault.com/reputation.data",
    "sslbl_abuse_ch": "https://sslbl.abuse.ch/blacklist/sslipblacklist.txt",
    "stopforumspam_toxic": "https://www.stopforumspam.com/downloads/toxic_ip_cidr.txt",
    "firehol_level3": "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level3.netset",
    "blocklist_net_bots": "https://lists.blocklist.de/lists/bots.txt",
    "blocklist_net_strongips": "https://lists.blocklist.de/lists/strongips.txt",
    "snort_ip_filter": "https://snort.org/downloads/ip-block-list",
    "dataplane_sipinv": "https://dataplane.org/sipinvitation.txt",
    "dataplane_sshclient": "https://dataplane.org/sshclient.txt",
    "dataplane_sshpwauth": "https://dataplane.org/sshpwauth.txt",
    "dataplane_vncrfb": "https://dataplane.org/vncrfb.txt",
}

FEED_CATEGORIES: Dict[str, str] = {
    "feodo_tracker": "C2",
    "feodo_tracker_aggressive": "C2",
    "bbcan177_ms1": "Malware",
    "ipsum": "Mixed",
    "blackbook": "Mixed",
    "firehol_level1": "Mixed",
    "firehol_level2": "Mixed",
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
    "spamhaus_edrop": "Spam",
    "spamhaus_dropv6": "Spam",
    "dshield_blocklist": "Malware",
    "criticalpath_security": "Compromised",
    "abuseipdb": "Malicious",
    "bruteforceblocker": "Brute-Force",
    "botvrij": "Mixed",
    "threatfox_full": "Mixed",
    "dan_tor": "Tor",
    "tor_bulk_exit": "Tor",
    "romainmarcoux_outgoing_40k": "Malicious",
    "romainmarcoux_outgoing_aa": "Malicious",
    "romainmarcoux_outgoing_ab": "Malicious",
    "alienvault_reputation": "Malicious",
    "sslbl_abuse_ch": "C2",
    "stopforumspam_toxic": "Spam",
    "firehol_level3": "Mixed",
    "blocklist_net_bots": "Botnet",
    "blocklist_net_strongips": "Brute-Force",
    "snort_ip_filter": "Malicious",
    "dataplane_sipinv": "Scanner",
    "dataplane_sshclient": "Scanner",
    "dataplane_sshpwauth": "Brute-Force",
    "dataplane_vncrfb": "Brute-Force",
    "custom": "Malicious",
}

# Filename slugs for category-split IP feeds (ioc/categories/threatbase-ip-<slug>.txt).
# Any category not listed falls back to a lowercased, alphanumeric-only slug.
CATEGORY_SLUGS: Dict[str, str] = {
    "C2": "c2",
    "Botnet": "botnet",
    "Brute-Force": "bruteforce",
    "Tor": "tor",
    "Spam": "spam",
    "Exploit": "exploit",
    "Malware": "malware",
    "Malicious": "malicious",
    "Compromised": "compromised",
    "Scanner": "scanner",
    "Mixed": "mixed",
}

# ── IOC Decay Configuration ────────────────────────────────────────────────
# Indicators not re-observed within the half-life get their risk score
# downgraded one tier. Indicators older than the stale threshold are dropped
# from the feed entirely. This prevents the accumulative database from
# drowning fresh intelligence in noise.
DECAY_HALF_LIFE_DAYS = 90
STALE_THRESHOLD_DAYS = 365

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
    "threatfox_full": "https://threatfox.abuse.ch/export/csv/full/",
}

USER_AGENT: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

# Network resilience: retry transient feed failures so fresh malicious IOCs
# are never silently dropped from a run.
MAX_RETRIES: int = 3
RETRY_BACKOFF: float = 2.0  # seconds, multiplied by attempt number

ABUSEIPDB_API_KEY: Optional[str] = os.environ.get("ABUSEIPDB_API_KEY")
if ABUSEIPDB_API_KEY:
    FEEDS["abuseipdb"] = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=70"

URLHAUS_AUTH_KEY: Optional[str] = os.environ.get("URLHAUS_AUTH_KEY")
if URLHAUS_AUTH_KEY:
    URL_FEEDS["urlhaus_recent"] = f"https://urlhaus-api.abuse.ch/v2/files/exports/{URLHAUS_AUTH_KEY}/recent.csv"

# ─────────────────────────────────────────────────────────────────────────────
# Regex & Whitelist setup
# ─────────────────────────────────────────────────────────────────────────────
_DOMAIN_PATTERN = re.compile(r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$")
_SHA256_PATTERN = re.compile(r'^[a-fA-F0-9]{64}$')
_MD5_PATTERN = re.compile(r'^[a-fA-F0-9]{32}$')
_HASH_PATTERN = re.compile(r'^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$')
_URL_PATTERN = re.compile(r'^https?://.+')

def is_valid_url(url: str) -> bool:
    if not _URL_PATTERN.match(url):
        return False
    if "hooks.slack.com/services/" in url:
        return False
    return True

_WHITELIST_CIDRS = [
    "1.0.0.0/24",       "1.1.1.0/24",       "8.8.8.0/24",       "8.8.4.0/24",
    "9.9.9.0/24",       "9.9.9.10/32",      "149.112.112.0/24", "208.67.222.0/24",
    "208.67.220.0/24",  "4.4.4.4/32",       "4.2.2.0/24",       "94.140.14.0/24",
    "94.140.15.0/24",   "192.195.233.204/32"
]

_WHITELIST_INT_RANGES = []
for cidr in _WHITELIST_CIDRS:
    net = ipaddress.ip_network(cidr)
    _WHITELIST_INT_RANGES.append((int(net.network_address), int(net.broadcast_address)))

_PRIVATE_RANGES = [
    (167772160, 184549375),       # 10.0.0.0/8
    (2886729728, 2887778303),     # 172.16.0.0/12
    (3232235520, 3232301055),     # 192.168.0.0/16
    (2130706432, 2147483647),     # 127.0.0.0/8
    (2851995648, 2852061183),     # 169.254.0.0/16
    (3758096384, 4026531839),     # 224.0.0.0/4
    (4026531840, 4294967295),     # 240.0.0.0/4
    (0, 16777215),                # 0.0.0.0/8
    (1681915904, 1686110207),     # 100.64.0.0/10
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def is_valid_ipv4_fast(ip_str: str) -> Optional[int]:
    """C-based fast validation returning 32-bit integer."""
    try:
        packed = socket.inet_pton(socket.AF_INET, ip_str)
        ip_int = int.from_bytes(packed, 'big')
        
        for start, end in _PRIVATE_RANGES:
            if start <= ip_int <= end:
                return None
        
        for start, end in _WHITELIST_INT_RANGES:
            if start <= ip_int <= end:
                return None
                
        return ip_int
    except OSError:
        return None


def int_to_ip(ip_int: int) -> str:
    """Convert 32-bit int back to IP string."""
    return socket.inet_ntop(socket.AF_INET, ip_int.to_bytes(4, 'big'))


def is_valid_ipv6(ip: str) -> bool:
    if ":" not in ip: return False
    try:
        socket.inet_pton(socket.AF_INET6, ip)
        return True
    except OSError:
        return False


def extract_domain(text: str) -> Optional[str]:
    text = text.strip()
    if text.startswith("http://") or text.startswith("https://"):
        try:
            text = text.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0]
        except Exception: pass
    text = text.lower()
    if _DOMAIN_PATTERN.match(text):
        return text
    return None

class FalsePositivesSet(set):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cidrs = []
        
    def add_item(self, item):
        self.add(item)
        if "/" in item:
            try:
                net = ipaddress.ip_network(item, strict=False)
                self.cidrs.append((int(net.network_address), int(net.broadcast_address)))
            except ValueError:
                pass
                
    def check_int(self, ip_int: int) -> bool:
        for start, end in self.cidrs:
            if start <= ip_int <= end:
                return True
        return False

def load_false_positives() -> FalsePositivesSet:
    result = FalsePositivesSet()
    
    # Load dynamic community false positives
    if os.path.exists("ioc/false_positives.txt"):
        try:
            with open("ioc/false_positives.txt", "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith(('#', '//')):
                        result.add_item(line)
        except Exception as e:
            log.error(f"Failed to load ioc/false_positives.txt: {e}")
            
    # Load static manual whitelist
    if os.path.exists("whitelist.txt"):
        try:
            with open("whitelist.txt", "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith(('#', '//')):
                        result.add_item(line)
        except Exception as e:
            log.error(f"Failed to load whitelist.txt: {e}")
            
    log.info(f"Loaded {len(result)} false positives (including {len(result.cidrs)} CIDRs)")
    return result


def load_custom_iocs() -> dict:
    """Load community-reported IPs from custom_iocs.txt and community_reports.json."""
    custom = {"ips": set(), "domains": set(), "hashes": set(), "urls": set()}
    
    # Parse custom_iocs.txt
    if os.path.exists("custom_iocs.txt"):
        current_section = "ips"  # default section
        try:
            with open("custom_iocs.txt", "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    # Section headers
                    if line.startswith('[') and line.endswith(']'):
                        section = line[1:-1].lower()
                        if section in custom:
                            current_section = section
                        continue
                    
                    if current_section == "ips":
                        ip_int = is_valid_ipv4_fast(line)
                        if ip_int:
                            custom["ips"].add(ip_int)
                    elif current_section == "hashes":
                        if _HASH_PATTERN.match(line):
                            custom["hashes"].add(line.lower())
                    elif current_section == "domains":
                        d = extract_domain(line)
                        if d:
                            custom["domains"].add(d)
                    elif current_section == "urls":
                        if is_valid_url(line):
                            custom["urls"].add(line)
            log.info(f"  Loaded custom_iocs.txt: {len(custom['ips'])} IPs, {len(custom['hashes'])} hashes, {len(custom['domains'])} domains, {len(custom['urls'])} URLs")
        except Exception as e:
            log.error(f"Failed to load custom_iocs.txt: {e}")
    
    # Parse community_reports.json for extra IPs
    if os.path.exists("ioc/community_reports.json"):
        try:
            with open("ioc/community_reports.json", "r", encoding="utf-8") as f:
                reports = json.load(f)
            for report in reports:
                ip_str = report.get("ip", "").strip()
                if ip_str:
                    ip_int = is_valid_ipv4_fast(ip_str)
                    if ip_int:
                        custom["ips"].add(ip_int)
            log.info(f"  Loaded community_reports.json: {len(reports)} reports")
        except Exception as e:
            log.error(f"Failed to load community_reports.json: {e}")
    
    return custom


def load_previous_ips(path: str) -> Set[int]:
    ips = set()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"): continue
                parts = line.strip().split(',')
                if parts:
                    ip_int = is_valid_ipv4_fast(parts[0])
                    if ip_int: ips.add(ip_int)
    return ips

def load_previous_ips_with_meta(path: str) -> tuple:
    """Like load_previous_ips, but also returns {ip_int: {"fs": first_seen, "ls": last_seen}}.

    The IP feed format is `IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen`, so
    the dates are the last two CSV columns when present (feeds written before the
    decay change have only four columns and get no metadata).
    """
    ips: Set[int] = set()
    meta: dict = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"): continue
                parts = line.strip().split(',')
                if not parts:
                    continue
                ip_int = is_valid_ipv4_fast(parts[0])
                if ip_int:
                    ips.add(ip_int)
                    if len(parts) >= 6:
                        meta[ip_int] = {"fs": parts[4].strip(), "ls": parts[5].strip()}
    return ips, meta

def load_previous_list(path: str) -> Set[str]:
    items = set()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"): continue
                item = line.strip()
                if not item: continue
                # Skip Git LFS pointer artifacts. During the LFS era one CI run
                # seeded the accumulative set from an LFS pointer checkout, so
                # 'version https://git-lfs…', 'oid sha256:…' and 'size …' became
                # permanent members of the domain/hash feeds (they sort cleanly
                # into the list, so nothing downstream ever flagged them).
                if item.startswith("version https://git-lfs") or item.startswith("oid sha256:") \
                   or (item.startswith("size ") and item[5:].isdigit()):
                    continue
                items.add(item)
    return items

def load_previous_list_with_meta(path: str) -> tuple:
    """Like load_previous_list, but also returns {indicator: last_seen_date_str}.

    Domains/hashes/urls/ipv6/cidrs are one-per-line feeds; the new format
    appends a date as the only comma-separated field (`evil.com,2026-08-31`).
    The indicator is everything before the first comma, the date the rest.
    Old-format lines have no comma and get no metadata.
    """
    items: Set[str] = set()
    meta: dict = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"): continue
                line = line.strip()
                if not line: continue
                if line.startswith("version https://git-lfs") or line.startswith("oid sha256:") \
                   or (line.startswith("size ") and line[5:].isdigit()):
                    continue
                if "," in line:
                    item, _, when = line.partition(",")
                    item = item.strip()
                    if not item: continue
                    items.add(item)
                    meta[item] = when.strip()
                else:
                    items.add(line)
    return items, meta


import glob


# ─────────────────────────────────────────────────────────────────────────────
# Chunked output for the two oversized feeds
#
# threatbase-domain.txt (~90 MiB) and threatbase-hash.txt (~69 MiB) are too big
# to commit as single files: GitHub warns above 50 MiB and hard-rejects above
# 100 MiB. They are therefore also written out as size-bounded chunks which ARE
# committed to git, while the unsplit originals stay git-ignored and ship as
# GitHub Release assets.
#
# This is safe for repo size only because both feeds are sorted and effectively
# append-only (a measured ~786 new domains per run out of 4.2M lines). Ordinary
# git delta-compresses that to ~14 KiB per run. Git LFS, which never deltas,
# stored a full ~160 MiB blob per run instead and is what exhausted the 10 GB
# LFS quota in two months. Do not move these back into LFS.
#
# The chunk COUNT is derived from the byte size, never hardcoded, so the feed
# can grow past 2 chunks without any code change. Consumers must read the chunk
# list from stats.json / manifest.json rather than assuming how many there are —
# assuming a count silently drops indicators once the feed grows.
# ─────────────────────────────────────────────────────────────────────────────

# Target maximum bytes per committed chunk.
#
# 48 MiB is chosen so the current 90.4 MiB domain feed splits into exactly two
# ~45.2 MiB chunks, both comfortably below GitHub's 50 MiB push warning (the
# hard rejection threshold is 100 MiB). A 45 MiB target would tip 90.4 MiB into
# ceil()=3 chunks instead.
#
# Nothing breaks when the feed outgrows this: at ~96 MiB the domain feed simply
# becomes three ~32 MiB chunks. Chunk count is always derived, and both
# stats.json and manifest.json publish the resulting list, so consumers follow
# along automatically.
CHUNK_TARGET_BYTES = 48 * 1024 * 1024


def chunk_name(path: str, index: int) -> str:
    """ioc/threatbase-domain.txt + 1 -> ioc/threatbase-domain-01.txt"""
    base, ext = os.path.splitext(path)
    return f"{base}-{index:02d}{ext}"


def load_previous_list_chunked(path: str) -> Set[str]:
    """
    Seed the accumulative database for a chunked feed.

    Prefers the unsplit file when present (local runs, or a release restore),
    and otherwise reassembles from the committed chunks — which is what a fresh
    CI checkout has, since the unsplit file is git-ignored. Without the chunk
    fallback the aggregator would silently start from an empty historical set
    and republish a feed truncated to only today's source hits.
    """
    if os.path.exists(path):
        return load_previous_list(path)

    items: Set[str] = set()
    base, ext = os.path.splitext(path)
    for chunk in sorted(glob.glob(f"{base}-[0-9][0-9]{ext}")):
        items |= load_previous_list(chunk)
    if items:
        log.info(f"  Reassembled {len(items):,} items from chunks of {os.path.basename(path)}")
    return items


def load_previous_list_chunked_with_meta(path: str) -> tuple:
    """Metadata-aware variant of load_previous_list_chunked."""
    if os.path.exists(path):
        return load_previous_list_with_meta(path)

    items: Set[str] = set()
    meta: dict = {}
    base, ext = os.path.splitext(path)
    for chunk in sorted(glob.glob(f"{base}-[0-9][0-9]{ext}")):
        c_items, c_meta = load_previous_list_with_meta(chunk)
        items |= c_items
        meta.update(c_meta)
    if items:
        log.info(f"  Reassembled {len(items):,} items (with meta) from chunks of {os.path.basename(path)}")
    return items, meta


def write_chunked_feed(path: str, items: list, false_positives=None, metadata: dict = None, today: str = None) -> list:
    """
    Write `items` to `path` as one unsplit file plus size-bounded chunks.

    Chunks are split on line boundaries only, so each chunk stays individually
    sorted and independently binary-searchable. Because the chunks partition a
    sorted list, each one covers a contiguous key range — the scanner uses the
    recorded first/last keys to fetch only the single chunk that could contain a
    query, instead of downloading the whole feed.

    When `metadata` (indicator -> last_seen date) is given, each line is written
    as `key,date` so consumers can see freshness. New keys with no metadata get
    `today`. The appended date is part of the line, so chunk first/last ranges
    still describe the key (line start).

    Returns a list of per-chunk metadata dicts for stats.json / manifest.json.
    """
    if today is None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = []
    for i in items:
        if false_positives is not None and i in false_positives:
            continue
        if metadata is not None:
            when = metadata.get(i) or today
            lines.append(f"{i},{when}\n")
        else:
            lines.append(f"{i}\n")

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    total_bytes = sum(len(ln.encode("utf-8")) for ln in lines)
    num_chunks = max(1, -(-total_bytes // CHUNK_TARGET_BYTES))  # ceil
    budget = -(-total_bytes // num_chunks) if num_chunks else total_bytes

    meta, idx, cursor = [], 1, 0
    while cursor < len(lines):
        acc, end = 0, cursor
        while end < len(lines) and (acc < budget or end == cursor):
            acc += len(lines[end].encode("utf-8"))
            end += 1
        part = lines[cursor:end]
        out = chunk_name(path, idx)
        with open(out, "w", encoding="utf-8") as f:
            f.writelines(part)
        meta.append({
            "file": os.path.basename(out),
            "first": part[0].strip(),
            "last": part[-1].strip(),
            "lines": len(part),
            "bytes": acc,
        })
        log.info(f"  Wrote {out} ({len(part):,} lines, {acc / 1048576:.1f} MiB)")
        cursor, idx = end, idx + 1

    # Remove chunks left over from a run that produced more of them. A stale
    # -03 would otherwise stay committed and keep being served as live data.
    stale = idx
    while os.path.exists(chunk_name(path, stale)):
        os.remove(chunk_name(path, stale))
        log.info(f"  Removed stale chunk {chunk_name(path, stale)}")
        stale += 1

    return meta


def clean_temporary_files():
    log.info("Cleaning up temporary downloaded files (*.zip, *.csv, *.data)...")
    for ext in ["*.zip", "*.csv", "*.data"]:
        for f in glob.glob(ext):
            try:
                os.remove(f)
                log.info(f"  Removed {f}")
            except Exception as e:
                log.error(f"  Failed to remove {f}: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Async Fetchers
# ─────────────────────────────────────────────────────────────────────────────
async def fetch_feed_async(session: aiohttp.ClientSession, name: str, url: str) -> dict:
    headers = {"User-Agent": USER_AGENT}

    if name == "abuseipdb":
        if ABUSEIPDB_API_KEY:
            headers["Key"] = ABUSEIPDB_API_KEY
            headers["Accept"] = "application/json"
        else:
            return {'ipv4': set(), 'ipv6': set(), 'cidrs': set()}

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=45)) as r:
                if r.status != 200:
                    raise IOError(f"HTTP {r.status}")

                if name == "abuseipdb":
                    data = await r.json()
                    ips = set()
                    for d in data.get("data", []):
                        ip_int = is_valid_ipv4_fast(d["ipAddress"])
                        if ip_int: ips.add(ip_int)
                    log.info(f"  ✓ {name}: {len(ips)} IPs")
                    return {'ipv4': ips, 'ipv6': set(), 'cidrs': set()}

                ips = set()
                ipv6s = set()
                cidrs = set()

                async for line_bytes in r.content:
                    line = line_bytes.decode('utf-8', errors='ignore').strip()
                    if not line or line.startswith(("#", "//", "!", "/*")):
                        continue

                    parts = line.split()
                    if not parts: continue
                    token = parts[0].split(",")[0].split("#")[0].strip("\"';")

                    if "/" in token:
                        try:
                            network = ipaddress.ip_network(token, strict=False)
                            if network.version == 4 and network.prefixlen == 32:
                                ip_int = is_valid_ipv4_fast(str(network.network_address))
                                if ip_int: ips.add(ip_int)
                            else:
                                cidrs.add(str(network))
                        except ValueError: pass
                    else:
                        ip_int = is_valid_ipv4_fast(token)
                        if ip_int:
                            ips.add(ip_int)
                        elif is_valid_ipv6(token):
                            ipv6s.add(token)

                if name == "greensnow":
                    log.info(f"  ✓ {name}: {len(ips)} IPs (Removed duplicates from source)")
                else:
                    log.info(f"  ✓ {name}: {len(ips)} IPs")
                return {'ipv4': ips, 'ipv6': ipv6s, 'cidrs': cidrs}
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                delay = RETRY_BACKOFF * attempt
                log.warning(f"  ↻ Feed {name} attempt {attempt}/{MAX_RETRIES} failed: {e}; retrying in {delay}s")
                await asyncio.sleep(delay)

    log.error(f"  ✗ Feed {name} failed after {MAX_RETRIES} attempts: {last_err}")
    return {}


async def fetch_domain_feed_async(session: aiohttp.ClientSession, name: str, url: str) -> Set[str]:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=45),
                                   headers={"User-Agent": USER_AGENT}) as r:
                if r.status != 200: raise IOError(f"HTTP {r.status}")
                domains = set()
                async for line_bytes in r.content:
                    line = line_bytes.decode('utf-8', errors='ignore').strip()
                    if not line or line.startswith(("#", "//")): continue
                    if line.startswith('"'):
                        parts = line.split('","')
                        if len(parts) > 2:
                            domain = extract_domain(parts[2])
                            if domain: domains.add(domain)
                    else:
                        candidate = line
                        if candidate.startswith("0.0.0.0 ") or candidate.startswith("127.0.0.1 "):
                            candidate = candidate.split(maxsplit=1)[1]
                        domain = extract_domain(candidate)
                        if domain: domains.add(domain)
                log.info(f"  ✓ {name}: {len(domains)} domains")
                return domains
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF * attempt)
    log.error(f"  ✗ Domain feed {name} failed after {MAX_RETRIES} attempts: {last_err}")
    return set()


async def fetch_hash_feed_async(session: aiohttp.ClientSession, name: str, url: str) -> Set[str]:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return await _fetch_hash_feed_once(session, name, url)
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF * attempt)
    log.error(f"  ✗ Hash feed {name} failed after {MAX_RETRIES} attempts: {last_err}")
    return set()


async def _fetch_hash_feed_once(session: aiohttp.ClientSession, name: str, url: str) -> Set[str]:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=90),
                           headers={"User-Agent": USER_AGENT}) as r:
        if r.status != 200: raise IOError(f"HTTP {r.status}")
        hashes = set()

        content_type = r.headers.get('Content-Type', '')
        if 'application/zip' in content_type or url.endswith('.zip'):
            content = await r.read()
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                for filename in z.namelist():
                    if filename.endswith('.txt') or filename.endswith('.csv'):
                        with z.open(filename) as f:
                            for line_bytes in f:
                                line = line_bytes.decode('utf-8', errors='ignore').strip()
                                if not line or line.startswith(('#', '//', '"')): continue
                                token = line.split()[0].split(',')[0].strip('"\';\r\n')
                                if _HASH_PATTERN.match(token):
                                    hashes.add(token.lower())
        else:
            async for line_bytes in r.content:
                line = line_bytes.decode('utf-8', errors='ignore').strip()
                if not line or line.startswith(('#', '//', '"')): continue
                token = line.split()[0].split(',')[0].strip('"\';\r\n')
                if _HASH_PATTERN.match(token):
                    hashes.add(token.lower())

        log.info(f"  ✓ {name}: {len(hashes)} hashes")
        return hashes


async def fetch_url_feed_async(session: aiohttp.ClientSession, name: str, url: str) -> Set[str]:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=45),
                                   headers={"User-Agent": USER_AGENT}) as r:
                if r.status != 200: raise IOError(f"HTTP {r.status}")
                urls = set()
                async for line_bytes in r.content:
                    line = line_bytes.decode('utf-8', errors='ignore').strip()
                    if not line or line.startswith(('#', '//')): continue
                    if line.startswith('"'):
                        parts = line.split('","')
                        if len(parts) > 2:
                            candidate = parts[2].strip('"')
                            if is_valid_url(candidate): urls.add(candidate)
                    elif is_valid_url(line):
                        urls.add(line)
                log.info(f"  ✓ {name}: {len(urls)} URLs")
                return urls
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF * attempt)
    log.error(f"  ✗ URL feed {name} failed after {MAX_RETRIES} attempts: {last_err}")
    return set()


async def fetch_threatfox_async(session: aiohttp.ClientSession, name: str, url: str) -> dict:
    result = {"ips": set(), "ipv6": set(), "cidrs": set(), "domains": set(), "hashes": set(), "urls": set()}
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=60),
                               headers={"User-Agent": USER_AGENT}) as r:
            if r.status != 200: return result
            content_type = r.headers.get('Content-Type', '')
            if 'application/zip' in content_type or url.endswith('.zip') or '/csv/' in url:
                content = await r.read()
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    for filename in z.namelist():
                        if filename.endswith('.csv'):
                            with z.open(filename) as f:
                                text_stream = io.TextIOWrapper(f, encoding='utf-8', errors='ignore')
                                reader = csv.reader(text_stream, skipinitialspace=True)
                                for row in reader:
                                    if len(row) < 5 or str(row[0]).startswith('#'): continue
                                    ioc = row[2].strip().strip('\'"')
                                    ioc_type = row[3].strip().strip('\'"').lower()
                                    if not ioc: continue
                                    if "ip" in ioc_type:
                                        ip_part = ioc.split(":")[0]
                                        ip_int = is_valid_ipv4_fast(ip_part)
                                        if ip_int: result["ips"].add(ip_int)
                                    elif "domain" in ioc_type:
                                        d = extract_domain(ioc)
                                        if d: result["domains"].add(d)
                                    elif "sha256" in ioc_type and _SHA256_PATTERN.match(ioc):
                                        result["hashes"].add(ioc.lower())
                                    elif "url" in ioc_type and is_valid_url(ioc):
                                        result["urls"].add(ioc)
            else:
                data = await r.json()
                entries = data.get("data", data)
                if isinstance(entries, dict): entries = list(entries.values())
                
                flat = []
                if isinstance(entries, list):
                    for item in entries:
                        if isinstance(item, list): flat.extend(item)
                        elif isinstance(item, dict): flat.append(item)
                        
                for entry in flat:
                    if not isinstance(entry, dict): continue
                    ioc = entry.get("ioc_value", "").strip()
                    ioc_type = entry.get("ioc_type", "").lower()
                    if not ioc: continue
                    
                    if "ip" in ioc_type:
                        ip_part = ioc.split(":")[0]
                        ip_int = is_valid_ipv4_fast(ip_part)
                        if ip_int: result["ips"].add(ip_int)
                    elif "domain" in ioc_type:
                        d = extract_domain(ioc)
                        if d: result["domains"].add(d)
                    elif "sha256" in ioc_type and _SHA256_PATTERN.match(ioc):
                        result["hashes"].add(ioc.lower())
                    elif "url" in ioc_type and is_valid_url(ioc):
                        result["urls"].add(ioc)
            log.info(f"  ✓ ThreatFox {name}: {len(result['ips'])} IPs")
            return result
    except Exception as e:
        log.error(f"  ✗ ThreatFox {name} failed: {e}")
        return result

# ─────────────────────────────────────────────────────────────────────────────
# Trust Tier & Tag Processing
# ─────────────────────────────────────────────────────────────────────────────
FEED_TRUST_TIERS = {
    "custom": "HIGH", "historical": "HIGH",
    "feodo_tracker": "HIGH", "feodo_tracker_aggressive": "HIGH", "abuseipdb": "HIGH",
    "threatfox_full": "HIGH", "spamhaus_drop": "HIGH", "spamhaus_edrop": "HIGH", "spamhaus_dropv6": "HIGH",
    "cins_army": "HIGH", "emerging_threats": "HIGH", "emerging_threats_fwrules": "HIGH",
    "greensnow": "HIGH", "dshield_blocklist": "HIGH", "alienvault_reputation": "HIGH",
    "sslbl_abuse_ch": "HIGH", "snort_ip_filter": "HIGH",
    
    "blocklist_de": "MEDIUM", "blocklist_de_ssh": "MEDIUM", "blocklist_de_mail": "MEDIUM",
    "blocklist_de_apache": "MEDIUM", "bruteforceblocker": "MEDIUM", "criticalpath_security": "MEDIUM",
    "dan_tor": "MEDIUM", "tor_bulk_exit": "MEDIUM", "bbcan177_ms1": "MEDIUM",
    "botvrij": "MEDIUM", "binary_defense": "MEDIUM", "stopforumspam_toxic": "MEDIUM", "blocklist_net_bots": "MEDIUM",
    "blocklist_net_strongips": "MEDIUM", "dataplane_sipinv": "MEDIUM", "dataplane_sshclient": "MEDIUM",
    "dataplane_sshpwauth": "MEDIUM", "dataplane_vncrfb": "MEDIUM",
    
    "firehol_level1": "LOW", "firehol_level2": "LOW", "ipsum": "LOW",
    "blackbook": "LOW", "romainmarcoux_outgoing_40k": "LOW",
    "romainmarcoux_outgoing_aa": "LOW", "romainmarcoux_outgoing_ab": "LOW",
    "firehol_level3": "LOW",
}

# ── Geolocation (IP → country) via iptoasn.com free dataset ─────────────────
GEO_DB_URL = "https://iptoasn.com/data/ip2asn-v4.tsv.gz"
GEO_DB_PATH = "ip2asn-v4.tsv.gz"


def load_geo_index() -> Optional[tuple]:
    """Download (if missing) and parse ip2asn into sorted (starts, ranges).

    Returns (starts, ranges) where `starts` is a sorted list of range-start
    integers for bisect, and `ranges[i]` = (start, end, country_code).
    Returns None on any failure — geo is best-effort and never blocks the run.
    """
    try:
        if not os.path.exists(GEO_DB_PATH):
            log.info("Downloading ip2asn geo database...")
            import requests
            resp = requests.get(
                GEO_DB_URL,
                timeout=120,
                headers={"User-Agent": "Mozilla/5.0 (Threatbase feed pipeline)"},
            )
            resp.raise_for_status()
            with open(GEO_DB_PATH, "wb") as fh:
                fh.write(resp.content)

        ranges: List[tuple] = []
        with gzip.open(GEO_DB_PATH, "rt", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 4:
                    continue
                cc = parts[3]
                if not cc or cc in ("None", "-"):
                    continue
                start = is_valid_ipv4_fast(parts[0])
                end = is_valid_ipv4_fast(parts[1])
                if start is None or end is None:
                    continue
                ranges.append((start, end, cc))

        ranges.sort(key=lambda r: r[0])
        starts = [r[0] for r in ranges]
        log.info(f"  Loaded {len(ranges):,} geo ranges from ip2asn")
        return starts, ranges
    except Exception as e:
        log.warning(f"Geo database unavailable, skipping geo map: {e}")
        return None


def country_for_ip(ip_int: int, starts: list, ranges: list) -> Optional[str]:
    """Binary-search the country code containing ip_int, or None."""
    idx = bisect.bisect_right(starts, ip_int) - 1
    if idx < 0:
        return None
    start, end, cc = ranges[idx]
    return cc if start <= ip_int <= end else None


def compute_geo(sorted_ips: list, geo_index: Optional[tuple]) -> Optional[dict]:
    """Aggregate malicious IP counts per country for the live threat map."""
    if not geo_index:
        return None
    starts, ranges = geo_index
    counts: Counter = Counter()
    for ip in sorted_ips:  # sorted_ips are integers
        cc = country_for_ip(ip, starts, ranges)
        if cc:
            counts[cc] += 1
    geolocated = sum(counts.values())
    log.info(f"  Geolocated {geolocated:,}/{len(sorted_ips):,} IPs across {len(counts)} countries")
    return {
        "countries": dict(counts.most_common()),
        "total_geolocated": geolocated,
        "total_ips": len(sorted_ips),
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


def process_ip_metadata(ip_sources: Dict[str, Set[int]], false_positives: FalsePositivesSet,
                        ip_meta: dict = None, today: str = None) -> tuple:
    """Generates rich IP tagging and assigns trust scores with decay.

    `ip_meta` is a dict of {ip_int: last_seen_date_str} from the previous run.
    Indicators not re-observed this run have their last_seen unchanged; if older
    than STALE_THRESHOLD_DAYS they are dropped. If older than DECAY_HALF_LIFE_DAYS
    but not stale, the risk score is downgraded one tier.

    Returns (filtered_metadata, stale_count) where filter metadata is
    {ip_int: {...}} and stale_count is how many IPs were dropped.
    """
    if today is None:
        today_dt = datetime.now(timezone.utc).date()
    else:
        today_dt = datetime.strptime(today, "%Y-%m-%d").replace(tzinfo=timezone.utc).date()

    ip_metadata = defaultdict(lambda: {"sources": set(), "tags": set()})
    stale_count = 0
    seen_this_run: Set[int] = set()
    
    for src, ips in ip_sources.items():
        cat = FEED_CATEGORIES.get(src, "Mixed")
        for ip in ips:
            ip_str = int_to_ip(ip) if isinstance(ip, int) else ip
            
            is_fp = False
            if ip_str in false_positives:
                is_fp = True
            elif isinstance(ip, int) and hasattr(false_positives, "check_int"):
                is_fp = false_positives.check_int(ip)

            if is_fp: continue

            # Only a live (non-historical) sighting refreshes last_seen. The
            # historical cache is the previous feed — counting it would set every
            # cached IOC to "seen today" and nothing would ever decay.
            if isinstance(ip, int) and src != "historical":
                seen_this_run.add(ip)

            ip_metadata[ip]["sources"].add(src)
            if cat != "Mixed":
                ip_metadata[ip]["tags"].add(cat)

    filtered = {}
    for ip, data in ip_metadata.items():
        sources = data["sources"]
        num_sources = len(sources)
        tiers = [FEED_TRUST_TIERS.get(s, "LOW") for s in sources]

        score = "LOW"
        if "HIGH" in tiers:
            score = "HIGH"
        elif "MEDIUM" in tiers:
            score = "MEDIUM"

        # ── Decay: last_seen and staleness ─────────────────────────────────
        last_seen = today_dt
        first_seen = today_dt
        prior = (ip_meta or {}).get(ip) if isinstance(ip, int) else None
        if prior:
            try:
                last_seen = datetime.strptime(prior.get("ls") or "", "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
            except ValueError:
                last_seen = today_dt
            try:
                first_seen = datetime.strptime(prior.get("fs") or "", "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
            except ValueError:
                first_seen = last_seen

        if ip in seen_this_run:
            last_seen = today_dt

        days_since = (today_dt - last_seen).days
        if days_since > STALE_THRESHOLD_DAYS:
            stale_count += 1
            continue

        if days_since > DECAY_HALF_LIFE_DAYS:
            # Downgrade one tier: HIGH→MEDIUM, MEDIUM→LOW, LOW stays LOW.
            score = {"HIGH": "MEDIUM", "MEDIUM": "LOW"}.get(score, score)
            tags = set(data["tags"])
            tags.add("Stale")
            data["tags"] = tags

        tags_list = sorted(list(data["tags"])) if data["tags"] else ["Mixed"]
        filtered[ip] = {
            "ip": int_to_ip(ip),
            "count": num_sources,
            "score": score,
            "tags": tags_list,
            "sources": list(sources),
            "first_seen": first_seen.isoformat(),
            "last_seen": last_seen.isoformat(),
        }
    return filtered, stale_count


def update_history(stats: dict) -> None:
    """Append today's stats snapshot to ioc/history.json for trend charts."""
    history_path = "ioc/history.json"
    history = []

    if os.path.exists(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception as e:
            log.warning(f"Could not parse existing history.json, starting fresh: {e}")
            history = []

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Build today's entry
    today_entry = {
        "date": today,
        "total_unique_ips": stats["total_unique_ips"],
        "total_unique_ipv6": stats.get("total_unique_ipv6", 0),
        "total_unique_cidrs": stats.get("total_unique_cidrs", 0),
        "total_unique_domains": stats.get("total_unique_domains", 0),
        "total_unique_hashes": stats.get("total_unique_hashes", 0),
        "total_unique_urls": stats.get("total_unique_urls", 0),
        "active_feeds": stats.get("active_feeds", 0),
        "category_counts": stats.get("category_counts", {}),
        "top_sources": stats.get("top_sources", {}),
        "stale_count": stats.get("stale_indicators", 0),
        "avg_freshness": stats.get("avg_freshness_days", 0),
    }

    # Replace today's entry if it already exists, otherwise append
    updated = False
    for i, entry in enumerate(history):
        if entry.get("date") == today:
            history[i] = today_entry
            updated = True
            break

    if not updated:
        history.append(today_entry)

    # Keep last 90 days of history
    history = history[-90:]

    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    log.info(f"  Updated history.json: {len(history)} entries (today = {today})")


# ── Feed Freshness Monitoring ──────────────────────────────────────────────
# Tracks per-feed health between runs: when a feed stops producing new IOCs
# (not just returning zero data, but returning zero NOVEL data) it is logged
# so operators can investigate. The cache is persisted to ioc/feed_health.json
# and carries over between CI runs.
FEED_HEALTH_PATH = "ioc/feed_health.json"


def load_feed_health() -> dict:
    """Load the per-feed freshness cache from disk."""
    if os.path.exists(FEED_HEALTH_PATH):
        try:
            with open(FEED_HEALTH_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning(f"Could not parse {FEED_HEALTH_PATH}, starting fresh: {e}")
    return {}


def save_feed_health(health: dict) -> None:
    """Persist the per-feed freshness cache."""
    with open(FEED_HEALTH_PATH, "w", encoding="utf-8") as f:
        json.dump(health, f, indent=2)
    log.info(f"  Wrote feed_health.json ({len(health)} feeds tracked)")


def check_feed_freshness(name: str, new_count: int, health: dict) -> dict:
    """Update a single feed's freshness record and return a warning message if stale.

    Returns None if the feed is healthy, or a warning string if it has been
    producing no new IOCs for 3+ consecutive runs.
    """
    entry = health.get(name, {"last_data": None, "last_new_count": 0, "consecutive_empty": 0})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if new_count > 0:
        entry["last_data"] = today
        entry["last_new_count"] = new_count
        entry["consecutive_empty"] = 0
        warning = None
    else:
        entry["consecutive_empty"] = entry.get("consecutive_empty", 0) + 1
        warning = (
            f"  ⚠ Feed '{name}' returned no NEW IOCs for {entry['consecutive_empty']} consecutive "
            f"run(s) (last new data: {entry.get('last_data', 'never')}). "
            f"Check if the feed is still alive."
        ) if entry["consecutive_empty"] >= 3 else None

    health[name] = entry
    return warning


# ─────────────────────────────────────────────────────────────────────────────
# Main Async Runner
# ─────────────────────────────────────────────────────────────────────────────
async def run_async_collector():
    t_start = time.time()
    log.info("═" * 55)
    log.info("  Threatbase v5 — Async Threat Aggregator")
    log.info("═" * 55)
    
    os.makedirs("ioc", exist_ok=True)
    false_positives = load_false_positives()
    
    ip_sources = {}
    ipv6_sources = {}
    cidr_sources = {}
    domain_results = {}
    hash_sources = {}
    url_sources = {}

    # ── Load historical IOCs from previous run (accumulative database) ──────
    # Metadata (last_seen dates) is carried forward so decay can age out
    # indicators that are no longer being observed.
    log.info("Loading previous IOCs from cache...")
    ip_meta = {}
    _hist_ips, ip_meta = load_previous_ips_with_meta("ioc/threatbase-ip.txt")
    ip_sources["historical"] = _hist_ips
    ipv6_meta = {}
    ipv6_sources["historical"], ipv6_meta = load_previous_list_with_meta("ioc/threatbase-ipv6.txt")
    cidr_meta = {}
    cidr_sources["historical"], cidr_meta = load_previous_list_with_meta("ioc/threatbase-cidr.txt")
    domain_meta = {}
    domain_results["historical"], domain_meta = load_previous_list_chunked_with_meta("ioc/threatbase-domain.txt")
    hash_meta = {}
    hash_sources["historical"], hash_meta = load_previous_list_chunked_with_meta("ioc/threatbase-hash.txt")
    url_meta = {}
    url_sources["historical"], url_meta = load_previous_list_with_meta("ioc/threatbase-url.txt")
    
    log.info(f"  Historical cache: {len(ip_sources['historical'])} IPs, "
             f"{len(domain_results['historical'])} domains, "
             f"{len(hash_sources['historical'])} hashes, "
             f"{len(url_sources['historical'])} URLs")

    # ── Load custom/community-reported IOCs ─────────────────────────────────
    log.info("Loading custom and community-reported IOCs...")
    custom_iocs = load_custom_iocs()
    if custom_iocs["ips"]:
        ip_sources["custom"] = custom_iocs["ips"]
    if custom_iocs["domains"]:
        domain_results["custom"] = custom_iocs["domains"]
    if custom_iocs["hashes"]:
        hash_sources["custom"] = custom_iocs["hashes"]
    if custom_iocs["urls"]:
        url_sources["custom"] = custom_iocs["urls"]

    # ── Fetch all remote feeds asynchronously ───────────────────────────────
    log.info("Spawning all fetch tasks asynchronously...")
    
    # Track which feeds returned data for stats
    successful_feeds = set()
    feed_ip_counts = {}
    
    conn = aiohttp.TCPConnector(limit=50)
    async with aiohttp.ClientSession(connector=conn) as session:
        # Create all tasks
        tasks = []
        task_info = []
        
        for name, url in FEEDS.items():
            tasks.append(fetch_feed_async(session, name, url))
            task_info.append(('ip', name))
            
        for name, url in DOMAIN_FEEDS.items():
            tasks.append(fetch_domain_feed_async(session, name, url))
            task_info.append(('domain', name))
            
        for name, url in HASH_FEEDS.items():
            tasks.append(fetch_hash_feed_async(session, name, url))
            task_info.append(('hash', name))
            
        for name, url in URL_FEEDS.items():
            tasks.append(fetch_url_feed_async(session, name, url))
            task_info.append(('url', name))
            
        for name, url in THREATFOX_FEEDS.items():
            tasks.append(fetch_threatfox_async(session, name, url))
            task_info.append(('tf', name))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for (feed_type, name), res in zip(task_info, results):
            if isinstance(res, Exception):
                log.error(f"Task {name} completely failed: {res}")
                continue
                
            if not res: continue
            
            successful_feeds.add(name)
            
            if feed_type == 'ip':
                ipv4_set = res.get('ipv4', set())
                ip_sources[name] = ipv4_set
                ipv6_sources[name] = res.get('ipv6', set())
                cidr_sources[name] = res.get('cidrs', set())
                if ipv4_set:
                    feed_ip_counts[name] = len(ipv4_set)
            elif feed_type == 'domain':
                domain_results[name] = res
            elif feed_type == 'hash':
                hash_sources[name] = res
            elif feed_type == 'url':
                url_sources[name] = res
            elif feed_type == 'tf':
                if res.get("ips"):
                    ip_sources[name] = res["ips"]
                    feed_ip_counts[name] = len(res["ips"])
                if res.get("ipv6"): ipv6_sources[name] = res["ipv6"]
                if res.get("cidrs"): cidr_sources[name] = res["cidrs"]
                if res.get("domains"): domain_results[name] = res["domains"]
                if res.get("hashes"): hash_sources[name] = res["hashes"]
                if res.get("urls"): url_sources[name] = res["urls"]

    log.info(f"All feeds downloaded and parsed in {time.time()-t_start:.1f}s")
    log.info(f"  Successful feeds: {len(successful_feeds)}")

    # ── Failure summary: never let a dropped feed disappear silently ─────────
    attempted_feeds = {name for (_t, name) in task_info}
    failed_feeds = sorted(attempted_feeds - successful_feeds)
    if failed_feeds:
        log.warning(f"  ⚠ {len(failed_feeds)} feed(s) returned no data this run: {', '.join(failed_feeds)}")
        log.warning("    (historical cache preserves their previously-seen IOCs — nothing is lost)")
    else:
        log.info("  ✓ All feeds returned data.")

    # ── Feed Freshness: compute new-IOC counts per feed ─────────────────────
    # "New" means not present in the historical cache (the previous full feed).
    # This catches silent feeds that return data but stop producing novel
    # indicators, which plain fetch success/failure never would.
    log.info("Checking feed freshness...")
    feed_health = load_feed_health()
    ip_historical = ip_sources.get("historical", set())
    for name, ips in ip_sources.items():
        if name == "historical" or not isinstance(ips, set):
            continue
        new_count = len(ips - ip_historical)
        warning = check_feed_freshness(name, new_count, feed_health)
        if warning:
            log.warning(warning)

    # ── Process Trust Tiers & IP Tagging (with decay) ───────────────────────
    log.info("Processing rich IP tags and trust scores with decay...")
    today_dt = datetime.now(timezone.utc).date()
    today_str = today_dt.strftime("%Y-%m-%d")
    filtered_ip_info, stale_ip_count = process_ip_metadata(
        ip_sources, false_positives, ip_meta=ip_meta, today=today_str
    )

    # Sort IPs rapidly using their integer values
    sorted_ips = sorted(filtered_ip_info.keys())

    # Compute average freshness (days since last_seen) for stats
    fresh_days = []
    for ip in sorted_ips:
        info = filtered_ip_info[ip]
        try:
            ls = datetime.strptime(info["last_seen"], "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
            fresh_days.append((today_dt - ls).days)
        except (ValueError, KeyError):
            pass
    avg_freshness_days = round(sum(fresh_days) / len(fresh_days), 1) if fresh_days else 0

    if stale_ip_count:
        log.info(f"  Decay: dropped {stale_ip_count:,} stale IPs (> {STALE_THRESHOLD_DAYS}d), "
                 f"avg freshness {avg_freshness_days}d across {len(sorted_ips):,} IPs")
    


    # ── Write Text outputs ──────────────────────────────────────────────────
    log.info("Writing threatbase-ip.txt...")
    txt_output_path = "ioc/threatbase-ip.txt"
    timestamp = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    
    with open(txt_output_path, "w", encoding="utf-8", buffering=1 << 16) as f:
        f.write("# Threatbase Threat Intelligence Feed - IPs\n")
        f.write(f"# Last update: {timestamp}\n")
        f.write("# Format: IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen\n")
        for ip in sorted_ips:
            info = filtered_ip_info[ip]
            tags_str = "|".join(info["tags"])
            f.write(f"{info['ip']},{info['count']},{info['score']},{tags_str},{info['first_seen']},{info['last_seen']}\n")

    # ── Write category-split IP feeds ──────────────────────────────────────
    # One blocklist per threat category so defenders can apply different
    # policies (e.g. hard-block C2, only alert on Tor). Same line format as
    # the master feed. Each IP appears in every category it is tagged with.
    log.info("Writing category-split IP feeds...")
    os.makedirs("ioc/categories", exist_ok=True)
    category_ips: Dict[str, list] = defaultdict(list)
    for ip in sorted_ips:  # sorted_ips is already ascending, so buckets stay sorted
        for tag in filtered_ip_info[ip]["tags"]:
            category_ips[tag].append(ip)

    ip_category_files: Dict[str, int] = {}
    for cat, ips in sorted(category_ips.items()):
        slug = CATEGORY_SLUGS.get(cat, re.sub(r"[^a-z0-9]+", "", cat.lower()))
        fname = f"threatbase-ip-{slug}.txt"
        with open(f"ioc/categories/{fname}", "w", encoding="utf-8", buffering=1 << 16) as f:
            f.write(f"# Threatbase Threat Intelligence Feed - {cat} IPs\n")
            f.write(f"# Last update: {timestamp}\n")
            f.write(f"# Count: {len(ips)}\n")
            f.write("# Format: IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen\n")
            for ip in ips:
                info = filtered_ip_info[ip]
                tags_str = "|".join(info["tags"])
                f.write(f"{info['ip']},{info['count']},{info['score']},{tags_str},{info['first_seen']},{info['last_seen']}\n")
        ip_category_files[fname] = len(ips)
    log.info(f"  Wrote {len(ip_category_files)} category feeds to ioc/categories/")

    # ── Geolocate IPs → ioc/geo.json (powers the live threat map) ──────────
    log.info("Computing IP geolocation for threat map...")
    geo_index = load_geo_index()
    geo_data = compute_geo(sorted_ips, geo_index)
    if geo_data:
        with open("ioc/geo.json", "w", encoding="utf-8") as f:
            json.dump(geo_data, f, indent=2)
        log.info("  Wrote ioc/geo.json")
    else:
        log.warning("  Skipped ioc/geo.json (no geo data)")

    # ── Hall of Shame: ioc/top_ips.json ────────────────────────────────────
    # Top 100 IPs by corroboration (independent upstream feeds listing them,
    # risk tier as tiebreak). Small, self-contained JSON so the /hall-of-shame
    # page never has to touch the multi-MB master feed.
    log.info("Writing ioc/top_ips.json...")
    _tier_rank = {"HIGH": 2, "MEDIUM": 1, "LOW": 0}
    top_keys = sorted(
        filtered_ip_info,
        key=lambda k: (filtered_ip_info[k]["count"], _tier_rank.get(filtered_ip_info[k]["score"], 0)),
        reverse=True,
    )[:100]
    gi_starts, gi_ranges = geo_index if geo_index else (None, None)
    with open("ioc/top_ips.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": timestamp,
            "ips": [
                {
                    "ip": filtered_ip_info[k]["ip"],
                    "feeds": filtered_ip_info[k]["count"],
                    "score": filtered_ip_info[k]["score"],
                    "tags": sorted(filtered_ip_info[k]["tags"]),
                    "country": (country_for_ip(k, gi_starts, gi_ranges) or "") if gi_starts else "",
                    "first_seen": filtered_ip_info[k]["first_seen"],
                    "last_seen": filtered_ip_info[k]["last_seen"],
                }
                for k in top_keys
            ],
        }, f, indent=1)


    # ── Apply staleness filter to the non-IP feeds ─────────────────────────
    # Domains/hashes/urls/ipv6/cidrs also decay: an indicator whose last_seen is
    # older than STALE_THRESHOLD_DAYS is dropped from the feed. This stops the
    # accumulative database from growing without bound, and matches the IP path.
    stale_ip6_cidr = 0
    for meta, name in ((ipv6_meta, "IPv6"), (cidr_meta, "CIDR")):
        for key, when in list(meta.items()):
            try:
                ls = datetime.strptime(when, "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
            except (ValueError, TypeError):
                continue
            if (today_dt - ls).days > STALE_THRESHOLD_DAYS:
                del meta[key]
                stale_ip6_cidr += 1
                # Also remove from the source set so it isn't re-emitted today.
                src = ipv6_sources if name == "IPv6" else cidr_sources
                for k in src:
                    if k == "historical":
                        src[k] = {x for x in src[k] if x != key}

    stale_domains = 0
    for key, when in list(domain_meta.items()):
        try:
            ls = datetime.strptime(when, "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
        except (ValueError, TypeError):
            continue
        if (today_dt - ls).days > STALE_THRESHOLD_DAYS:
            del domain_meta[key]
            stale_domains += 1
            for k in domain_results:
                if k == "historical":
                    domain_results[k] = {x for x in domain_results[k] if x != key}

    stale_hashes = 0
    for key, when in list(hash_meta.items()):
        try:
            ls = datetime.strptime(when, "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
        except (ValueError, TypeError):
            continue
        if (today_dt - ls).days > STALE_THRESHOLD_DAYS:
            del hash_meta[key]
            stale_hashes += 1
            for k in hash_sources:
                if k == "historical":
                    hash_sources[k] = {x for x in hash_sources[k] if x != key}

    stale_urls = 0
    for key, when in list(url_meta.items()):
        try:
            ls = datetime.strptime(when, "%Y-%m-%d").replace(tzinfo=timezone.utc).date()
        except (ValueError, TypeError):
            continue
        if (today_dt - ls).days > STALE_THRESHOLD_DAYS:
            del url_meta[key]
            stale_urls += 1
            for k in url_sources:
                if k == "historical":
                    url_sources[k] = {x for x in url_sources[k] if x != key}

    stale_other = stale_ip6_cidr + stale_domains + stale_hashes + stale_urls
    if stale_other:
        log.info(f"  Decay: dropped {stale_other:,} stale non-IP IOCs "
                 f"({stale_domains} domains, {stale_hashes} hashes, {stale_urls} URLs, "
                 f"{stale_ip6_cidr} IPv6/CIDR)")

    # ── Write domains (sorted for binary search, chunked for git) ───────────
    log.info("Writing threatbase-domain.txt (with date metadata)...")
    all_domains = sorted(set().union(*domain_results.values()))
    domain_chunks = write_chunked_feed("ioc/threatbase-domain.txt", all_domains, false_positives, metadata=domain_meta, today=today_str)

    # ── Write hashes (sorted for binary search, chunked for git) ────────────
    log.info("Writing threatbase-hash.txt (with date metadata)...")
    all_hashes = sorted(set().union(*hash_sources.values()))
    hash_chunks = write_chunked_feed("ioc/threatbase-hash.txt", all_hashes, metadata=hash_meta, today=today_str)
            
    # ── Write urls (sorted for binary search, with date metadata) ───────────
    log.info("Writing threatbase-url.txt (with date metadata)...")
    all_urls = sorted(set().union(*url_sources.values()))
    with open("ioc/threatbase-url.txt", "w", encoding="utf-8") as f:
        for u in all_urls:
            when = url_meta.get(u) or today_str
            f.write(f"{u},{when}\n")

    # ── Write IPv6 (sorted, with date metadata) ────────────────────────────
    log.info("Writing threatbase-ipv6.txt (with date metadata)...")
    all_ipv6 = sorted(set().union(*ipv6_sources.values()))
    with open("ioc/threatbase-ipv6.txt", "w", encoding="utf-8") as f:
        for ipv6 in all_ipv6:
            if ipv6 in false_positives: continue
            when = ipv6_meta.get(ipv6) or today_str
            f.write(f"{ipv6},{when}\n")

    # ── Write CIDRs (sorted, with date metadata) ────────────────────────────
    log.info("Writing threatbase-cidr.txt (with date metadata)...")
    all_cidrs = sorted(set().union(*cidr_sources.values()))
    with open("ioc/threatbase-cidr.txt", "w", encoding="utf-8") as f:
        for cidr in all_cidrs:
            if cidr in false_positives: continue
            when = cidr_meta.get(cidr) or today_str
            f.write(f"{cidr},{when}\n")
    
    # ── Build category counts ──────────────────────────────────────────────
    category_counts = defaultdict(int)
    for info in filtered_ip_info.values():
        for tag in info["tags"]:
            category_counts[tag] += 1

    # ── Build top sources (top 5 feeds by IP count) ────────────────────────
    top_sources = dict(sorted(feed_ip_counts.items(), key=lambda x: x[1], reverse=True)[:5])

    # ── Write stats.json (with last_updated for the website) ───────────────
    log.info("Writing stats.json...")
    now_utc = datetime.now(timezone.utc)

    # Chunk metadata travels inside stats.json because the website already
    # fetches it and already uses last_updated as its cache-busting feed
    # version — so the scanner learns the chunk layout with no extra request
    # and can never read a chunk list that disagrees with the data version.
    chunk_meta = {
        "threatbase-domain.txt": domain_chunks,
        "threatbase-hash.txt": hash_chunks,
    }

    stats = {
        "total_unique_ips": len(sorted_ips),
        "total_unique_ipv6": len(all_ipv6),
        "total_unique_cidrs": len(all_cidrs),
        "total_unique_domains": len(all_domains),
        "total_unique_hashes": len(all_hashes),
        "total_unique_urls": len(all_urls),
        "active_feeds": len(successful_feeds),
        "category_counts": dict(category_counts),
        "ip_category_files": ip_category_files,
        "top_sources": top_sources,
        "last_updated": now_utc.isoformat(),
        # Decay / freshness health metrics
        "stale_indicators": stale_ip_count,
        "avg_freshness_days": avg_freshness_days,
        "decay_config": {
            "half_life_days": DECAY_HALF_LIFE_DAYS,
            "stale_threshold_days": STALE_THRESHOLD_DAYS,
        },
        "stale_feeds": [n for n, e in feed_health.items() if e.get("consecutive_empty", 0) >= 3],
        # Full per-chunk detail (ranges, sizes) for the scanner.
        "chunks": chunk_meta,
        # Flat filename lists, which is the shape the Feeds UI consumes.
        "chunk_files": {k: [c["file"] for c in v] for k, v in chunk_meta.items()},
    }
    with open("ioc/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    # ── Write manifest.json (standalone, for third-party consumers) ────────
    log.info("Writing manifest.json...")
    manifest = {
        "generated": now_utc.isoformat(),
        "note": (
            "threatbase-domain.txt and threatbase-hash.txt exceed GitHub's file size "
            "limits and are committed as the chunks listed here. Chunks partition the "
            "sorted feed, so each covers a contiguous key range and can be binary "
            "searched on its own. Always read this list rather than assuming a chunk "
            "count: the count grows with the feed."
        ),
        "unsplit_downloads": "https://github.com/kalidada18/threatbase/releases/download/latest/",
        "chunk_base": "https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/",
        "feeds": chunk_meta,
    }
    with open("ioc/manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # ── Update history.json (for trend charts) ─────────────────────────────
    log.info("Updating history.json...")
    update_history(stats)

    # ── Persist feed freshness health ──────────────────────────────────────
    save_feed_health(feed_health)

    # ── Cleanup ────────────────────────────────────────────────────────────
    clean_temporary_files()

    elapsed = time.time() - t_start
    log.info("═" * 55)
    log.info(f"  Finished gracefully in {elapsed:.1f}s")
    log.info(f"  Total IPs:     {len(sorted_ips):>10,}")
    log.info(f"  Total IPv6:    {len(all_ipv6):>10,}")
    log.info(f"  Total CIDRs:   {len(all_cidrs):>10,}")
    log.info(f"  Total Domains: {len(all_domains):>10,}")
    log.info(f"  Total Hashes:  {len(all_hashes):>10,}")
    log.info(f"  Total URLs:    {len(all_urls):>10,}")
    log.info(f"  Active Feeds:  {len(successful_feeds):>10,}")
    log.info(f"  Stale dropped: {stale_ip_count:>10,}")
    log.info("═" * 55)


def main():
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_async_collector())

if __name__ == "__main__":
    main()
