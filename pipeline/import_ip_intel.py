#!/usr/bin/env python3
"""
Threatbase — Bulk-import an IP threat corpus into Supabase `ip_intel`
=====================================================================
Reads a CSV (header: ip, score[, malicious, source, first_seen, last_seen])
and upserts it via the public.upsert_ip_intel RPC in batches — never one
request per row. ~900K rows import in a few hundred requests.

Usage (from repo root):
  set SUPABASE_URL=... and SUPABASE_SERVICE_KEY=...   (never in the CSV,
  never committed; same secrets the CI pipeline uses)
  python pipeline/import_ip_intel.py data.csv
  python pipeline/import_ip_intel.py data.csv --batch 5000 --dry-run
  python pipeline/import_ip_intel.py data.csv --resume   # after a crash

  Import the repo's own feed files (lossless migration):
  python pipeline/import_ip_intel.py ioc/ip/threatbase-ip.txt --format feed
  python pipeline/import_ip_intel.py ioc/ip/threatbase-ipv6.txt --format feed
  ('--format feed' skips '#...' comments; the CIDR feed does not import —
  inet holds single addresses, ranges stay a separate concern.)

Design:
  - Merge is monotonic (GREATEST score, OR malicious) inside the RPC, so a
    re-run or a partial retry can never lower existing intelligence.
  - Every successfully-sent batch's line offset is journaled to
    <csv>.job.jsonl; --resume replays only what never completed. A crash
    mid-run costs at most one in-flight batch, which is safe to resend.
  - Malformed rows (bad IP, score outside 0-100, junk) are counted and
    reported, never sent. Nothing is "fixed" silently.
  - HTTP 429/5xx retries with backoff; a batch that fails after all retries
    is journaled as failed and the run stops non-zero (resume to continue).
"""

import argparse
import csv
import ipaddress
import json
import os
import random
import sys
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("requests library not found. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()

# Threatbase RiskScore tiers -> numeric score. HIGH dominates the feed
# (>99.9% of rows); the mapping is documented in db/ip_intel.sql and is the
# single source of truth for feed-imported scores.
TIER_SCORE = {"HIGH": 90, "MEDIUM": 60, "LOW": 20, "UNKNOWN": 20}


def parse_feed_line(line):
    """threatbase-ip.txt / -ipv6.txt line -> validated row dict, or raise ValueError.

    ip.txt : IP,FeedCount,RiskScore,Tags,FirstSeen,LastSeen[,Sources]
    ipv6   : IPv6,LastSeen              (every listed v6 address is malicious)
    """
    parts = line.rstrip("\r\n").split(",")
    if len(parts) >= 6:  # ip.txt shape
        ip_raw = parts[0].strip()
        ip = str(ipaddress.ip_address(ip_raw))
        try:
            feed_count = max(1, int(parts[1]))
        except ValueError:
            feed_count = 1
        tier = parts[2].strip().upper()
        if tier not in TIER_SCORE:
            raise ValueError(f"unknown RiskScore: {parts[2]!r}")
        tags = parts[3].strip()
        out = {
            "ip": ip,
            "score": TIER_SCORE[tier],
            "malicious": True,  # listed on >=1 feed = positive verdict
            "feed_count": feed_count,
            "tags": tags,
            "first_seen": parts[4].strip(),
            "last_seen": parts[5].strip(),
        }
        src = ",".join(parts[6:]).strip()
        if src:
            out["source"] = src
        return out
    if len(parts) == 2:  # ipv6 shape
        ip = str(ipaddress.ip_address(parts[0].strip()))
        return {
            "ip": ip,
            "score": 90,
            "malicious": True,
            "feed_count": 1,
            "last_seen": parts[1].strip(),
        }
    raise ValueError(f"unrecognized feed line ({len(parts)} fields)")

# Windows cp1252 consoles otherwise crash on non-ASCII log lines.
try:
    sys.stdout.reconfigure(errors="replace")
except AttributeError:
    pass

VALID_SCORE = 100

log_width = 0


def log(msg):
    print(msg, flush=True)


def validate_row(row):
    """Return a normalized dict or raise ValueError(reason)."""
    ip_raw = (row.get("ip") or "").strip()
    if not ip_raw:
        raise ValueError("empty ip")
    try:
        ip = ipaddress.ip_address(ip_raw)
    except ValueError:
        raise ValueError(f"malformed ip: {ip_raw!r}")
    score_raw = (row.get("score") or "").strip()
    try:
        score = int(score_raw)
    except ValueError:
        raise ValueError(f"non-integer score: {score_raw!r}")
    if not (0 <= score <= VALID_SCORE):
        raise ValueError(f"score out of range 0-100: {score}")
    out = {"ip": str(ip), "score": score}

    mal_raw = (row.get("malicious") or "").strip().lower()
    if mal_raw:
        if mal_raw in ("true", "1", "yes", "y", "t"):
            out["malicious"] = True
        elif mal_raw in ("false", "0", "no", "n", "f"):
            out["malicious"] = False
        else:
            raise ValueError(f"unparseable malicious flag: {mal_raw!r}")
    # absent malicious => RPC derives it as score >= 50

    for col in ("source", "first_seen", "last_seen"):
        v = (row.get(col) or "").strip()
        if v:
            out[col] = v
    return out


def journal_path(csv_path):
    return csv_path + ".job.jsonl"


def load_journal(path):
    """{status: set(offsets)} from a prior run's journal."""
    done, failed = set(), set()
    if not os.path.exists(path):
        return done, failed
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            (done if e.get("status") == "ok" else failed).add(e["offset"])
    return done, failed


def call_rpc(session, rows, retries=6):
    """One upsert batch through PostgREST /rpc. Returns (inserted, updated)."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/upsert_ip_intel"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    backoff = 2.0
    for attempt in range(retries):
        try:
            r = session.post(url, headers=headers, json={"p_rows": rows}, timeout=120)
        except requests.RequestException as e:
            log(f"    network error ({e.__class__.__name__}), retry {attempt + 1}/{retries}")
            time.sleep(backoff + random.uniform(0, 0.5))
            backoff = min(backoff * 2, 60)
            continue
        if r.status_code == 201 or r.status_code == 200:
            try:
                res = r.json()[0]
                return int(res.get("inserted", 0)), int(res.get("updated", 0))
            except (IndexError, ValueError, TypeError):
                raise RuntimeError(f"unexpected RPC response shape: {r.text[:300]}")
        if r.status_code in (429, 500, 502, 503, 504):
            log(f"    HTTP {r.status_code}, retry {attempt + 1}/{retries}")
            time.sleep(backoff + random.uniform(0, 0.5))
            backoff = min(backoff * 2, 60)
            continue
        raise RuntimeError(f"RPC rejected batch: HTTP {r.status_code} {r.text[:500]}")
    raise RuntimeError("batch failed after all retries (rate limit or outage)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("csv_path")
    ap.add_argument("--format", choices=("csv", "feed"), default="csv",
                    help="csv: header ip,score[,…] | feed: threatbase-ip/ipv6 feed lines")
    ap.add_argument("--batch", type=int, default=5000, help="rows per RPC call (default 5000)")
    ap.add_argument("--start-at", type=int, default=0, help="skip data rows before this offset")
    ap.add_argument("--resume", action="store_true", help="skip batches already journaled ok")
    ap.add_argument("--limit", type=int, default=0, help="import at most N valid rows (smoke tests)")
    ap.add_argument("--dry-run", action="store_true", help="validate only; send nothing")
    args = ap.parse_args()

    if not args.dry_run and (not SUPABASE_URL or not SUPABASE_SERVICE_KEY):
        log("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY environment variables.")
        log("Use the service-role key — same secrets the CI pipeline reads. Never commit them.")
        sys.exit(1)
    if not os.path.exists(args.csv_path):
        log(f"No such file: {args.csv_path}")
        sys.exit(1)
    if args.batch < 1 or args.batch > 10000:
        log("--batch must be between 1 and 10000 (RPC payload sanity).")
        sys.exit(1)

    jp = journal_path(args.csv_path)
    done_offsets, _ = load_journal(jp) if args.resume else (set(), set())
    jfh = None if args.dry_run else open(jp, "a", encoding="utf-8")

    stats = {"valid": 0, "invalid": 0, "inserted": 0, "updated": 0,
             "resumed_skipped": 0, "batches": 0, "failed_batches": 0}
    invalid_samples = []
    batch, batch_start = [], None
    session = requests.Session()
    t0 = time.time()
    exit_code = 0

    def flush():
        nonlocal batch, batch_start
        if not batch:
            return True
        if args.dry_run:
            log(f"  [dry-run] batch @{batch_start}: {len(batch)} rows valid")
            stats["batches"] += 1
            batch, batch_start = [], None
            return True
        ok = True
        if args.resume and batch_start in done_offsets:
            stats["resumed_skipped"] += len(batch)
        else:
            try:
                ins, upd = call_rpc(session, batch)
                stats["inserted"] += ins
                stats["updated"] += upd
                log(f"  batch @{batch_start}: {len(batch)} rows -> +{ins} new, {upd} merged"
                    f" ({time.time() - t0:.0f}s elapsed)")
            except RuntimeError as e:
                ok = False
                stats["failed_batches"] += 1
                log(f"  batch @{batch_start} FAILED: {e}")
            if jfh:
                jfh.write(json.dumps({
                    "offset": batch_start, "rows": len(batch),
                    "status": "ok" if ok else "failed",
                }) + "\n")
                jfh.flush()
        stats["batches"] += 1
        batch, batch_start = [], None
        return ok

    if args.format == "feed":
        with open(args.csv_path, "r", encoding="utf-8") as fh:
            for i, line in enumerate(fh):
                if not line.strip() or line.startswith("#"):
                    continue
                try:
                    rec = parse_feed_line(line)
                except ValueError as e:
                    stats["invalid"] += 1
                    if len(invalid_samples) < 10:
                        invalid_samples.append(f"    line {i + 1}: {e}")
                    continue
                stats["valid"] += 1
                if batch_start is None:
                    batch_start = i
                batch.append(rec)
                if len(batch) >= args.batch:
                    if not flush():
                        exit_code = 1
                        break
                if args.limit and stats["valid"] >= args.limit:
                    break
        if exit_code == 0 and not flush():
            exit_code = 1
    else:
        with open(args.csv_path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            header = reader.fieldnames or []
            if "ip" not in header or "score" not in header:
                log(f"CSV header must include at least 'ip,score' — found: {header}")
                if jfh:
                    jfh.close()
                sys.exit(1)
            for i, row in enumerate(reader):
                if i < args.start_at:
                    continue
                try:
                    rec = validate_row(row)
                except ValueError as e:
                    stats["invalid"] += 1
                    if len(invalid_samples) < 10:
                        invalid_samples.append(f"    line {i + 2}: {e}")
                    continue
                stats["valid"] += 1
                if batch_start is None:
                    batch_start = i
                batch.append(rec)
                if len(batch) >= args.batch:
                    if not flush():
                        exit_code = 1
                        break
                if args.limit and stats["valid"] >= args.limit:
                    break

    if exit_code == 0:
        if not flush():
            exit_code = 1

    if jfh:
        jfh.close()

    log("")
    log("-- summary -------------------------------------------------")
    for k in ("valid", "invalid", "resumed_skipped", "batches", "failed_batches",
              "inserted", "updated"):
        log(f"  {k:<16}{stats[k]}")
    if invalid_samples:
        log("  first invalid rows:")
        for s in invalid_samples:
            log(s)
    if not args.dry_run and stats["inserted"] + stats["updated"] > 0:
        log(f"  total API calls to Supabase: {stats['batches']}")
        log(f"  journal: {jp} (delete it to force a full re-run; --resume skips journaled batches)")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
