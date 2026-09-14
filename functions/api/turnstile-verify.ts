import { corsHeaders, json, verifyTurnstile, TURNSTILE_HOSTNAMES_DEFAULT } from './_common'

/** Pre-auth Turnstile gate for the OAuth sign-in flow.
 *
 *  The sitekey's SECRET is read server-side from env (TURNSTILE_SECRET —
 *  set it with `wrangler pages secret put TURNSTILE_SECRET`); it never
 *  reaches the browser. The client sends the single-use token from the
 *  login widget (data-action "login"); we redeem it at Cloudflare's
 *  siteverify and return 200 only on success. Missing / invalid / expired /
 *  replayed tokens all get 403. The browser only continues to the OAuth
 *  redirect after this call passes, so scripted sign-in attempts die here.
 *
 *  Hostname binding: TURNSTILE_HOSTNAMES env (comma-separated), defaults to
 *  the production host. */

export const onRequestOptions = async (context: any) => {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) })
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, request)
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || ''
  const result = await verifyTurnstile(
    body?.turnstileToken,
    clientIp,
    env.TURNSTILE_SECRET,
    'login', // the action we rendered on the widget — reject off-surface tokens
    env.TURNSTILE_HOSTNAMES || TURNSTILE_HOSTNAMES_DEFAULT,
  )

  if (!result.ok) {
    // One generic message for every failure mode: don't leak whether a token
    // was forged, expired, or replayed.
    return json({ error: 'Human verification failed. Complete the check and try again.' }, 403, request)
  }
  return json({ ok: true }, 200, request)
}
