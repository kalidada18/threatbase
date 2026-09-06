import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../../src/lib/supabaseConfig'
import { isValidPublicIp, isValidCategory, MAX_COMMENT_LENGTH } from '../../../src/lib/apiValidation'
import { stripHtml, json } from '../_common'

export const onRequestPost = async (context: any) => {
  const { request, data, env } = context;
  const userId = data.userId; // Provided by middleware

  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { ip, category, comment } = body ?? {};

    if (typeof ip !== 'string' || typeof category !== 'string' || typeof comment !== 'string') {
      return json({ error: "Missing required fields: ip, category, comment" }, 400);
    }

    const cleanIp = ip.trim();
    const cleanCategory = category.trim();
    const cleanComment = stripHtml(comment.trim());

    if (!cleanIp || !cleanCategory || !cleanComment) {
      return json({ error: "Missing required fields: ip, category, comment" }, 400);
    }

    // Reject anything that isn't a publicly routable IP so the API cannot be
    // used to poison the community blocklist with junk or internal addresses.
    if (!isValidPublicIp(cleanIp)) {
      return json({ error: "Invalid IP address. Provide a public IPv4 or IPv6 address." }, 400);
    }

    if (!isValidCategory(cleanCategory)) {
      return json({ error: "Invalid category." }, 400);
    }

    if (cleanComment.length > MAX_COMMENT_LENGTH) {
      return json({ error: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters).` }, 400);
    }

    // reporter_alias is a display label only — NOT used for dedup. Dedup is
    // enforced at the DB level via a unique constraint on (ip, user_id), so
    // fetching the profile username on every request was a redundant roundtrip.
    const reporter_alias = "API User";

    // 2. Insert via the SECURITY DEFINER RPC using the server-only service_role
    //    key. The API key was already validated by the middleware, so the
    //    privileged write happens server-side and the RPC is REVOKEd from
    //    anon/public (see db/lock_down_api_insert_report.sql) to close the
    //    direct-PostgREST bypass. Fail closed if the key is absent.
    //
    //    Dedup is enforced at the DB level via a unique constraint on
    //    (ip, user_id) rather than a check-then-insert — this avoids both a
    //    race condition between concurrent requests and false collisions
    //    between different users who share the same reporter_alias.
    const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured — cannot insert report.')
      return json({ error: "Reporting is temporarily unavailable." }, 503)
    }
    const adminClient = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey)

    //    p_user_id is REQUIRED — it is what the (ip, user_id) unique index keys
    //    on. Omitting it made every call 404 (PGRST202) and fall through to a
    //    direct insert that left user_id NULL, so the index never fired and
    //    dedup silently did nothing. No fallback: fail closed instead of
    //    writing rows the dedup and ownership rules can't see.
    const { error: insertError } = await adminClient.rpc('api_insert_report', {
      p_ip: cleanIp,
      p_category: cleanCategory,
      p_comment: cleanComment,
      p_reporter_alias: reporter_alias,
      p_user_id: userId,
    });

    if (insertError) {
      // Postgres unique_violation — user already reported this IP.
      if (insertError.code === '23505') {
        return json({ error: "You have already reported this IP." }, 409);
      }
      throw insertError;
    }

    return json({ success: true, message: "IP reported successfully." });

  } catch (err: any) {
    console.error('POST /api/v1/report failed:', err?.message || err);
    return json({ error: "Failed to process request" }, 500);
  }
}
