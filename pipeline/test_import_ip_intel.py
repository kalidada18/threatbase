#!/usr/bin/env python3
"""Self-check for import_ip_intel's hash feed parsing and --since gate."""
import sys
sys.path.insert(0, ".")
from pipeline.import_ip_intel import parse_hashfeed_line, parse_feed_line, is_stale

# hash line: digest + last_seen
r = parse_hashfeed_line("00000077553a5b27a610ac98f29563bbd6e0decc020c2d49e4fa0d89197e7fd8,2026-09-02\n")
assert r["hash"] == "00000077553a5b27a610ac98f29563bbd6e0decc020c2d49e4fa0d89197e7fd8"
assert r["score"] == 90 and r["malicious"] is True and r["last_seen"] == "2026-09-02"

# upper-case normalized; md5 and sha1 lengths accepted; junk and bad dates rejected
assert parse_hashfeed_line("A" * 32 + ",2026-09-02")["hash"] == "a" * 32
assert parse_hashfeed_line("b" * 40)["score"] == 90 and "last_seen" not in parse_hashfeed_line("b" * 40)
for bad in ("z" * 64, "a" * 63, "deadbeef", "1.2.3.4,2026-09-02"):
    try:
        parse_hashfeed_line(bad)
        raise AssertionError(f"accepted junk: {bad!r}")
    except ValueError:
        pass

# --since gate: first_seen rules for ip rows, last_seen for hash rows, undated passes
assert is_stale({"first_seen": "2026-09-01", "last_seen": "2026-09-16"}, "2026-09-15")
assert not is_stale({"first_seen": "2026-09-15", "last_seen": "2026-09-16"}, "2026-09-15")
assert is_stale({"last_seen": "2026-09-02"}, "2026-09-15")
assert not is_stale({"score": 90}, "2026-09-15")

# ip feed untouched by the refactor
r = parse_feed_line("1.2.3.4,3,HIGH,Malicious,2026-01-01,2026-09-16,urlhaus,abusech")
assert r["ip"] == "1.2.3.4" and r["feed_count"] == 3 and r["score"] == 90 and r["source"] == "urlhaus,abusech"

print("ok — 5 checks")
