/**
 * Superadmin Pro-management endpoint (bulk hunt is a Pro feature; the
 * superadmin grants/retracts it for other users from their Profile dashboard).
 *
 * GET  ?q=<email fragment> → up to 25 accounts with { id, email, username,
 *      role, is_pro } — is_pro = user holds any is_pro key (active or not;
 *      api_keys_inherit_pro makes inactive rows keep the entitlement alive).
 * POST { user_id, pro: boolean } → flips is_pro across ALL of that user's
 *      keys, mirroring db/pro_admin.md's grant/cancel SQL exactly. The flip
 *      takes effect for the client bulk gate on the next /api/me/pro poll;
 *      the Pro feed URL itself is only revealed at key creation, so tell the
 *      customer to revoke + regenerate (runbook step 3).
 *
 * Auth: caller's Supabase JWT → superadmin profiles.role, checked with the
 * service-role client so the client can never spoof the role. profiles.role
 * is un-writable by authenticated users (column grants, pro_and_rls_fixes §2).
 */
import { json, corsHeaders } from '../_common'
import { adminClient, bearerUser } from '../_pro'

export const onRequestOptions = async (context: any) => {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) })
}

const guard = async (request: Request, env: any) => {
  const admin = adminClient(env)
  if (!admin) return null
  const user = await bearerUser(admin, request)
  if (!user) return null
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (prof?.role !== 'superadmin') return null
  return admin
}

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const admin = await guard(request, env)
  if (!admin) return json({ error: 'forbidden' }, 403, request)

  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() || ''
  const { data: keys, error: kErr } = await admin.from('api_keys').select('user_id,is_pro').eq('is_pro', true)
  if (kErr) return json({ error: 'lookup failed' }, 500, request)
  const proSet = new Set((keys ?? []).map((k: any) => k.user_id))

  const { data: users, error: uErr } = await admin.from('profiles').select('id,username,role')
  if (uErr) return json({ error: 'lookup failed' }, 500, request)
  const roleOf = new Map((users ?? []).map((p: any) => [p.id, p]))

  const { data: authUsers, error: aErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (aErr) return json({ error: 'lookup failed' }, 500, request)

  const out = (authUsers?.users ?? [])
    .filter((u: any) => !q || (u.email || '').toLowerCase().includes(q) || (roleOf.get(u.id)?.username || '').toLowerCase().includes(q))
    .slice(0, 25)
    .map((u: any) => ({
      id: u.id,
      email: u.email,
      username: roleOf.get(u.id)?.username ?? null,
      role: roleOf.get(u.id)?.role ?? 'user',
      is_pro: proSet.has(u.id),
    }))
  return json({ users: out }, 200, request)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  const admin = await guard(request, env)
  if (!admin) return json({ error: 'forbidden' }, 403, request)

  let body: any
  try { body = await request.json() } catch { return json({ error: 'invalid JSON' }, 400, request) }
  const { user_id: userId, pro } = body ?? {}
  if (typeof userId !== 'string' || !UUID_RE.test(userId) || typeof pro !== 'boolean')
    return json({ error: 'need user_id (uuid) and pro (boolean)' }, 400, request)

  const { error } = await admin.from('api_keys').update({ is_pro: pro }).eq('user_id', userId)
  if (error) return json({ error: 'update failed' }, 500, request)
  return json({ ok: true }, 200, request)
}
