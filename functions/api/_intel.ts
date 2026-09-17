/**
 * Server-side indicator verdict, read from the Supabase corpus
 * (ip_intel / hash_intel / indicator_intel) instead of the /ioc feed text.
 *
 * Why: a Hunt for a domain used to download a whole ~36 MB feed chunk to
 * binary-search one line. The corpus answers the same question with one
 * indexed lookup — the tables are a lossless mirror of the published feeds
 * (verified row-for-row when this was written: ip 1,013,155 + 18,238 IPv6,
 * cidr 22,288, domain 3,539,617, url 132,339, hash 1,142,607).
 *
 * Returns EXACTLY the object scanIndicatorLogic (src/scanner.ts) returns —
 * same keys, same value conventions — so every caller downstream (the Hunt
 * response, /api/v1/scan, the MCP tool) is unchanged. The row -> verdict
 * mapping itself lives in src/lib/intelVerdict.ts, shared with the browser's
 * bulk hunt so the two cannot describe the same row differently.
 *
 * Falls back to scanIndicatorLogic when Supabase is unreachable: the feeds
 * are the same data, and a corpus blip must not turn every hunt into a 500.
 * That fallback is why server callers still need ensureAbsoluteFetch()
 * (src/scanner.ts fetches feeds with relative '/ioc/...' urls).
 *
 * Authenticated with the publishable (anon) key on purpose: lookup_intel is
 * SECURITY DEFINER and its EXECUTE grant to anon is the intended read path
 * (the three intel tables have RLS enabled with no policies — deny-all), so
 * this needs no secret and works under `wrangler pages dev`.
 *
 * This file owns the TRANSPORT (one RPC per indicator). The browser's bulk
 * path uses lookup_intel_batch instead, which is `authenticated`-only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/lib/supabaseConfig'
import { scanIndicatorLogic } from '../../src/scanner'
import {
  classifyIndicator,
  cleanVerdict,
  intelBase,
  invalidVerdict,
  pivotCandidates,
  rowToVerdict,
  type IntelRow,
} from '../../src/lib/intelVerdict'

let client: SupabaseClient | null = null
function intelClient(): SupabaseClient | null {
  if (!client) {
    try {
      client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    } catch (e) {
      console.error('Supabase intel client init failed:', e)
      return null
    }
  }
  return client
}

export async function scanIndicatorIntel(rawInput: string) {
  const c = classifyIndicator(rawInput)
  const base = intelBase(c)
  if (base.type === 'invalid') return invalidVerdict(base)

  const { host, parents } = pivotCandidates(c)

  const sb = intelClient()
  if (sb) {
    try {
      const { data, error } = await sb
        .rpc('lookup_intel', { p_value: c.ip, p_parents: parents })
        .abortSignal(AbortSignal.timeout(10_000))
      if (error) throw error

      const row = (data as IntelRow[] | null)?.[0]
      if (!row) return cleanVerdict(base)
      return rowToVerdict(base, c, host, row)
    } catch (err: any) {
      console.error('Supabase intel lookup failed, falling back to feeds:', err?.message || err)
    }
  }

  // Corpus unreachable: the feed path still answers, slower but never dead.
  return scanIndicatorLogic(c.ip, 'latest')
}
