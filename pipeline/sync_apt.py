#!/usr/bin/env python3
"""
Threatbase — Top APT Attackers of the Day
==========================================
Queries AlienVault OTX pulse search for a curated registry of well-known APT
groups, counts pulses modified in the last 24h / 7d per group, and writes
ioc/data/top_apt.json (powers /top-apt). Campaign list = the matching pulse titles
with links back to the source pulse.

Requires OTX_API_KEY (GitHub Secret, already wired in update-feed.yml).
If the key is absent the script warns and exits 0 — the previous
top_apt.json stays published instead of failing the whole feed run.

ponytail: registry is curated by hand, not parsed from the ~40 MB MITRE
ATT&CK bundle, and matching is substring-on-tags, not entity resolution.
Add a group = one line. If the leaderboard ever needs full ATT&CK coverage,
switch the registry load to the STIX bundle.
"""

import json
import logging
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger(__name__)

BASE = "https://otx.alienvault.com/api/v1"
API_KEY = os.environ.get("OTX_API_KEY", "").strip()
PULSES_PER_GROUP = 25          # newest pulses fetched per group
DAY_WINDOW = timedelta(hours=24)
WEEK_WINDOW = timedelta(days=7)
MAX_CAMPAIGNS = 12             # campaigns kept per group in the output
RUN_DEADLINE = timedelta(minutes=5)  # OTX search 504s under load; never hang CI
WORKERS = 5                          # ~25s per search at worst; 21 groups in ~2 min

# (canonical name, [aliases matched against adversary/tags/title], attributed sponsor)
APT_GROUPS = [
    ("APT28",            ["APT28", "Fancy Bear", "Sofacy", "STRONTIUM"], "Russia (GRU)"),
    ("APT29",            ["APT29", "Cozy Bear", "The Dukes", "NOBELIUM"], "Russia (SVR)"),
    ("APT41",            ["APT41", "Winnti", "BARIUM", "Wicked Panda"], "China (MSS)"),
    ("APT10",            ["APT10", "MenuPass", "Stone Panda", "Red Apollo"], "China (MSS)"),
    ("Hafnium",          ["Hafnium", "MS-ALPHAROCK", "TA45"], "China (MSS)"),
    ("Mustang Panda",    ["Mustang Panda", "RedDelta", "HELIOSCRM", "TA400"], "China (MSS)"),
    ("APT32",            ["APT32", "OceanLotus", "Sea Lotus"], "Vietnam"),
    ("Lazarus Group",    ["Lazarus", "APT38", "Hidden Cobra", "BlueNoroff"], "North Korea"),
    ("Kimsuky",          ["Kimsuky", "APT43", "Thallium", "Velvet Chollima"], "North Korea"),
    ("APT37",            ["APT37", "Reaper", "Richochet", "Group123"], "North Korea"),
    ("Scarce Caiman",    ["Scarce Caiman", "Tonto Team", "EMPIRE BEAK", "Blue Mimicry"], "North Korea"),
    ("APT33",            ["APT33", "Elfin", "Magnallium"], "Iran"),
    ("APT34",            ["APT34", "OilRig", "Helix Kitten"], "Iran"),
    ("APT35",            ["APT35", "Charming Kitten", "Magic Hound"], "Iran (IRGC)"),
    ("APT39",            ["APT39", "Chafer", "Iridium"], "Iran"),
    ("MuddyWater",       ["MuddyWater", "Mercury", "STATIC KITTEN", "Seedur"], "Iran (MOIS)"),
    ("Sandworm",         ["Sandworm", "Voodoo Bear", "IRON VAULT", "BLACKENERGY"], "Russia (GRU)"),
    ("Turla",            ["Turla", "Dragonfly", "CRONY", "Uroburos"], "Russia"),
    ("Gamaredon",        ["Gamaredon", "Primitive Bear", "ShallowBurrow"], "Russia (GRU)"),
    ("SideWinder",       ["SideWinder", "Ropycoder", "TargetedThreatCluster"], "Suspected India"),
    ("Transparent Tribe",["Transparent Tribe", "Krypton", "In-Trode"], "Suspected India/Pakistan"),
]


def search_pulses(query: str) -> list:
    """Newest pulses matching `query`, with small retry/backoff."""
    url = f"{BASE}/search/pulses/"
    params = {"q": query, "limit": PULSES_PER_GROUP, "sort": "-modified"}
    headers = {"X-OTX-API-KEY": API_KEY, "Accept": "application/json"}
    for attempt in range(4):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=45)
            if r.status_code == 200:
                return r.json().get("results", [])
            log.warning("  OTX %s for q=%r (attempt %d)", r.status_code, query, attempt + 1)
        except (requests.RequestException, ValueError):
            log.warning("  OTX error for q=%r (attempt %d)", query, attempt + 1)
        time.sleep(3 * (attempt + 1))
    return []


def matches(pulse: dict, aliases: list) -> bool:
    """Word-boundary, case-insensitive match of any alias in the pulse metadata.
    OTX full-text search also hits description-only mentions; counting those as
    activity is fine for a leaderboard — the pulse still links to its source."""
    blob = " ".join(
        [pulse.get("name", ""), pulse.get("description", "")]
        + [t["name"] if isinstance(t, dict) else str(t) for t in pulse.get("tags", [])]
        + list(pulse.get("adversary", []))
    ).lower()
    return any(re.search(r"\b" + re.escape(a.lower()) + r"\b", blob) for a in aliases)


def collect_group(name: str, aliases: list, sponsor: str, now: datetime):
    """One group's leaderboard entry, or None if no activity in the window."""
    matched = [p for p in search_pulses(aliases[0]) if matches(p, aliases)]
    campaigns, c24 = [], 0
    malware, countries = Counter(), Counter()
    for p in matched:
        try:
            mod = datetime.fromisoformat(p["modified"]).replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        if now - mod > WEEK_WINDOW:
            continue
        fresh = now - mod <= DAY_WINDOW
        c24 += fresh
        campaigns.append({
            "title": p["name"],
            "url": f"https://otx.alienvault.com/pulse/{p['id']}",
            "modified": p["modified"],
            "last_24h": fresh,
        })
        for m in p.get("malware_families", []):
            if isinstance(m, str) and m.strip():
                malware[m.strip()] += 1
        for c in p.get("targeted_countries", []):
            label = c.get("name") if isinstance(c, dict) else c
            if isinstance(label, str) and label.strip():
                countries[label.strip()] += 1
    campaigns.sort(key=lambda c: c["modified"], reverse=True)
    log.info("  %-17s %d active (7d), %d in 24h", name, len(campaigns), c24)
    if not campaigns:
        return None
    return {
        "name": name,
        "aka": [a for a in aliases if a != name],
        "sponsor": sponsor,
        "pulses_24h": c24,
        "pulses_7d": len(campaigns),
        "malware": [m for m, _ in malware.most_common(4)],
        "targets": [c for c, _ in countries.most_common(4)],
        "campaigns": campaigns[:MAX_CAMPAIGNS],
    }


def main() -> int:
    if not API_KEY:
        log.warning("OTX_API_KEY not set — skipping APT leaderboard sync (keeping previous top_apt.json).")
        return 0

    now = datetime.now(timezone.utc)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(collect_group, *g, now): g[0] for g in APT_GROUPS}
        done, pending = wait(futs, timeout=RUN_DEADLINE.total_seconds())
        if pending:
            # Partial results would overwrite a complete leaderboard with a
            # misleading "top" — fail the run and keep the previous file instead.
            for f in pending:
                f.cancel()
            log.error("OTX still unavailable after %s (stuck on: %s) — not writing top_apt.json.",
                      RUN_DEADLINE, ", ".join(futs[f] for f in pending))
            return 1

    actors = [a for a in (f.result() for f in done) if a]
    if not actors:
        # Zero hits for all 21 groups across a week cannot be real; every
        # search silently failed (504 -> []). Same rule as the deadline:
        # never overwrite a complete leaderboard with an empty one.
        log.error("All OTX searches returned nothing — not writing top_apt.json.")
        return 1
    actors.sort(key=lambda a: (a["pulses_24h"], a["pulses_7d"]), reverse=True)
    out = {
        "generated_at": now.isoformat(timespec="seconds"),
        "source": "AlienVault OTX pulse search",
        "note": "Activity = threat-intel pulses (campaign reports) mentioning the group in the window. Vendor/community reporting — follow each link to its source.",
        "actors": actors,
    }
    os.makedirs("ioc/data", exist_ok=True)
    with open("ioc/data/top_apt.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    log.info("Wrote ioc/data/top_apt.json (%d active groups)", len(actors))
    return 0


if __name__ == "__main__":
    sys.exit(main())
