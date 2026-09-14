#!/usr/bin/env python3
"""Offline asserts for the dispute-poisoning guards.
Run from the pipeline/ dir: python test_dispute_poisoning.py
Covers: sync_community_reports.is_valid_public_ip (shared report/dispute gate)
and update_feed.FalsePositivesSet.add_item's over-broad CIDR floor."""
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "dummy")

import sync_community_reports as scr
import update_feed as uf


def test_dispute_ip_gate():
    assert scr.is_valid_public_ip("8.8.8.8") is False          # whitelisted resolver
    assert scr.is_valid_public_ip("45.67.89.10") is True        # plain public
    assert scr.is_valid_public_ip("10.0.0.1") is False         # private
    assert scr.is_valid_public_ip("0.0.0.0/0") is False        # the feed-wipe string
    assert scr.is_valid_public_ip("1.2.3.0/24") is False       # any CIDR
    assert scr.is_valid_public_ip("") is False
    assert scr.is_valid_public_ip("not an ip") is False


def test_fp_set_cidr_floor():
    s = uf.FalsePositivesSet()
    s.add_item("0.0.0.0/0")        # must NOT widen
    s.add_item("10.0.0.0/8")       # /8 boundary: prefixlen < 8 is rejected, == 8 kept
    s.add_item("45.67.89.0/24")   # legit-sized range kept
    assert len(s.cidrs) == 2, s.cidrs
    assert not s.check_int(0), "0.0.0.0 must not match after 0.0.0.0/0 was rejected"
    assert not s.check_int(uf.ipaddress.IPv4Address("198.51.100.1").__int__())
    assert s.check_int(uf.ipaddress.IPv4Address("45.67.89.9").__int__())


if __name__ == "__main__":
    test_dispute_ip_gate()
    test_fp_set_cidr_floor()
    print("OK — dispute poisoning guards hold")
