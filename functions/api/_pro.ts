/**
 * Shared Pro-entitlement check for Pages Functions.
 *
 * Entitlement lives in public.api_keys (is_pro + is_active, service-role
 * read — same fail-closed pattern as functions/feed/[[path]].ts). The
 * visitor's Supabase JWT arrives as `Authorization: Bearer <access_token>`.
 *
 * A profiles.role = 'superadmin' account is Pro everywhere without holding a
 * paid key — role is server-controlled (the column grants in
 * db/pro_and_rls_fixes.sql make it self-writable by authenticated users).
 */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../src/lib/supabaseConfig'

export type ProState = 'pro' | 'not-pro' | 'no-auth' | 'no-config'

/** Build the service-role client from env. Null when the key is missing. */
export function adminClient(env: any) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing — Pro check down.')
    return null
  }
  return createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey)
}

/** Verify the request's Bearer JWT and return the signed-in user, or null. */
export async function bearerUser(admin: ReturnType<typeof adminClient>, request: Request) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await admin!.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export async function proStatus(request: Request, env: any): Promise<ProState> {
  try {
    const admin = adminClient(env)
    if (!admin) return 'no-config'
    const user = await bearerUser(admin, request)
    if (!user) return 'no-auth'
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (prof?.role === 'superadmin') return 'pro'
    // limit(1), not maybeSingle(): api_keys_inherit_pro makes every new key of
    // a Pro user is_pro=true, so a rotate-and-revoke moment can leave 2 active
    // pro rows — maybeSingle would then error and fail the check closed.
    const { data: rows, error: rowError } = await admin
      .from('api_keys')
      .select('is_pro')
      .eq('user_id', user.id)
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

