import supabaseClient from '../../src/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../src/lib/supabaseConfig'
import { isValidPublicIp, isValidCategory, MAX_COMMENT_LENGTH } from '../../src/lib/apiValidation'

// Web (browser) report endpoint. Unlike /api/v1/report (programmatic, API-key
// auth), this path is for the website's report form. It enforces three things
// the old browser->Supabase-direct insert could not:
//   1. Cloudflare Turnstile is verified SERVER-SIDE (token actually checked).
//   2. The reporter is an authenticated Supabase user (JWT verified here).
//   3. Per-IP daily rate limiting via KV.
// Because verification and the privileged write happen in the same request,
// none of the client-side bypasses apply.

// Allowed origins for CORS. In production only the main domain should be
// permitted; locally we fall back to '*' for dev convenience.
const ALLOWED_ORIGIN = 'https://threatbase.qzz.io'

/**
 * Strict dev-origin check: exact host + optional port only, so a suffix trick
 * like http://localhost.attacker.com can't satisfy a prefix match.
 */
function isDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || ''
  const isAllowed = origin === ALLOWED_ORIGIN || isDevOrigin(origin)
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

/** Minimal server-side HTML sanitiser — strips all HTML tags. */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

const json = (obj: any, status = 200, request?: Request) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...(request ? corsHeaders(request) : { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN }) },
  })

export const onRequestOptions = async (context: any) => {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) })
}

/** Verify a Turnstile token against Cloudflare's siteverify endpoint. */
async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const data: any = await res.json()
    return data?.success === true
  } catch {
    return false
  }
}

const WEB_REPORT_DAILY_LIMIT = 50

export const onRequestPost = async (context: any) => {
  const { request, env } = context

  if (!supabaseClient) return json({ error: 'Service temporarily unavailable.' }, 503, request)

  // Fail closed: the entire purpose of this endpoint is server-side verification.
  const secret = env.TURNSTILE_SECRET
  if (!secret) {
    console.error('TURNSTILE_SECRET is not configured — rejecting report.')
    return json({ error: 'Verification is not configured on the server.' }, 500, request)
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || ''

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, request)
  }

  const { ip, category, comment, turnstileToken } = body ?? {}

  // 1. Human verification (server-side). A forged/empty/replayed token fails here.
  if (typeof turnstileToken !== 'string' || !turnstileToken) {
    return json({ error: 'Missing human-verification token.' }, 400, request)
  }
  const isHuman = await verifyTurnstile(turnstileToken, clientIp, secret)
  if (!isHuman) {
    return json({ error: 'Human verification failed. Please complete the check again.' }, 403, request)
  }

  // 2. Authenticate the reporter via their Supabase access token.
  const authHeader = request.headers.get('Authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!accessToken) {
    return json({ error: 'You must be signed in to report.' }, 401, request)
  }
  const { data: userData, error: userErr } = await supabaseClient.auth.getUser(accessToken)
  const user = userData?.user
  if (userErr || !user) {
    return json({ error: 'Your session has expired. Please sign in again.' }, 401, request)
  }

  // 3. Per-IP daily rate limiting (independent of the per-API-key limit).
  const kv = env.IOC_CACHE
  if (kv && clientIp) {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const rlKey = `web_report_${clientIp}_${today}`
    const current = await kv.get(rlKey)
    const count = current ? parseInt(current, 10) : 0
    if (count >= WEB_REPORT_DAILY_LIMIT) {
      return json({ error: 'Daily report limit reached for your network. Try again tomorrow.' }, 429, request)
    }
    await kv.put(rlKey, (count + 1).toString(), { expirationTtl: 86400 })
  }

  // 4. Validate inputs (same rules as the public API).
  const cleanIp = String(ip ?? '').trim()
  const cleanCategory = String(category ?? '').trim()
  const cleanComment = String(comment ?? '').trim()

  if (!cleanIp || !cleanCategory || !cleanComment) {
    return json({ error: 'Missing required fields: ip, category, comment.' }, 400, request)
  }
  if (!isValidPublicIp(cleanIp)) {
    return json({ error: 'Invalid IP address. Provide a public IPv4 or IPv6 address.' }, 400, request)
  }
  if (!isValidCategory(cleanCategory)) {
    return json({ error: 'Invalid category.' }, 400, request)
  }
  if (cleanComment.length > MAX_COMMENT_LENGTH) {
    return json({ error: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters).` }, 400, request)
  }

  // 5. Resolve the alias from the authenticated user's profile (can't be spoofed
  //    by the client — the browser no longer chooses its own reporter name).
  let reporterAlias = 'Anonymous'
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (profile?.username) {
    reporterAlias = profile.username
  } else if (user) {
    const fallback = user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
    const fallbackAlias = fallback.replace(/[^a-zA-Z0-9_-]/g, '')
    if (fallbackAlias) reporterAlias = fallbackAlias
  }

  // 6. Reject duplicates from the same reporter.
  const { data: existing } = await supabaseClient
    .from('reported_ips')
    .select('id')
    .eq('ip', cleanIp)
    .eq('reporter_alias', reporterAlias)
    .maybeSingle()
  if (existing) {
    return json({ error: 'You have already reported this IP. Edit your existing report instead.' }, 409, request)
  }

  // 7. Insert via SECURITY DEFINER RPC using the server-only service_role key.
  //    All checks (Turnstile, auth, rate limit, validation) have already passed
  //    above, so the privileged write happens server-side and the RPC is
  //    REVOKEd from anon/authenticated (see db/lock_down_api_insert_report.sql)
  //    to close the direct-PostgREST bypass. Fail closed if the key is absent —
  //    there is no anon-key fallback, because anon has no EXECUTE on the RPC and
  //    a direct table insert would leave user_id NULL (breaking dedup and
  //    ownership).
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not configured — cannot insert report.')
    return json({ error: 'Reporting is temporarily unavailable.' }, 503, request)
  }

  const adminClient = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey)
  const { error: insertError } = await adminClient.rpc('api_insert_report', {
    p_ip: cleanIp,
    p_category: cleanCategory,
    p_comment: stripHtml(cleanComment),
    p_reporter_alias: reporterAlias,
    p_user_id: user.id,
  })

  if (insertError) {
    console.error('community-report insert failed:', insertError?.message || insertError)
    return json({ error: 'Failed to save report. Please try again.' }, 500, request)
  }

  return json({ success: true, reporter_alias: reporterAlias }, 200, request)
}
