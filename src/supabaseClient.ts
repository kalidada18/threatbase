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
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { lock: navigatorLock },
  })
} catch (e) {
  console.warn('Supabase client init failed:', e)
}

export default supabaseClient
