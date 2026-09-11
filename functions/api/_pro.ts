/**
 * Shared Pro-entitlement check for Pages Functions.
 *
 * Entitlement lives in public.api_keys (is_pro + is_active, service-role
 * read — same fail-closed pattern as functions/feed/[[path]].ts). The
 * visitor's Supabase JWT arrives as `Authorization: Bearer <access_token>`.
 */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../src/lib/supabaseConfig'

export type ProState = 'pro' | 'not-pro' | 'no-auth' | 'no-config'

export async function proStatus(request: Request, env: any): Promise<ProState> {
  try {
    const auth = request.headers.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return 'no-auth'
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY missing — Pro check down.')
      return 'no-config'
    }
    const admin = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey)
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return 'no-auth'
    // limit(1), not maybeSingle(): api_keys_inherit_pro makes every new key of
    // a Pro user is_pro=true, so a rotate-and-revoke moment can leave 2 active
    // pro rows — maybeSingle would then error and fail the check closed.
    const { data: rows, error: rowError } = await admin
      .from('api_keys')
      .select('is_pro')
      .eq('user_id', userData.user.id)
      .eq('is_pro', true)
      .eq('is_active', true)
      .limit(1)
    if (rowError) throw rowError
    return rows?.length ? 'pro' : 'not-pro'
  } catch (e) {
    console.error('proStatus failed:', e)
    return 'no-config'
  }
}
