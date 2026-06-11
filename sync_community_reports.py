#!/usr/bin/env python3
"""
HimalayaFeed — Sync Community-Reported IPs from Supabase
========================================================
Fetches new (unprocessed) reports from the Supabase `reported_ips` table,
appends them to `custom_iocs.txt` (which update_feed.py already reads),
marks them as processed in Supabase, and backs up to `public/ioc/community_reports.json`.
"""

import json
import os
import sys
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Supabase Credentials (from GitHub Secrets) ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    log.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.")
    log.error("Set them as GitHub Secrets and pass them in the workflow.")
    sys.exit(1)

try:
    import requests
except ImportError:
    log.error("requests library not found. Install with: pip install requests")
    sys.exit(1)


HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def fetch_unprocessed_reports():
    """Fetch all reports where processed_at IS NULL (new reports)."""
    url = f"{SUPABASE_URL}/rest/v1/reported_ips"
    params = {
        "select": "id,ip,category,comment,created_at",
        "processed_at": "is.null",
        "order": "created_at.asc",
    }

    r = requests.get(url, headers={**HEADERS, "Prefer": ""}, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def mark_as_processed(report_ids):
    """Update reports to set processed_at = now()."""
    if not report_ids:
        return

    url = f"{SUPABASE_URL}/rest/v1/reported_ips"

    # Batch update: PATCH where id IN (...)
    id_filter = ",".join(report_ids)
    params = {"id": f"in.({id_filter})"}
    body = {"processed_at": datetime.now(timezone.utc).isoformat()}

    r = requests.patch(url, headers=HEADERS, params=params, json=body, timeout=30)
    r.raise_for_status()
    log.info(f"  Marked {len(report_ids)} reports as processed in Supabase")


def append_to_custom_iocs(ips):
    """Append new IPs to custom_iocs.txt (read by update_feed.py)."""
    if not ips:
        return

    filename = "custom_iocs.txt"

    # Load existing to avoid duplicates
    existing = set()
    if os.path.exists(filename):
        with open(filename, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith(("#", "//")):
                    existing.add(line)

    new_ips = [ip for ip in ips if ip not in existing]

    if not new_ips:
        log.info("  All community IPs already in custom_iocs.txt, nothing to add")
        return

    with open(filename, "a", encoding="utf-8") as f:
        f.write(f"\n# Community-reported IPs (synced {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')})\n")
        for ip in new_ips:
            f.write(ip + "\n")

    log.info(f"  Appended {len(new_ips)} new IPs to {filename}")


def backup_to_json(reports):
    """Save a full backup of community reports to public/ioc/community_reports.json."""
    backup_file = "public/ioc/community_reports.json"

    existing = []
    if os.path.exists(backup_file):
        try:
            with open(backup_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = []

    # Add new reports
    existing_ids = {r.get("id") for r in existing}
    for report in reports:
        if report["id"] not in existing_ids:
            existing.append(report)

    # Sort by created_at
    existing.sort(key=lambda x: x.get("created_at", ""))

    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    log.info(f"  Backed up {len(existing)} total reports to {backup_file}")


def main():
    log.info("═" * 55)
    log.info("  HimalayaFeed — Community Report Sync")
    log.info("═" * 55)

    # 1. Fetch unprocessed reports from Supabase
    log.info("Fetching unprocessed community reports from Supabase...")
    reports = fetch_unprocessed_reports()
    log.info(f"  Found {len(reports)} new reports")

    if not reports:
        log.info("No new community reports. Done!")
        return

    # 2. Extract valid IPs
    import re
    ipv4_pattern = re.compile(
        r"^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}"
        r"(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$"
    )

    valid_ips = []
    for report in reports:
        ip = report.get("ip", "").strip()
        if ipv4_pattern.match(ip):
            valid_ips.append(ip)
        else:
            log.warning(f"  Skipping invalid IP: {ip}")

    log.info(f"  {len(valid_ips)} valid IPv4 addresses extracted")

    # 3. Append to custom_iocs.txt
    log.info("Adding community IPs to custom_iocs.txt...")
    append_to_custom_iocs(valid_ips)

    # 4. Backup to JSON
    log.info("Backing up reports to public/ioc/community_reports.json...")
    backup_to_json(reports)

    # 5. Mark as processed in Supabase
    log.info("Marking reports as processed in Supabase...")
    report_ids = [r["id"] for r in reports]
    mark_as_processed(report_ids)

    log.info(f"✓ Done! {len(valid_ips)} community IPs will be merged in next feed update.")


if __name__ == "__main__":
    main()
