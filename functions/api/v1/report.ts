import supabaseClient from '../../../src/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../../src/lib/supabaseConfig'
import { isValidPublicIp, isValidCategory, MAX_COMMENT_LENGTH } from '../../../src/lib/apiValidation'

/** Minimal server-side HTML sanitiser — strips all HTML tags. */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

export const onRequestPost = async (context: any) => {
  const { request, data, env } = context;
  const userId = data.userId; // Provided by middleware

  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const { ip, category, comment } = body ?? {};

    if (typeof ip !== 'string' || typeof category !== 'string' || typeof comment !== 'string') {
      return new Response(JSON.stringify({ error: "Missing required fields: ip, category, comment" }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanIp = ip.trim();
    const cleanCategory = category.trim();
    const cleanComment = stripHtml(comment.trim());

    if (!cleanIp || !cleanCategory || !cleanComment) {
      return new Response(JSON.stringify({ error: "Missing required fields: ip, category, comment" }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Reject anything that isn't a publicly routable IP so the API cannot be
    // used to poison the community blocklist with junk or internal addresses.
    if (!isValidPublicIp(cleanIp)) {
      return new Response(JSON.stringify({ error: "Invalid IP address. Provide a public IPv4 or IPv6 address." }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!isValidCategory(cleanCategory)) {
      return new Response(JSON.stringify({ error: "Invalid category." }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (cleanComment.length > MAX_COMMENT_LENGTH) {
      return new Response(JSON.stringify({ error: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters).` }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Fetch user's alias (display label only — NOT used for dedup anymore,
    //    since usernames are mutable and not guaranteed unique across users
    //    without a profile row).
    let reporter_alias = "API User";
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profile && profile.username) {
      reporter_alias = profile.username;
    }

    // 2. Insert via the SECURITY DEFINER RPC using the server-only service_role
    //    key. The API key was already validated by the middleware, so the
    //    privileged write happens server-side and the RPC can be REVOKEd from
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
      return new Response(JSON.stringify({ error: "Reporting is temporarily unavailable." }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      })
    }
    const adminClient = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey)

    const { error: insertError } = await adminClient.rpc('api_insert_report', {
      p_ip: cleanIp,
      p_category: cleanCategory,
      p_comment: cleanComment,
      p_reporter_alias: reporter_alias,
      p_user_id: userId
    });

    if (insertError) {
      // Postgres unique_violation — user already reported this IP.
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ error: "You have already reported this IP." }), {
          status: 409, headers: { 'Content-Type': 'application/json' }
        });
      }
      throw insertError;
    }

    return new Response(JSON.stringify({ success: true, message: "IP reported successfully." }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('POST /api/v1/report failed:', err?.message || err);
    return new Response(JSON.stringify({ error: "Failed to process request" }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
