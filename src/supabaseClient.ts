import { createClient, navigatorLock, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/supabaseConfig'

let supabaseClient: SupabaseClient | null = null
try {
  // lock is load-bearing, do not remove: auth-js 2.116 refreshes locklessly by
  // default (this.lock=null) and supabase-js no longer supplies a default lock.
  // Without it, two open tabs can refresh at once — one replays a just-rotated
  // refresh token, GoTrue's reuse detection revokes the whole token family, and
  // every tab is silently logged out on next reopen. navigatorLock (Web Locks)
  // serializes refresh across tabs, restoring older supabase-js behavior.
  //
  // auth-js 2.116 warns that this option is deprecated and that "most apps can
  // drop the option" because it now coordinates locklessly. That advice does not
  // cover us: its cross-tab coordination is a BroadcastChannel, and GoTrueClient
  // only constructs one when persistSession is true (L270). Phase 3 sets
  // persistSession:false, which removes that channel and leaves only per-client
  // single-flight (L4680) — per tab, not per browser. So do not "clean up" this
  // option to silence the warning until the server-side refresh lease
  // (db/sessions_refresh.sql) is what actually serializes refreshes.
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { lock: navigatorLock },
  })
} catch (e) {
  console.warn('Supabase client init failed:', e)
}

export default supabaseClient
