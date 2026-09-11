# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary (per user, 2026-09-11): **Pro buyers evaluating Threatbase** — they arrive at /investigate after seeing the pitch and decide whether Deep Investigation is worth a subscription. The page must demonstrate accuracy, evidence depth, and craft in one lookup. Secondary: existing Pro users (SOC-style triage: verify an IOC, trace relations, defend the block decision) and security researchers hunting IOCs. The public hunt console (free tier) shows a paywalled preview of the same surface.

## Product Purpose

Threatbase is a fully-automated, open-source threat-intelligence platform: 54 OSINT feeds → deduplicated blocklists + IOC-hunting console at threatbase.qzz.io. Investigate (Deep Investigation) is the Pro flagship: one indicator in → a merged dossier out — verdict + confidence, per-source evidence, identity, relations graph, 90-day activity calendar, timeline, behavior tags, AI analyst summary. Success for the Investigate surface = a visitor trusts the verdict enough to act (block / whitelist / subscribe).

## Positioning

Own-honeypot ground truth plus 54 corroboration feeds, merged server-side into one dossier with explicit per-source evidence and recency-decayed scoring — not a wrapper around VirusTotal. The dossier shows *why* (which source said what, when), which consumer lookup tools don't.

## Operating Context

- Cloudflare Pages + Functions; dossier cached in KV (up to 24 h TTL, refresh pill rate-limited 1/h per indicator).
- Sources: onsite feeds, AbuseIPDB/OTX, Shodan, VirusTotal, MalwareBazaar, URLhaus/Feodo, GreyNoise Enterprise (community fallback), RDAP/geo, spamhaus, RIPEstat; OpenRouter for the AI narrative.
- Pro gating is server-side (JWT + KV); non-Pro gets 403 → paywall view.
- Public rate limit 8 investigations/min/IP.

## Capabilities and Constraints

- Dossier content is machine-derived from source facts; the AI narrative is explicitly labeled machine-generated and must degrade honestly when the model call fails (null narrative → structured facts stand).
- Tags keep canonical `source:slug` wire format (feed-line contract with pipeline/scanner/UI labels); presentation humanizes, wire never changes.
- VT and OpenRouter were reported broken by the owner on 2026-09-11 — live diagnosis + code-side fix is in scope; the design must treat "source failed / skipped / no record" as first-class honest states, never fabricated filler.
- Dark cockpit aesthetic is the incumbent world; the owner asked to **replace** it with a new world ("next new world, beautiful, fully graph, easier fonts, AI summarize") — redesign, not refinement.

## Brand Commitments

Name: Threatbase; logo in public/img/logo.png; MIT-licensed open source; voice is confident-technical, no hype. Copy bans em-dashes (project audit rule). lucide icons over unicode glyphs.

## Evidence on Hand

Real data: ~millions of deduplicated IOCs, live feed update commits daily; real GreyNoise Enterprise tags on sampled IPs (45.148.10.182 shows 20+ intention tags incl. CVE-2021-41773). No testimonials, customer logos, or benchmarks exist — do not fabricate any.

## Product Principles

1. Evidence over assertion — every verdict shows its sources, dates, and confidence.
2. Honest degradation — missing/broken sources and absent AI are stated plainly and can look deliberate, not broken.
3. One lookup, full story — verdict → why → what else it touches (graph) → what to do.
4. The graph is the product, not decoration — relations/trace are how buyers evaluate depth.
5. Reader-first density — analysts scan in seconds; typography and color carry severity, not walls of uppercase mono.

## Accessibility & Inclusion

WCAG contrast floors established in prior audit pass; keyboard-focusable graph/actions; reduced-motion respected. Keep and improve.
