# Deep Investigation — Design Spec

**Date:** 2026-09-10 · **Status:** approved in chat, pending spec review
**One-liner:** Search any IP/domain/hash → "Deep Investigation" → a Cloudflare Pages Function fans out across every threat source we can reach, builds a pivotable trace-graph of everything that indicator touched (domains, URLs, hashes, co-actors), and presents it as an advanced visual report with an AI narrative.

## What "everything this IP did" honestly means

No public API replays an arbitrary IP's traffic. What we *can* gather, and this product's whole value: every relationship the security community has recorded around that indicator — what hosted on it, what was reported with it, what it was seen dropping, what verdicts it carries. That is a **2-hop trace network**:

```
            ┌─ domains (reverse DNS / resolution)
   IP ──────┼─ urls, hashes, co-IPs   (OTX pulses that contain the IP → their other indicators)
            ├─ ports/services/banners (Shodan)
            ├─ AV verdicts            (VirusTotal relationships + detections)
            ├─ behavior tags          (abuse.ch Bazaar, reached via the hash edges)
            └─ our own trail          (which Threatbase feeds list it, Hall-of-Shame reports,
                                       risk score from the existing scanner)
```

Every edge is labeled with *why* ("same pulse: LockBit C2", "resolves to", "listed by 12 feeds"). Clicking any node investigates *that* node — the pivot loop.

## Architecture

### 1. Endpoint — `functions/api/investigate.ts`

`GET /api/investigate?q=<ip|domain|url|md5|sha1|sha256>` — type sniffed by regex (`src/lib/apiValidation.ts` validators, same ones `v1/scan` uses). Reuses: `json()`/CORS from `functions/api/_common.ts`, rate-limit middleware from `functions/api/v1/_middleware.ts` (path-scoped, 10 req/min/IP — investigation fan-out is expensive).

Flow:
1. **Validate** — bad query → 400. Private/reserved/CGNAT IPs → 200 with `{ verdict: 'not_investigated', reason: 'non-routable' }` (an answer, not an error — same philosophy as geo/rdap).
2. **KV cache hit** (`IOC_CACHE`, key `inv:<type>:<value>`) → serve, `cached: true`. TTL 24 h.
3. **Phase A — free/no-key core** (parallel, `Promise.allSettled`, 6 s budget per source):
   - **on-site**: `scanIndicatorLogic()` from `src/scanner` (risk score, feed count, tags, sources) — zero network, the spine of every report
   - **geo**: reuse `functions/api/geo.ts` provider logic via an exported helper (direct call, no self-HTTP)
   - **rdap**: same pattern, `functions/api/rdap.ts` helper
   - **OTX** (`OTX_API_KEY`, already a repo secret): `GET /indicators/<type>/<value>` → verdicts per source + pulses; then for the top ≤5 pulses by relevance, `GET /pulses/<id>/indicators` → co-occurring indicators = graph edges. OTX is the single richest source and needs no new key.
4. **Phase B — optional-key enrichment** (each adapter checks `env.X`, missing → skip + record in `sources_skipped`):
   - **Shodan** `SHODAN_API_KEY` → open ports, services, banners, host history (IP only)
   - **VirusTotal v3** `VT_API_KEY` → `ip_addresses/{ip}` + `relationships` (resolutions, communicating files), `files/{hash}` detections, domains `resolved_by` (IP only)
   - **MalwareBazaar** keyless → by hash: family names, tags ("stealer", "cobaltstrike"), first/last seen, signature (reached via hash edges)
5. **Assemble** dossier (below), **narrative**: one OpenRouter call (same free model + key as sync_apt; fail → `narrative: null`, UI shows the structured report without prose). Prompt embeds only the dossier's structured facts; instructs: 4–6 sentences, no invented IOCs, untrusted-text hygiene identical to the APT summarizer.
6. **Store + serve** — write KV, return JSON.

Failure posture: `Promise.allSettled` everywhere; the report renders with whatever came back + a `sources_failed[]` list shown honestly in the UI ("VirusTotal timed out — retry"). Zero sources succeeding → 502 (only possible with keyless core broken).

### 2. Dossier shape (the whole contract, one file)

```jsonc
{
  "query": { "type": "ipv4", "value": "45.155.205.23" },
  "generated_at": "…", "cached": false,
  "sources_ok": ["threatbase","otx","geo","rdap","shodan","virustotal"],
  "sources_skipped": ["malwarebazaar"], "sources_failed": [],
  "verdict": {
    "risk": 78, "malicious_by": 14, "total_engines": 22,   // scanner + VT + OTX merged
    "status": "malicious|suspicious|clean|unknown"          // >=8 malicious, 3–7 suspicious, else per scanner
  },
  "identity": { "country":"…","city":"…","asn":"AS…","isp":"…","reverse_dns":"…","registered":"…","hosting_type":"VPS|cloud|residential|tor-exit" },
  "behavior": {
    "ports": [{"port":22,"service":"ssh","banner":"…"}, …],
    "tags": ["bruteforce","c2","scanner"],                  // merged: our feeds + OTX pulse tags + Bazaar
    "first_seen": "…", "last_seen": "…"
  },
  "relations": [                                            // THE GRAPH — max 40 nodes
    { "type":"domain","value":"evil[.]xyz","edge":"resolves_to|same_pulse:hosted_by|vt_resolution",
      "via":"OTX pulse 6a7…","weight":7,"malicious":true,"first_seen":"…","last_seen":"…" }
  ],
  "pulses": [ { "title":"…","url":"https://otx…","modified":"…" } ],   // ≤10, source links
  "timeline": [ { "date":"2026-09-01","source":"feodo","event":"listed" }, … ],  // merged sightings, ≤120
  "narrative": "…4-6 sentences…",
  "investigated_by": 17                                     // counter from KV, social proof
}
```

Caps: 40 relation nodes ranked by (weight, recency), stalest dropped; `ponytail:` comment at each cap. Node types limited to `ipv4|ipv6|domain|url|md5|sha1|sha256` — anything exotic (mutex, YARA) is skipped in v1.

### 3. Frontend — `src/components/InvestigatePage.tsx`, route `/investigate?q=`

Entry points (every IOC we already surface becomes a pivot affordance):
- search bar on ThreatFeed page: submit → this page (scanner "is it bad?" answer is the verdict tile)
- Hall-of-Shame rows, Top-APT IOC chips (click-to-copy stays; a search-style affordance joins), `ReportScanner` result rows
- direct URL `/investigate?q=…` is shareable — full state in query string

Layout (IsoPageShell, dark, existing mono design language):
1. **Hero verdict tile** — status word + risk gauge (recharts radial, single hue `--chart-1` red = severity ramp, icon+label never color-alone), identity chips row (ASN/geo/hosting/Tor-exit), investigated-by counter.
2. **Trace graph** — hand-rolled SVG, ~150 lines: center node = the query, rings by type (domains/URLs upper arc, hashes lower, co-IPs sides), red opacity = weight, edge labels on hover (tooltip per dataviz interaction rules), click node → investigate that node with breadcrumb back-stack (browser history = real route). Deterministic radial layout — no d3, no force sim; a stable picture beats a wiggly one.
3. **Activity calendar** — 90-day heatmap strip (recharts or CSS grid, red ramp `--chart-1` 4 steps on dark surface — run dataviz validator before shipping), one row per source lane (feeds/OTX/VT) — the "what it's been doing over time" read.
4. **Behavior table** — ports/services/banners + merged tags (mono, sort by port).
5. **Narrative + sources** — AI paragraph in GroupSummary-styled block, then `sources_ok`/`skipped`/`failed` chips (honesty strip), pulse links.

State: single fetch, `useReducer`, skeletons per section (each section renders when its data exists — partial dossier = partial page, never a spinner wall). Mobile: graph collapses to a ranked relation list (the SVG is progressive enhancement; the list is the accessible table view dataviz requires anyway).

### 4. Caching, quota, cost

- KV `inv:*` 24 h TTL → one fan-out per indicator per day. Free OTX/Shodan/VT tiers are per-*day* capped; the cache is the quota strategy, not an optimization.
- OpenRouter narrative: 1 call per fresh indicator (≤50/day on the free model, cache absorbs repeats; over cap → structured report ships without prose, logged).
- Rate limit 10/min/IP at the middleware; a hostile flood degrades to cached hits + 429s, upstream keys never burn unlimited.

### 5. Secrets to paste (Cloudflare dashboard → Pages → Settings → Functions env)

`OTX_API_KEY` (exists), `SHODAN_API_KEY` (free), `VT_API_KEY` (free), `OPENROUTER_API_KEY` (exists). Everything works day-one without the two new ones — Shodan/VT rows just show as "not enabled" chips until pasted.

### 6. Tests

- **Unit (node-runnable, no framework):** `functions/api/investigate_test.mjs` — type sniffing, non-routable rejection, relation ranking/cap, verdict merge math, KV key shape. Pure logic split into `investigate.lib.ts` so it imports under plain node.
- **Smoke (manual, documented):** a known-listed IP from our own feeds + a clean IP (e.g. 1.1.1.1 → verdict "benign infrastructure", proves no false-positive bias).
- **Live:** `wrangler pages dev` + `npx tsc --noEmit`; `graphify update .` after landing (project rule).

## Explicitly out of scope (v1)

- Traffic/flow replay ("packets it sent") — no public source has it; honeypot sensors (Pro plan) will.
- Passive DNS history beyond what OTX/VT/Shodan expose; ASN-level pivot (neighboring IPs in the same /24 beyond pulse co-occurrence).
- PDF export of the report.
- Authenticated "saved investigations" (profile page hook-in point noted in code, built never-until-asked).

## Risks

- **OTX /indicators endpoint shape drift** — already burned once on legacy `hashs` keys; adapters parse defensively, missing field → skip not crash (proven pattern in sync_apt).
- **VT free tier 4/min** — cache + skip-list handles bursts.
- **Co-occurrence ≠ attribution** — every edge carries its `via` source; UI language is "reported with", never "is"; footer disclaimer like the APT page's.
