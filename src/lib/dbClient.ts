/**
 * The proxy-backed Supabase client (Phase 2).
 *
 * Same library, same builder API, different front door: it is pointed at
 * `${origin}/api/db` instead of the Supabase project, so `.from('profiles')` and
 * `.rpc('mint_api_key')` produce byte-identical PostgREST requests — to our own
 * edge instead of straight to the database. The edge adds the credential back
 * from the tb_session cookie (functions/api/db/[[path]].ts).
 *
 * WHY NOT A HAND-ROLLED FETCH WRAPPER
 * Reproducing supabase-js's query builder over fetch means re-implementing
 * filters, modifiers, embedded-resource selects, `Prefer` handling and
 * `count` semantics — and every divergence is a silent wrong answer in a
 * component nobody re-tested. Pointing the real client at a real proxy keeps
 * every existing call site's query text unchanged, which also means the
 * migration cannot change what Row Level Security is asked to decide. No count
 * here on purpose: the last one went stale the week it was written. Verified in
 * @supabase/supabase-js 2.116.0: validateSupabaseUrl() requires an absolute
 * http(s) URL (hence location.origin, not '/api/db') and calls
 * ensureTrailingSlash() internally, so new URL('rest/v1', base) resolves to
 * /api/db/rest/v1 rather than collapsing a path segment.
 *
 * WHAT THIS DOES NOT DO
 *  - It does not authenticate. No session is persisted or auto-refreshed here;
 *    the only credential this client presents is the cookie the browser already
 *    has. supabaseClient.ts's navigatorLock warning is about cross-tab refresh
 *    and deliberately does NOT carry over: this client never refreshes, so there
 *    is nothing to serialise.
 *  - It does not touch supabase.auth. Sign-in, MFA and OAuth still go through
 *    the original client until Phase 3 moves them.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY } from './supabaseConfig'
import supabaseClient from '../supabaseClient'
import { establishSession } from './session'

const PROXY_PREFIX = '/api/db'

/** Absolute because validateSupabaseUrl() rejects anything else. The fallback
 *  only matters in a non-browser import (vitest's node environment), where this
 *  module is loaded for type reasons and never used to fetch. */
function proxyBaseUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:5173'
  return `${origin}${PROXY_PREFIX}`
}

/**
 * In-flight re-handoff, shared.
 *
 * A page that boots with a stale credential fires several `.from()` calls at
 * once; without this, each of them would independently POST a handoff, and the
 * mint route rotates the session on every one of them. Concurrent rotations are
 * the failure Phase 1's anti-fixation exists to prevent, so exactly one handoff
 * runs per burst and the rest await the same promise.
 */
let rehandoff: Promise<boolean> | null = null

async function remintCookie(): Promise<boolean> {
  if (!supabaseClient) return false
  if (!rehandoff) {
    rehandoff = (async () => {
      // getSession() on the PRIMARY client, which still owns refresh: it returns
      // a token it has already renewed if it needed to. This client must not
      // refresh anything — see the Phase 2 boundary note in the proxy route.
      const { data } = await supabaseClient.auth.getSession()
      const token = data.session?.access_token
      if (!token) return false
      return establishSession(token, data.session?.refresh_token)
    })().finally(() => {
      rehandoff = null
    })
  }
  return rehandoff
}

/**
 * 401 -> re-handoff -> one retry.
 *
 * 401 is unambiguous here. PostgREST answers an expired or unusable JWT with
 * 401 and an RLS refusal with 403, and this app's proxy uses 401 only for
 * "your cookie is not currently usable" — so a 401 always means the fix is
 * available locally (re-present the live token), and a 403 correctly never
 * retries. The retry is not repeated: a second 401 means the account genuinely
 * is signed out, and the caller's existing error path handles that.
 */
const proxyFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input as RequestInfo, init)
  if (res.status !== 401) return res
  if (await remintCookie()) return fetch(input as RequestInfo, init)
  return res
}

let db: SupabaseClient | null = null
try {
  db = createClient(proxyBaseUrl(), SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: proxyFetch },
  })
} catch (e) {
  // Mirrors supabaseClient.ts: a null client is a guarded, expected state here,
  // and every call site already handles it.
  console.warn('Supabase proxy client init failed:', e)
}

export default db
