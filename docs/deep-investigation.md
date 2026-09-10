# Deep Investigation — operator runbook

`GET /api/investigate?q=<indicator>` (Cloudflare Pages Function, no API key required)
fans out across threat sources for any IPv4/IPv6, domain, URL, or MD5/SHA1/SHA256 and
returns a Dossier JSON rendered at `/investigate`.

## Keys (Cloudflare dashboard → Pages → Settings → Environment variables → Functions)

Production **and** Preview as needed. All are plaintext secrets.

| Variable | Needed for | If absent |
|---|---|---|
| `OTX_API_KEY` | AlienVault OTX pulses + co-indicator graph | `otx` in `sources_skipped` |
| `SHODAN_API_KEY` | open ports / banners (IPs only) | `shodan` skipped |
| `VT_API_KEY` | VirusTotal verdict + resolutions | `virustotal` skipped |
| `MB_API_KEY` | MalwareBazaar sample lookup (sha256 only) | `malwarebazaar` skipped |
| `OPENROUTER_API_KEY` | AI narrative paragraph | `narrative: null` |

Already provisioned: `IOC_CACHE` KV namespace (bound in `wrangler.jsonc`), Supabase
(feed), the onsite scanner (keyless — reads the feed mirror), and geo/RDAP (keyless).

**Degrade check without a key:** `curl "https://threatbase.qzz.io/api/investigate?q=8.8.8.8"`
— the skipped source appears in `sources_skipped`, not `sources_failed`. `sources_failed`
means an upstream error worth investigating.

## Behaviour facts

- Rate limit: 8 requests/min per client IP (KV counter, checked before cache). 429 on excess.
- Cache: one Dossier per indicator for 24 h (`inv:<type>:<value>` in KV); cached replies set `cached: true`.
- `400` unrecognized indicator · `502` every keyed source failed · non-routable IPs answer
  `200` with a `note` and no fan-out.
- Narrative failures never fail the request — the dossier just ships with `narrative: null`.

## Local smoke

`npm run build` then `npx wrangler pages dev dist` and curl
`http://localhost:8788/api/investigate?q=1.1.1.1`. Note: `npm run dev` (vite) has no
`/api` proxy — Functions 404 there site-wide; use wrangler for anything endpoint-side.
For keyed sources locally, put them in `.dev.vars` (gitignored, never commit).
