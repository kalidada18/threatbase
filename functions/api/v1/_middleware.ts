import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../../src/lib/supabaseConfig'
import { json, resolveAllowedOrigin } from '../_common'

// Tiered daily quotas, keyed off the holder's api_keys.is_pro entitlement —
// the same source the Pro feed (functions/feed) and the bulk-hunt gate
// (functions/api/_pro.ts) use. Free = 1,000/day, Pro = 20,000/day.
const FREE_DAILY_LIMIT = 1000
const PRO_DAILY_LIMIT = 20000
// Tier reads are one indexed query per user per this TTL, KV-cached. Any
// failure (KV blip, DB error) falls to the *stricter* free limit.
const PRO_TIER_CACHE_TTL = 300
// Per-IP cap on *failed* auth attempts. Each attempt costs a full service-role
// RPC round-trip, so this bounds the unauthenticated work budget. 100/day is
// generous for a legit user mistyping a key and still leaves the RPC cheap.
const AUTH_FAIL_DAILY_LIMIT = 100

export const onRequestOptions = async (context: any) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': resolveAllowedOrigin(context.request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  });
};

export const onRequest = async (context: any) => {
  const { request, env, next } = context;

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return onRequestOptions(context);
  }

  // Extract API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return json({ error: 'Missing x-api-key header' }, 401, request);
  }

  // Hash the API key
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const kv = env.IOC_CACHE;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  // CF-Connecting-IP is set by Cloudflare and cannot be spoofed by the client.
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Count one attempt against a KV bucket. Read-modify-write, no atomicity —
  // worst case a fast flood overshoots a limit by a handful, not by 1000x.
  const bump = async (key: string): Promise<number> => {
    const cur = await kv.get(key);
    const count = cur ? parseInt(cur, 10) : 0;
    await kv.put(key, (count + 1).toString(), { expirationTtl: 86400 });
    return count + 1;
  };

  try {
    // 1. Per-IP failure gate — BEFORE the RPC, so a flood of random keys can't
    //    buy unlimited service-role round-trips (the old order validated the
    //    expensive part first and rate-limited on the attacker-chosen hash,
    //    which rotates every request).
    if (kv) {
      const flKey = `fl_${clientIp}_${today}`;
      try {
        const cur = await kv.get(flKey);
        if (cur && parseInt(cur, 10) >= AUTH_FAIL_DAILY_LIMIT) {
          return json({ error: 'Too many failed authentication attempts. Try again tomorrow.' }, 429, request);
        }
      } catch (err) {
        // KV down: fail open. The RPC below still gates access; a silent loss
        // of the limiter beats a 500 for every legit caller.
        console.error('auth-failure counter unavailable:', err);
      }
    }

    // 2. Validate the hash via Supabase RPC. validate_api_key_hash is SECURITY
    //    DEFINER and REVOKEd from anon (it reads the api_keys table), so this must
    //    run with the server-only service_role key — the same pattern the report
    //    endpoints use. Fail closed if the key is absent rather than falling back
    //    to the anon client, which would make every request "Invalid API key".
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured — cannot validate API keys.');
      return json({ error: 'API authentication is temporarily unavailable.' }, 503, request);
    }
    const adminClient = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey);

    const { data: userId, error } = await adminClient.rpc('validate_api_key_hash', { client_hash: hashHex });

    if (error || !userId) {
      if (kv) {
        try { await bump(`fl_${clientIp}_${today}`); } catch { /* best-effort */ }
      }
      return json({ error: 'Invalid or revoked API key' }, 401, request);
    }

    // 3. Resolve the caller's tier (superadmin counts as Pro everywhere,
    //    matching functions/api/_pro.ts).
    let dailyLimit = FREE_DAILY_LIMIT;
    try {
      const tierKey = `pro_${userId}`;
      let pro: boolean | null = null;
      if (kv) {
        try {
          const cached = await kv.get(tierKey);
          if (cached === '1') pro = true;
          else if (cached === '0') pro = false;
        } catch { /* KV miss behaves like a cold tier check */ }
      }
      if (pro === null) {
        const { data: prof } = await adminClient
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();
        if (prof?.role === 'superadmin') {
          pro = true;
        } else {
          // limit(1), not maybeSingle(): api_keys_inherit_pro can briefly leave
          // two active pro rows during a rotate-and-revoke.
          const { data: rows } = await adminClient
            .from('api_keys')
            .select('is_pro')
            .eq('user_id', userId)
            .eq('is_pro', true)
            .eq('is_active', true)
            .limit(1);
          pro = !!rows?.length;
        }
        if (kv) {
          try { await kv.put(tierKey, pro ? '1' : '0', { expirationTtl: PRO_TIER_CACHE_TTL }); } catch { /* best-effort */ }
        }
      }
      dailyLimit = pro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
    } catch (err) {
      console.error('tier lookup failed — applying free limit:', err);
    }

    // 4. Per-key daily limit — only for *validated* keys, so unauthenticated
    //    callers can neither write arbitrary rl_ rows nor sidestep a bucket
    //    keyed on a hash they chose to be new every time.
    let rlKey: string | undefined;
    if (kv) {
      try {
        rlKey = `rl_${hashHex}_${today}`;
        const cur = await kv.get(rlKey);
        const count = cur ? parseInt(cur, 10) : 0;
        if (count >= dailyLimit) {
          return json({ error: `Rate limit exceeded. Maximum ${dailyLimit} requests per day.` }, 429, request);
        }
        await kv.put(rlKey, (count + 1).toString(), { expirationTtl: 86400 });
      } catch (err) {
        console.error('rate-limit bucket unavailable:', err);
        rlKey = undefined;
      }
    }

    // Attach user context for downstream functions. rlKey lets POST /scan charge
    // a multi-item batch per item instead of per request.
    context.data = { userId, rlKey, dailyLimit };

    const response = await next();

    // Ensure CORS headers are present on actual responses
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', resolveAllowedOrigin(request));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch {
    return json({ error: 'Internal Server Error' }, 500, request);
  }
};
