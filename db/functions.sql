-- ============================================================================
-- ThreatBase — SECURITY DEFINER functions (canonical definitions)
-- ----------------------------------------------------------------------------
-- Version-controlled copy of the privileged RPCs so the database is
-- reproducible from the repo. Dumped from production via pg_get_functiondef.
-- Apply RLS from db/rls_policies.sql.
--
-- ⚠️  api_insert_report below is STALE (prod has a 5-arg version) and is
--    commented out. Re-running the rest is safe (CREATE OR REPLACE); re-running
--    a mismatched signature is NOT — it creates an anon-callable overload.
--    See the note on that function.
--
-- All four are SECURITY DEFINER with `search_path = ''`, so every object inside
-- the body MUST stay schema-qualified (public./auth.).
-- ============================================================================

-- Validate a hashed API key and return the owning user id (or NULL). Called by
-- functions/api/v1/_middleware.ts. Safe to remain anon-executable.
CREATE OR REPLACE FUNCTION public.validate_api_key_hash(client_hash text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT user_id
  FROM public.api_keys
  WHERE key_hash = client_hash
    AND is_active = true
  LIMIT 1;
$function$;

-- Insert a community report, bypassing RLS for the privileged server path.
--
-- ⚠️  STALE — DO NOT RUN THIS BLOCK. The definition below is the OLD 4-arg
--   version. Production now has a 5-arg version:
--     api_insert_report(p_category, p_comment, p_ip, p_reporter_alias, p_user_id)
--   Running the 4-arg CREATE OR REPLACE would NOT replace it — it would create a
--   second overload carrying Postgres's default EXECUTE-to-PUBLIC grant, making
--   the RPC anon-callable again and bypassing Turnstile, auth and rate limiting.
--
--   Re-dump the real definition before trusting this file, then replace the
--   commented block with the output:
--     SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'api_insert_report';
--
-- CREATE OR REPLACE FUNCTION public.api_insert_report(p_ip text, p_category text, p_comment text, p_reporter_alias text)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- BEGIN
--   IF p_ip IS NULL OR length(p_ip) = 0 OR length(p_ip) > 45 THEN
--     RAISE EXCEPTION 'invalid ip';
--   END IF;
--   IF p_category IS NULL OR length(p_category) = 0 OR length(p_category) > 50 THEN
--     RAISE EXCEPTION 'invalid category';
--   END IF;
--   IF length(coalesce(p_comment, '')) > 1000 THEN
--     RAISE EXCEPTION 'comment too long';
--   END IF;
--   IF length(coalesce(p_reporter_alias, '')) > 50 THEN
--     RAISE EXCEPTION 'reporter_alias too long';
--   END IF;
--
--   INSERT INTO public.reported_ips (ip, category, comment, reporter_alias)
--   VALUES (p_ip, p_category, p_comment, p_reporter_alias);
-- END;
-- $function$;

-- Rename a reporter's alias across their reports. Guards that the caller is
-- authenticated AND owns the old alias.
CREATE OR REPLACE FUNCTION public.migrate_reporter_alias(p_old_alias text, p_new_alias text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Explicit auth guard (do not rely on caller to enforce this)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Validate new alias length before any DML
  IF p_new_alias IS NULL OR length(trim(p_new_alias)) < 3 OR length(p_new_alias) > 50 THEN
    RAISE EXCEPTION 'New alias must be 3-50 characters' USING ERRCODE = '22023';
  END IF;

  -- Only allow if the authenticated caller owns the old alias
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND username = p_old_alias
  ) THEN
    RAISE EXCEPTION 'Not authorized to migrate this alias';
  END IF;

  UPDATE public.reported_ips
  SET reporter_alias = p_new_alias
  WHERE reporter_alias = p_old_alias;
END;
$function$;

-- Delete the calling user's own auth account.
CREATE OR REPLACE FUNCTION public.delete_user()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  delete from auth.users where id = auth.uid();
$function$;

-- Pro feed token check for /feed/<token>/... delivery (Cloudflare Function).
-- Applied 2026-09-05 via supabase migration pro_feed_tokens, alongside:
--   ALTER TABLE public.api_keys ADD COLUMN is_pro boolean NOT NULL DEFAULT false;
-- SECURITY DEFINER + revoked from anon/authenticated — same lockdown as
-- validate_api_key_hash (it reads api_keys directly, so no public EXECUTE).
CREATE OR REPLACE FUNCTION public.validate_feed_token(client_hash text)
 RETURNS TABLE(user_id uuid, is_pro boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT a.user_id, a.is_pro
  FROM public.api_keys a
  WHERE a.key_hash = client_hash
    AND a.is_active = true
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.validate_feed_token(text) FROM PUBLIC, anon, authenticated;
