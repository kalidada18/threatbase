#!/usr/bin/env python3
"""Self-check for import_ip_intel's hash feed parsing and --since gate."""
import sys
sys.path.insert(0, ".")
from pipeline.import_ip_intel import parse_hashfeed_line, parse_feed_line, parse_keyvalue_line, is_stale

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

# keyvalue: domain/url/cidr each keep their kind and reject the others' shapes
r = parse_keyvalue_line("evil.example.com,2026-09-02", "domain")
assert r["value"] == "evil.example.com" and r["kind"] == "domain" and r["last_seen"] == "2026-09-02"
assert parse_keyvalue_line("http://a.b/c?d=1", "url")["kind"] == "url"
assert parse_keyvalue_line("1.10.16.0/20,2026-09-02", "cidr")["score"] == 90
for bad, kind in (("1.2.3.4", "domain"), ("ftp://x.y/z", "url"), ("1.2.3.4", "cidr"), ("999.1.0.0/8", "cidr")):
    try:
        parse_keyvalue_line(bad, kind)
        raise AssertionError(f"accepted {bad!r} as {kind}")
    except ValueError:
        pass

# keyvalue length gate: indicator_intel.value is CHECK (length BETWEEN 1 AND
# 2048) for every kind, and the url feed carries percent-encoded junk well past
# that — 7 such rows sit in the live feed. Without the gate each one rejects its
# whole 5000-row batch (HTTP 400, indicator_intel_value_check) and aborts the
# run. The bound is inclusive at 2048.
assert len(parse_keyvalue_line("http://a.b/" + "c" * 2037, "url")["value"]) == 2048
try:
    parse_keyvalue_line("http://a.b/" + "c" * 2038, "url")
    raise AssertionError("accepted a 2049-char value")
except ValueError:
    pass

print("ok — 8 checks")
