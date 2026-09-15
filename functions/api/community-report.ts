import supabaseClient from '../../src/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../src/lib/supabaseConfig'
import { isValidPublicIp, isValidCategory, MAX_COMMENT_LENGTH } from '../../src/lib/apiValidation'
import { corsHeaders, stripHtml, json } from './_common'

// Web (browser) report endpoint. Unlike /api/v1/report (programmatic, API-key
// auth), this path is for the website's report form. Bot protection moved to
// Cloudflare's managed challenge at the zone edge (browser surface), so this
// endpoint enforces what remains server-side:
//   1. The reporter is an authenticated Supabase user (JWT verified here).
//   2. Per-IP daily rate limiting via KV.
// Bulk abuse is still strangled upstream: every account behind a report had to
// pass the login Turnstile at sign-in.


export const onRequestOptions = async (context: any) => {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) })
}

const WEB_REPORT_DAILY_LIMIT = 50

export const onRequestPost = async (context: any) => {
  const { request, env } = context

  if (!supabaseClient) return json({ error: 'Service temporarily unavailable.' }, 503, request)

  const clientIp = request.headers.get('CF-Connecting-IP') || ''

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, request)
  }

  const { ip, category, comment } = body ?? {}

  // 1. Authenticate the reporter via their Supabase access token.
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

  // 2. Per-IP daily rate limiting (independent of the per-API-key limit).
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

  // 3. Validate inputs (same rules as the public API).
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

  // 4. Resolve the alias from the authenticated user's profile (can't be spoofed
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

  // 5. Reject duplicates from the same reporter.
  const { data: existing } = await supabaseClient
    .from('reported_ips')
    .select('id')
    .eq('ip', cleanIp)
    .eq('reporter_alias', reporterAlias)
    .maybeSingle()
  if (existing) {
    return json({ error: 'You have already reported this IP. Edit your existing report instead.' }, 409, request)
  }

  // 6. Insert via SECURITY DEFINER RPC using the server-only service_role key.
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
