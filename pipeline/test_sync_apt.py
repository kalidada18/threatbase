#!/usr/bin/env python3
"""Self-check for sync_apt.py matching logic — no network needed.
Run: python pipeline/test_sync_apt.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sync_apt  # noqa: E402

def pulse(name="", desc="", tags=(), adv=()):
    return {"name": name, "description": desc, "tags": [{"name": t} for t in tags], "adversary": list(adv)}

A = ["APT28", "Fancy Bear", "Sofacy"]

# tag / adversary / title matches
assert sync_apt.matches(pulse(name="Op Springtail", tags=["APT28"]), A)
assert sync_apt.matches(pulse(name=" phishing kit", adv=["Fancy Bear"]), A)
assert sync_apt.matches(pulse(name="Sofacy infrastructure observed"), A)
# description-only mention counts as activity
assert sync_apt.matches(pulse(name="New malware", desc="linked to APT28 per vendor report"), A)
# word boundaries: APT1 must not match APT17/37 noise, APT41 must not match APT4
assert not sync_apt.matches(pulse(name="APT17 and APT32 activity", desc="APT37 too"), ["APT1"])
assert not sync_apt.matches(pulse(name="APT41 hits", desc=""), ["APT4"])
# unrelated pulse rejected
assert not sync_apt.matches(pulse(name="LockBit leak site downtime", desc="ransomware"), A)

print("sync_apt matching: OK")
