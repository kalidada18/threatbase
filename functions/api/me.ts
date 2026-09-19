/**
 * GET /api/me — who is this cookie?
 *
 * The cookie-authenticated identity endpoint, and Phase 1's proof that the
 * session works as a credential on its own: no Authorization header, no JWT in
 * the request or the response. The browser sends nothing but the HttpOnly cookie
 * and gets back an identity the server verified itself.
 *
 * Deliberately narrow. Email and phone live in auth.users, which PostgREST does
 * not expose; fetching them means an extra getUser round-trip for a value the SPA
 * already holds client-side, so this route returns what the sessions and profiles
 * tables actually have. Add a field here only when something server-side needs it.
 *
 * Coexists with /api/me/pro (Bearer-JWT, unchanged): two credentials, one
 * entitlement implementation — both go through proStatusForUser.
 */
import { json } from './_common'
import { proStatusForUser } from './_pro'
import { requireSession } from './_session'

export const onRequestGet = async (context: any) => {
  const { request } = context
  const ctx = await requireSession(context)
  if (ctx.response) return ctx.response

  const { session, admin } = ctx
  const userId = session.userId!

  const { data: profile, error } = await admin
    .from('profiles')
    .select('username, role, full_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // The identity is verified either way; a profile read failure is not a
    // reason to tell a signed-in user they are signed out.
    console.error('profile lookup failed:', error.message)
  }

  // proStatusForUser has no auth of its own; the userId came from a verified
  // session row, so it is safe to ask. A throw means the entitlement read failed,
  // which is not the same as "not Pro" and must not be reported as that.
  const pro = await proStatusForUser(admin, userId).catch((e) => {
    console.error('pro lookup failed:', e)
    return null
  })
  if (pro === null) {
    return json({ error: 'pro check unavailable' }, 503, request)
  }

  return json(
    {
      id: userId,
      username: profile?.username ?? null,
      role: profile?.role ?? 'user',
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      is_pro: pro === 'pro',
      // aal is the server-side stand-in for auth.jwt() ->> 'aal'. Routes that
      // require a second factor check THIS, once they stop seeing the JWT: a
      // cookie session at aal1 must keep being refused key minting.
      aal: session.aal ?? 'aal1',
      session_id: session.id,
      expires_at: session.expiresAt ?? null,
      idle_expires_at: session.idleExpiresAt ?? null,
    },
    200,
    request,
  )
}
