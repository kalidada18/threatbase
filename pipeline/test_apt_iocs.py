#!/usr/bin/env python3
"""Offline asserts for sync_apt's IOC bucketing/filtering and TTP cache load.
Run from the pipeline/ dir: python test_apt_iocs.py"""
import ipaddress
import json
import os
import tempfile
import time

import sync_apt as sa


def test_bucket_and_filter():
    # edge cases first (each must NOT count toward the cap), then pools beyond IOC_CAP
    raw = [
        {"indicator": "10.0.0.5", "type": "IPv4"},                # private -> drop
        {"indicator": "127.0.0.1", "type": "IPv4"},               # loopback -> drop
        {"indicator": "1.1.1.1", "type": "IPv4"},                 # whitelisted -> drop
        {"indicator": "20.192.5.6", "type": "IPv4"},              # inside whitelisted CIDR 20.192.0.0/10 -> drop
        {"indicator": "notadns!", "type": "domain"},              # fails DOMAIN_RE -> drop
        {"indicator": "", "type": "IPv4"},                        # empty -> drop
        {"indicator": "notahash", "type": "Mutex"},               # uninteresting type -> drop
    ] + (
        [{"indicator": f"8.8.8.{i}", "type": "IPv4"} for i in range(2, 30)] +
        [{"indicator": f"8.8.8.{i}", "type": "IPv4"} for i in range(2, 30)] +  # dups
        [{"indicator": f"evil{i}.com", "type": "domain"} for i in range(1, 30)] +
        [{"indicator": f"h{i}.example", "type": "hostname"} for i in range(1, 20)] +
        [{"indicator": f"{i:032x}", "type": "FileHash-MD5"} for i in range(1, 30)]
    )

    orig_fetch, orig_excl = sa.fetch_pulse_indicators, sa._excluded_ips
    sa.fetch_pulse_indicators = lambda _pid, _dl=None: raw
    sa._excluded_ips = lambda: ({"1.1.1.1"}, [ipaddress.ip_network("20.192.0.0/10")])
    try:
        actor = {"name": "X", "campaigns": [{"url": "https://otx.alienvault.com/pulse/abc"}]}
        sa.collect_actors_iocs(actor, sa._excluded_ips())
        iocs = actor["iocs"]
        assert len(iocs["ips"]) == sa.IOC_CAP and len(iocs["domains"]) == sa.IOC_CAP and len(iocs["hashes"]) == sa.IOC_CAP, \
            {k: len(v) for k, v in iocs.items()}
        assert "10.0.0.5" not in iocs["ips"] and "127.0.0.1" not in iocs["ips"] and "1.1.1.1" not in iocs["ips"]
        assert "20.192.5.6" not in iocs["ips"], "whitelisted CIDR leaked"
        assert "notadns!" not in iocs["domains"], "unvalidated string leaked into domains"
        assert len(set(iocs["ips"])) == sa.IOC_CAP, "duplicates leaked"
        assert iocs["hashes"][0].startswith("00000000000000000000000000000001")

        sa.fetch_pulse_indicators = lambda _pid, _dl=None: [{"indicator": "10.0.0.1", "type": "IPv4"}]
        empty = {"name": "Y", "campaigns": [{"url": "https://otx.alienvault.com/pulse/z"}]}
        sa.collect_actors_iocs(empty, (set(), []))
        assert "iocs" not in empty, "all-filtered actor must not get an iocs key"

        # expired deadline -> stops immediately even with queued campaigns
        sa.fetch_pulse_indicators = lambda _pid, _dl=None: raw
        past = {"name": "Z", "campaigns": [{"url": "https://otx.alienvault.com/pulse/1"}] * 3}
        sa.collect_actors_iocs(past, (set(), []), deadline=time.monotonic() - 1)
        assert "iocs" not in past, "deadline must stop the campaign loop"
    finally:
        sa.fetch_pulse_indicators, sa._excluded_ips = orig_fetch, orig_excl


def test_ttp_cache():
    orig = sa.TTP_FILE
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"source": "t", "ttps": {"APT28": ["Phishing"]}}, f)
            sa.TTP_FILE = f.name
        assert sa.load_ttp_cache() == {"APT28": ["Phishing"]}
        sa.TTP_FILE = os.path.join(sa.PIPELINE_DIR, "missing.json")
        assert sa.load_ttp_cache() == {}
    finally:
        sa.TTP_FILE = orig


if __name__ == "__main__":
    test_bucket_and_filter()
    test_ttp_cache()
    print("OK")
