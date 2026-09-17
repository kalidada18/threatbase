-- ============================================================================
-- API-key minting moved behind a service-bound RPC with a per-user cap
-- ----------------------------------------------------------------------------
-- The "max 3 keys" rule only existed in Profile.tsx as a disabled button —
-- anyone with an account could script PostgREST INSERTs on api_keys directly
-- and mint N keys → N×1000 req/day and N Pro-feed tokens. This adds
-- mint_api_key (SECURITY DEFINER) which checks MFA + the active-key cap in the
-- same transaction as the INSERT, then drops the client INSERT policy so the
-- table is no longer writable from anon/authenticated at all. The Pro-inherit
-- trigger (pro_and_rls_fixes.sql) still fires on the function's INSERT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mint_api_key(p_key_hash text, p_prefix text)
RETURNS TABLE (id uuid, user_id uuid, key_hash text, prefix text,
               created_at timestamptz, is_active boolean, is_pro boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- MFA gate: previously enforced by the restrictive api_keys_require_mfa
  -- policy on INSERT; the function must own that check now.
  IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'MFA required to generate API keys' USING ERRCODE = '42501';
  END IF;

  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'key_hash must be 64 hex chars';
  END IF;
  IF p_prefix IS NULL OR p_prefix !~ '^tb_api_[0-9a-f]{1,16}$' THEN
    RAISE EXCEPTION 'invalid key prefix';
  END IF;

  IF (SELECT count(*) FROM public.api_keys
        WHERE api_keys.user_id = auth.uid() AND api_keys.is_active) >= 3 THEN
    RAISE EXCEPTION 'Key limit reached (max 3 active keys)' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  INSERT INTO public.api_keys (user_id, key_hash, prefix)
  VALUES (auth.uid(), p_key_hash, p_prefix)
  RETURNING api_keys.id, api_keys.user_id, api_keys.key_hash, api_keys.prefix,
            api_keys.created_at, api_keys.is_active, api_keys.is_pro;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_api_key(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mint_api_key(text, text) TO authenticated;

-- Close the direct-insert door: with RLS on and no INSERT policy, every
-- client INSERT is denied. SELECT/UPDATE policies are untouched (listing and
-- revoking own keys still work from the browser).
DROP POLICY IF EXISTS "api_keys_insert_own" ON public.api_keys;
DROP POLICY IF EXISTS "Users can insert their own API keys" ON public.api_keys;
