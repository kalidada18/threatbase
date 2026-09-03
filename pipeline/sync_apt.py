# --- pipeline/sync_apt.py ---

#!/usr/bin/env python3
"""
Threatbase — Top APT Attackers of the Day
==========================================
Queries AlienVault OTX actor pulse endpoint (free-tier accessible) for a
curated registry of well-known APT groups, counts pulses modified in the
last 24h / 7d per group, and writes ioc/top_apt.json (powers /top-apt).

Switched from /api/v1/search/pulses/ (restricted to paid tier as of 2025)
to /api/v1/actors/{slug}/pulses — same data, different surface, no paywall.
Actor slugs are mapped explicitly in APT_GROUPS; aliases still used for
secondary blob matching inside returned pulses.
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s]  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

BASE = "https://otx.alienvault.com/api/v1"
API_KEY = os.environ.get("OTX_API_KEY", "").strip()
PULSES_PER_GROUP = 25
DAY_WINDOW = timedelta(hours=24)
WEEK_WINDOW = timedelta(days=7)
MAX_CAMPAIGNS = 12
RUN_DEADLINE = timedelta(minutes=5)
WORKERS = 5

# (canonical name, otx_actor_slug, [aliases], attributed sponsor)
# Slug = the URL path segment on otx.alienvault.com/actor/<slug>
# If a group has no OTX actor page, slug=None → falls back to
# /api/v1/search/pulses/ with the first alias (best-effort).
APT_GROUPS = [
    ("APT28",             "apt28",             ["APT28", "Fancy Bear", "Sofacy", "STRONTIUM"],          "Russia (GRU)"),
    ("APT29",             "apt29",             ["APT29", "Cozy Bear", "The Dukes", "NOBELIUM"],          "Russia (SVR)"),
    ("APT41",             "apt41",             ["APT41", "Winnti", "BARIUM", "Wicked Panda"],            "China (MSS)"),
    ("APT10",             "apt10",             ["APT10", "MenuPass", "Stone Panda", "Red Apollo"],       "China (MSS)"),
    ("Hafnium",           "hafnium",           ["Hafnium", "MS-ALPHAROCK", "TA45"],                      "China (MSS)"),
    ("Mustang Panda",     "mustang-panda",     ["Mustang Panda", "RedDelta", "HELIOSCRM", "TA400"],      "China (MSS)"),
    ("APT32",             "apt32",             ["APT32", "OceanLotus", "Sea Lotus"],                     "Vietnam"),
    ("Lazarus Group",     "lazarus-group",     ["Lazarus", "APT38", "Hidden Cobra", "BlueNoroff"],       "North Korea"),
    ("Kimsuky",           "kimsuky",           ["Kimsuky", "APT43", "Thallium", "Velvet Chollima"],      "North Korea"),
    ("APT37",             "apt37",             ["APT37", "Reaper", "Richochet", "Group123"],             "North Korea"),
    ("Scarce Caiman",     None,                ["Scarce Caiman", "Tonto Team", "EMPIRE BEAK"],           "North Korea"),
    ("APT33",             "apt33",             ["APT33", "Elfin", "Magnallium"],                         "Iran"),
    ("APT34",             "apt34",             ["APT34", "OilRig", "Helix Kitten"],                      "Iran"),
    ("APT35",             "apt35",             ["APT35", "Charming Kitten", "Magic Hound"],              "Iran (IRGC)"),
    ("APT39",             "apt39",             ["APT39", "Chafer", "Iridium"],                           "Iran"),
    ("MuddyWater",        "muddywater",        ["MuddyWater", "Mercury", "STATIC KITTEN", "Seedur"],     "Iran (MOIS)"),
    ("Sandworm",          "sandworm",          ["Sandworm", "Voodoo Bear", "IRON VAULT", "BLACKENERGY"], "Russia (GRU)"),
    ("Turla",             "turla",             ["Turla", "Dragonfly", "CRONY", "Uroburos"],              "Russia"),
    ("Gamaredon",         "gamaredon",         ["Gamaredon", "Primitive Bear", "ShallowBurrow"],         "Russia (GRU)"),
    ("SideWinder",        "sidewinder",        ["SideWinder", "Ropycoder", "TargetedThreatCluster"],     "Suspected India"),
    ("Transparent Tribe", "transparent-tribe", ["Transparent Tribe", "Krypton", "In-Trode"],             "Suspected India/Pakistan"),
]


def _get(url: str, params: dict) -> dict | None:
    """
    GET with X-OTX-API-KEY header, 4-attempt retry on transient errors only.
    403 → auth/entitlement failure → no retry, returns None immediately.
    429 → rate limited → back off longer before retry.
    """
    headers = {"X-OTX-API-KEY": API_KEY, "Accept": "application/json"}
    for attempt in range(4):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=45)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 403:
                log.error("OTX 403 on %s — endpoint requires paid tier or slug invalid. No retry.", url)
                return None
            if r.status_code == 404:
                log.warning("OTX 404 on %s — actor slug not found.", url)
                return None
            wait = 10 * (attempt + 1) if r.status_code == 429 else 3 * (attempt + 1)
            log.warning("OTX %d on %s (attempt %d) — retrying in %ds", r.status_code, url, attempt + 1, wait)
            time.sleep(wait)
        except (requests.RequestException, ValueError) as exc:
            log.warning("OTX request error on %s (attempt %d): %s", url, attempt + 1, exc)
            time.sleep(3 * (attempt + 1))
    return None


def fetch_actor_pulses(slug: str | None, fallback_query: str) -> list:
    """
    Primary: GET /api/v1/actors/{slug}/pulses — free-tier, returns pulses
             attributed to the actor on OTX.
    Fallback: GET /api/v1/search/pulses/ — paid-tier; used only when slug=None
              (group has no OTX actor page). Logs a warning if it 403s.
    """
    if slug is not None:
        url = f"{BASE}/actors/{slug}/pulses"
        data = _get(url, {"limit": PULSES_PER_GROUP, "sort": "-modified"})
        if data is not None:
            # Actor pulse endpoint wraps results under 'results' key
            return data.get("results", [])
        # 403 on actor endpoint — slug wrong or account issue; fall through
        log.warning("Actor endpoint failed for slug=%r — falling back to search.", slug)

    # Fallback: search endpoint (may 403 on free tier)
    url = f"{BASE}/search/pulses/"
    data = _get(url, {"q": fallback_query, "limit": PULSES_PER_GROUP, "sort": "-modified"})
    if data is None:
        return []
    return data.get("results", [])


def matches(pulse: dict, aliases: list) -> bool:
    """
    Word-boundary, case-insensitive alias match against pulse metadata.
    Used as a secondary filter on actor-endpoint results (which may include
    pulses that mention the actor only tangentially).
    """
    blob = " ".join(
        [pulse.get("name", ""), pulse.get("description", "")]
        + [t["name"] if isinstance(t, dict) else str(t) for t in pulse.get("tags", [])]
        + list(pulse.get("adversary", []))
    ).lower()
    return any(re.search(r"\b" + re.escape(a.lower()) + r"\b", blob) for a in aliases)


def collect_group(name: str, slug: str | None, aliases: list, sponsor: str, now: datetime):
    """One group's leaderboard entry, or None if no activity in the 7d window."""
    raw = fetch_actor_pulses(slug, aliases[0])

    # For actor-endpoint results, skip the alias blob-match — OTX already
    # attributed these pulses to the actor. For search fallback, still filter.
    if slug is not None:
        matched = raw
    else:
        matched = [p for p in raw if matches(p, aliases)]

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
        futs = {ex.submit(collect_group, name, slug, aliases, sponsor, now): name
                for name, slug, aliases, sponsor in APT_GROUPS}
        done, pending = wait(futs, timeout=RUN_DEADLINE.total_seconds())
        if pending:
            for f in pending:
                f.cancel()
            log.error(
                "OTX still unavailable after %s (stuck on: %s) — not writing top_apt.json.",
                RUN_DEADLINE,
                ", ".join(futs[f] for f in pending),
            )
            return 1

    actors = [a for a in (f.result() for f in done) if a]
    if not actors:
        log.error("All OTX searches returned nothing — not writing top_apt.json.")
        return 1

    actors.sort(key=lambda a: (a["pulses_24h"], a["pulses_7d"]), reverse=True)
    out = {
        "generated_at": now.isoformat(timespec="seconds"),
        "source": "AlienVault OTX actor pulses",
        "note": (
            "Activity = threat-intel pulses attributed to the actor on OTX in the window. "
            "Vendor/community reporting — follow each link to its source."
        ),
        "actors": actors,
    }
    os.makedirs("ioc", exist_ok=True)
    with open("ioc/top_apt.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    log.info("Wrote ioc/top_apt.json (%d active groups)", len(actors))
    return 0


if __name__ == "__main__":
    sys.exit(main())
