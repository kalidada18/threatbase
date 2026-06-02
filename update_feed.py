#!/usr/bin/env python3
"""
HimalayaFeed — Threat Intelligence Feed Aggregator
=====================================================
Collects malicious IPv4 addresses from free public threat-intelligence feeds,
deduplicates them, tracks provenance, and writes four output artefacts.

Runs entirely on GitHub Actions — no VPS, API keys, or paid services required.

Requirements: Python 3.11+, requests, pandas
"""

import ipaddress
import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
import requests

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Feed definitions
# All feeds are free, public, and require zero authentication.
# ─────────────────────────────────────────────────────────────────────────────
FEEDS: Dict[str, str] = {
    # ── abuse.ch ──────────────────────────────────────────────────────────────
    # Feodo Tracker — active C2 infrastructure for Dridex/Emotet/TrickBot/etc.
    "feodo_tracker": (
        "https://feodotracker.abuse.ch/downloads/ipblocklist.txt"
    ),
    # Feodo Tracker (aggressive) — broader C2 coverage incl. older/unconfirmed
    "feodo_tracker_aggressive": (
        "https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.txt"
    ),

    # ── BBcan177 (GitHub Gist) ───────────────────────────────────────────────
    # MS-1 curated malware IP list — Dridex, Zeus, Emotet, Regin, Cridex, etc.
    "bbcan177_ms1": (
        "https://gist.githubusercontent.com/BBcan177/"
        "bf29d47ea04391cb3eb0/raw/"
    ),

    # ── stamparm (GitHub) ─────────────────────────────────────────────────────
    # ipsum — aggregated threat score feed; first column = IP, second = score
    "ipsum": (
        "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt"
    ),

    # ── FireHOL (GitHub) ──────────────────────────────────────────────────────
    # FireHOL Level 1 — most reputable blocklists, very low false-positive rate
    "firehol_level1": (
        "https://raw.githubusercontent.com/firehol/blocklist-ipsets/"
        "master/firehol_level1.netset"
    ),
    # FireHOL Level 2 — broader coverage, still conservative
    "firehol_level2": (
        "https://raw.githubusercontent.com/firehol/blocklist-ipsets/"
        "master/firehol_level2.netset"
    ),
    # FireHOL Level 3 — tracks attacks, spyware, viruses from last 30 days
    "firehol_level3": (
        "https://raw.githubusercontent.com/firehol/blocklist-ipsets/"
        "master/firehol_level3.netset"
    ),

    # ── CINS Score ───────────────────────────────────────────────────────────
    # Collective Intelligence Networks Security — active attack sources
    "cins_army": (
        "https://cinsscore.com/list/ci-badguys.txt"
    ),

    # ── Emerging Threats ─────────────────────────────────────────────────────
    # Known compromised / attacker IPs compiled from Snort/Suricata rule sets
    "emerging_threats": (
        "https://rules.emergingthreats.net/blockrules/compromised-ips.txt"
    ),

    # ── blocklist.de ─────────────────────────────────────────────────────────
    # Honeypot-reported attacker IPs (SSH, FTP, mail, HTTP brute-force, etc.)
    "blocklist_de": (
        "https://lists.blocklist.de/lists/all.txt"
    ),

    # ── Binary Defense ───────────────────────────────────────────────────────
    # Binary Defense Systems Artillery Threat Intelligence Feed
    "binary_defense": (
        "https://binarydefense.com/banlist.txt"
    ),

    # ── GreenSnow ────────────────────────────────────────────────────────────
    # Bad-actors list maintained by GreenSnow security research team
    "greensnow": (
        "https://blocklist.greensnow.co/greensnow.txt"
    ),

    # ── Spamhaus (DROP) ──────────────────────────────────────────────────────
    # DROP — "Don't Route Or Peer" — hijacked netblocks used for spam/malware
    # (EDROP was merged into this list)
    "spamhaus_drop": (
        "https://www.spamhaus.org/drop/drop.txt"
    ),

    # ── Charles Haley (GitHub) ───────────────────────────────────────────────
    # Aggregated blocklist from multiple public threat sources
    "charles_haley_malware_ips": (
        "https://raw.githubusercontent.com/Ultimate-Hosts-Blacklist/"
        "Ultimate.Hosts.Blacklist/master/ips/ips0.list"
    ),

    # ── CriticalPathSecurity (GitHub) ────────────────────────────────────────
    # Public intelligence feed — compromised IPs
    "criticalpath_security": (
        "https://raw.githubusercontent.com/CriticalPathSecurity/"
        "Public-Intelligence-Feeds/master/compromised-ips.txt"
    ),

    # ── AlienVault ───────────────────────────────────────────────────────────
    # AlienVault IP reputation data — known malicious hosts
    "alienvault_reputation": (
        "http://reputation.alienvault.com/reputation.data"
    ),
}

ABUSEIPDB_API_KEY: Optional[str] = os.environ.get("ABUSEIPDB_API_KEY")
if ABUSEIPDB_API_KEY:
    FEEDS["abuseipdb"] = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=90"

# ─────────────────────────────────────────────────────────────────────────────
# Tuning constants
# ─────────────────────────────────────────────────────────────────────────────
REQUEST_TIMEOUT: int = 30   # seconds before abandoning a request
CIDR_MAX_PREFIX: int = 24   # only expand CIDR blocks with prefix >= this (i.e. /24–/32)
MAX_RETRIES: int = 3        # retry attempts per feed before giving up
RETRY_DELAY: int = 5        # seconds to wait between retry attempts
MAX_WORKERS: int = 8        # maximum concurrent download threads

# ─────────────────────────────────────────────────────────────────────────────
# Regular expressions
# ─────────────────────────────────────────────────────────────────────────────
# Strict IPv4: no leading zeros, all octets 0–255
_IPV4_PATTERN = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}"
    r"(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$"
)

# Private, loopback, link-local, documentation, multicast, and reserved ranges.
# RFC 1918, RFC 5737, RFC 3927, RFC 6598, RFC 2544, etc.
_PRIVATE_PATTERN = re.compile(
    r"^(?:"
    r"0\."                              # 0.0.0.0/8      — "this" network
    r"|10\."                            # 10.0.0.0/8     — RFC 1918 private
    r"|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\."  # 100.64/10 — CGNAT (RFC 6598)
    r"|127\."                           # 127.0.0.0/8    — loopback
    r"|169\.254\."                      # 169.254.0.0/16 — link-local
    r"|172\.(?:1[6-9]|2\d|3[01])\."    # 172.16.0.0/12  — RFC 1918 private
    r"|192\.0\.0\."                     # 192.0.0.0/24   — IANA special-purpose
    r"|192\.0\.2\."                     # 192.0.2.0/24   — TEST-NET-1
    r"|192\.168\."                      # 192.168.0.0/16 — RFC 1918 private
    r"|198\.1[89]\."                    # 198.18.0.0/15  — benchmarking (RFC 2544)
    r"|198\.51\.100\."                  # 198.51.100.0/24 — TEST-NET-2
    r"|203\.0\.113\."                   # 203.0.113.0/24  — TEST-NET-3
    r"|2(?:2[4-9]|[3-5]\d)\."          # 224.0.0.0/4    — multicast + reserved
    r"|255\.255\.255\.255"              # 255.255.255.255 — limited broadcast
    r")"
)


# ─────────────────────────────────────────────────────────────────────────────
# IP validation
# ─────────────────────────────────────────────────────────────────────────────

def is_valid_public_ipv4(ip: str) -> bool:
    """
    Return True if *ip* is a syntactically valid, publicly-routable IPv4 address.

    Rejects:
      - Malformed / non-IPv4 strings
      - Private RFC 1918 addresses (10/8, 172.16/12, 192.168/16)
      - Loopback (127/8)
      - Link-local (169.254/16)
      - CGNAT (100.64/10)
      - Documentation ranges (192.0.2/24, 198.51.100/24, 203.0.113/24)
      - Multicast (224/4) and reserved (240/4)
      - Broadcast (255.255.255.255)
    """
    return bool(_IPV4_PATTERN.match(ip)) and not bool(_PRIVATE_PATTERN.match(ip))


# ─────────────────────────────────────────────────────────────────────────────
# Feed parsing
# ─────────────────────────────────────────────────────────────────────────────

def extract_ips(raw_text: str) -> Set[str]:
    """
    Parse raw feed text and return a set of valid public IPv4 addresses.

    Handles the following feed formats transparently:
      - Plain IP list                        — one IP per line
      - Comment lines ('#', ';', '//')       — skipped
      - IP:PORT format                       — port stripped
      - IP#score#data (AlienVault)            — first '#'-delimited field taken
      - IP<TAB>score  (ipsum)                — first token taken
      - IP  # inline comment                 — first token taken
      - CIDR notation (1.2.3.0/24)          — expanded for small blocks (≥/24)
      - Large CIDR blocks (< /24)           — skipped (too many IPs)
      - Windows CRLF line endings           — normalised by splitlines()
    """
    ips: Set[str] = set()

    for raw_line in raw_text.splitlines():
        line = raw_line.strip()

        # Skip blank lines and comment lines
        if not line:
            continue
        if line[0] in ("#", ";") or line.startswith("//"):
            continue

        # Take only the first whitespace-delimited token.
        # This handles "IP  # comment", "IP\tscore", "IP  SBL-code" etc.
        token = line.split()[0]

        # Handle '#'-delimited format (AlienVault: "IP#score#...")
        if "#" in token:
            token = token.split("#")[0]

        # Strip port if the token contains a colon (IP:PORT)
        if ":" in token:
            token = token.rsplit(":", 1)[0]

        # Handle CIDR entries — expand small blocks into individual IPs
        if "/" in token:
            try:
                network = ipaddress.IPv4Network(token, strict=False)
                if network.prefixlen >= CIDR_MAX_PREFIX:
                    for host in network.hosts():
                        host_str = str(host)
                        if is_valid_public_ipv4(host_str):
                            ips.add(host_str)
            except (ipaddress.AddressValueError, ipaddress.NetmaskValueError, ValueError):
                pass  # skip malformed CIDR entries
            continue

        if is_valid_public_ipv4(token):
            ips.add(token)

    return ips


# ─────────────────────────────────────────────────────────────────────────────
# Feed downloading
# ─────────────────────────────────────────────────────────────────────────────

def fetch_feed(name: str, url: str) -> Tuple[str, Set[str], Optional[str]]:
    """
    Download a single feed URL with configurable retry logic.

    Returns
    -------
    Tuple[str, Set[str], Optional[str]]
        (feed_name, set_of_ips, error_message_or_None)
        On success *error* is None. On total failure *ips* is an empty set.
    """
    last_error: Optional[str] = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log.info("[%s] downloading (attempt %d/%d) …", name, attempt, MAX_RETRIES)
            
            headers = {
                "User-Agent": (
                    "HimalayaFeed/1.0 "
                    "(github.com/kalidada18/himalayafeed; automated threat-intel collector)"
                )
            }
            if name == "abuseipdb" and ABUSEIPDB_API_KEY:
                headers["Key"] = ABUSEIPDB_API_KEY
                headers["Accept"] = "text/plain"

            response = requests.get(
                url,
                timeout=REQUEST_TIMEOUT,
                headers=headers,
                allow_redirects=True,
            )
            response.raise_for_status()
            ips = extract_ips(response.text)
            log.info("[%s] success — %d valid IPs extracted", name, len(ips))
            return name, ips, None

        except requests.exceptions.Timeout:
            last_error = f"timed out after {REQUEST_TIMEOUT}s"
        except requests.exceptions.HTTPError as exc:
            last_error = f"HTTP {exc.response.status_code}"
        except requests.exceptions.ConnectionError as exc:
            last_error = f"connection error: {exc}"
        except Exception as exc:  # noqa: BLE001 — intentional broad catch
            last_error = str(exc)

        log.warning("[%s] attempt %d/%d failed: %s", name, attempt, MAX_RETRIES, last_error)
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY)

    log.error("[%s] all %d attempts failed — feed skipped", name, MAX_RETRIES)
    return name, set(), last_error


def download_all_feeds(
    feeds: Dict[str, str],
) -> Tuple[Dict[str, Set[str]], List[str]]:
    """
    Download every feed concurrently using a thread pool.

    Returns
    -------
    Tuple[Dict[str, Set[str]], List[str]]
        (ip_sources, failed_feed_names)
        *ip_sources* maps each successful feed name to its set of IPs.
        *failed_feed_names* lists every feed that could not be downloaded.
    """
    ip_sources: Dict[str, Set[str]] = {}
    failed: List[str] = []

    log.info("Starting concurrent download of %d feeds …", len(feeds))

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(fetch_feed, name, url): name
            for name, url in feeds.items()
        }
        for future in as_completed(futures):
            name, ips, error = future.result()
            if error is None:
                ip_sources[name] = ips
            else:
                failed.append(name)

    log.info(
        "Downloads complete: %d succeeded, %d failed",
        len(ip_sources),
        len(failed),
    )
    return ip_sources, failed


# ─────────────────────────────────────────────────────────────────────────────
# Data processing
# ─────────────────────────────────────────────────────────────────────────────

def build_ip_source_map(
    ip_sources: Dict[str, Set[str]],
) -> Dict[str, List[str]]:
    """
    Invert the ip_sources mapping to build: IP → sorted list of source names.

    Deduplication is implicit: each IP key is unique in the returned dict.
    IPs appearing in multiple feeds get all their source names listed.
    """
    ip_map: Dict[str, List[str]] = {}

    for source_name, ip_set in ip_sources.items():
        for ip in ip_set:
            ip_map.setdefault(ip, []).append(source_name)

    # Sort source lists for deterministic, diff-friendly output
    for ip in ip_map:
        ip_map[ip].sort()

    return ip_map


def numerical_ip_key(ip: str) -> Tuple[int, ...]:
    """Return a tuple of ints for numerically correct IPv4 sorting."""
    return tuple(int(octet) for octet in ip.split("."))


def build_stats(
    ip_map: Dict[str, List[str]],
    ip_sources: Dict[str, Set[str]],
    failed: List[str],
    timestamp: str,
) -> dict:
    """Assemble the complete stats.json payload."""
    return {
        "last_updated":          timestamp,
        "total_unique_ips":      len(ip_map),
        "total_feeds_processed": len(ip_sources),
        "total_feeds_failed":    len(failed),
        "failed_feeds":          sorted(failed),
        "ips_per_source": {
            src: len(ips)
            for src, ips in sorted(ip_sources.items())
        },
        "multi_source_ips": sum(
            1 for sources in ip_map.values() if len(sources) > 1
        ),
        "top_reported_sources": [
            [src, len(ips)]
            for src, ips in sorted(
                ip_sources.items(),
                key=lambda kv: len(kv[1]),
                reverse=True,
            )[:5]
        ] if ip_sources else [],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Output writing
# ─────────────────────────────────────────────────────────────────────────────

def write_txt(
    sorted_ips: List[str],
    stats: dict,
) -> None:
    """Write malicious_ips.txt — one IPv4 per line, with a comment header."""
    ts = stats["last_updated"]
    header_lines = [
        f"# HimalayaFeed — Threat Intelligence Feed — updated {ts}",
        f"# Total unique IPs : {len(sorted_ips)}",
        f"# Sources used     : {stats['total_feeds_processed']}",
        "# Format           : one IPv4 address per line",
        "# Project          : https://github.com/kalidada18/himalayafeed",
        "",  # blank separator before data
    ]
    with open("malicious_ips.txt", "w", encoding="utf-8") as fh:
        fh.write("\n".join(header_lines))
        fh.write("\n".join(sorted_ips))
        fh.write("\n")
    log.info("malicious_ips.txt written (%d IPs)", len(sorted_ips))


def write_csv(
    sorted_ips: List[str],
    ip_map: Dict[str, List[str]],
) -> None:
    """Write malicious_ips.csv — ip, sources (pipe-separated), source_count."""
    rows = [
        {
            "ip":           ip,
            "sources":      "|".join(ip_map[ip]),
            "source_count": len(ip_map[ip]),
        }
        for ip in sorted_ips
    ]
    df = pd.DataFrame(rows, columns=["ip", "sources", "source_count"])
    df.to_csv("malicious_ips.csv", index=False)
    log.info("malicious_ips.csv written (%d rows)", len(df))


def write_stats(stats: dict) -> None:
    """Write stats.json — aggregate statistics consumed by the live dashboard."""
    with open("stats.json", "w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=2)
    log.info("stats.json written")


def write_history(stats: dict) -> None:
    """Maintain a rolling 90-day history of feed metrics."""
    history_file = "history.json"
    history = []
    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            pass
            
    history.append({
        "date": stats["last_updated"].split("T")[0],
        "total_unique_ips": stats["total_unique_ips"],
        "active_feeds": stats["total_feeds_processed"]
    })
    
    # Deduplicate by date, keeping the latest run for each day
    deduped = {entry["date"]: entry for entry in history}
    history = list(deduped.values())
    
    # Keep last 90 days
    history = sorted(history, key=lambda x: x["date"])[-90:]
    
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)
    log.info("history.json written (%d records)", len(history))
def write_all_outputs(
    ip_map: Dict[str, List[str]],
    stats: dict,
) -> None:
    """Orchestrate writing of all output artefacts."""
    # Numerically sorted IPs for deterministic, human-readable diffs
    sorted_ips = sorted(ip_map.keys(), key=numerical_ip_key)

    write_txt(sorted_ips, stats)
    write_csv(sorted_ips, ip_map)
    write_stats(stats)
    write_history(stats)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("═" * 55)
    log.info("  HimalayaFeed — Threat Intelligence Feed Aggregator")
    log.info("═" * 55)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Step 1: Download all feeds concurrently ──────────────────────────────
    ip_sources, failed = download_all_feeds(FEEDS)

    # Abort only if every single feed failed — partial failures are tolerated
    if not ip_sources:
        log.critical(
            "All %d feeds failed. Cannot produce output. Exiting with error.",
            len(FEEDS),
        )
        raise SystemExit(1)

    # ── Step 2: Build unified IP → sources mapping ───────────────────────────
    ip_map = build_ip_source_map(ip_sources)
    log.info(
        "Merged %d sources → %d unique public IPv4 addresses",
        len(ip_sources),
        len(ip_map),
    )

    # ── Step 3: Build statistics payload ─────────────────────────────────────
    stats = build_stats(ip_map, ip_sources, failed, timestamp)
    log.info("Stats snapshot:\n%s", json.dumps(
        {k: v for k, v in stats.items() if k != "top_reported_sources"},
        indent=2,
    ))

    # ── Step 4: Write all output files ───────────────────────────────────────
    write_all_outputs(ip_map, stats)

    log.info("═" * 55)
    log.info("  Done — feed updated at %s", timestamp)
    log.info("═" * 55)


if __name__ == "__main__":
    main()
