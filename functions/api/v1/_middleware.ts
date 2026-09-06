import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '../../../src/lib/supabaseConfig'
import { json, resolveAllowedOrigin } from '../_common'

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

  try {
    // Hash the API key
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Rate Limiting (1000 requests per day per key)
    // We use the provided IOC_CACHE KV binding if it exists.
    const kv = env.IOC_CACHE;
    if (kv) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const rlKey = `rl_${hashHex}_${today}`;
      const currentVal = await kv.get(rlKey);
      const count = currentVal ? parseInt(currentVal, 10) : 0;

      if (count >= 1000) {
        return json({ error: 'Rate limit exceeded. Maximum 1000 requests per day.' }, 429, request);
      }

      await kv.put(rlKey, (count + 1).toString(), { expirationTtl: 86400 }); // Expire after 1 day
    }

    // Validate the hash via Supabase RPC. validate_api_key_hash is SECURITY
    // DEFINER and REVOKEd from anon (it reads the api_keys table), so this must
    // run with the server-only service_role key — the same pattern the report
    // endpoints use. Fail closed if the key is absent rather than falling back
    // to the anon client, which would make every request "Invalid API key".
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured — cannot validate API keys.');
      return json({ error: 'API authentication is temporarily unavailable.' }, 503, request);
    }
    const adminClient = createClient(env.SUPABASE_URL || SUPABASE_URL, serviceKey);

    const { data: userId, error } = await adminClient.rpc('validate_api_key_hash', { client_hash: hashHex });

    if (error || !userId) {
      return json({ error: 'Invalid or revoked API key' }, 401, request);
    }

    // Attach user context for downstream functions
    context.data = { userId };

    const response = await next();
    
    // Ensure CORS headers are present on actual responses
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', resolveAllowedOrigin(request));
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (err: any) {
    return json({ error: 'Internal Server Error' }, 500, request);
  }
};
