-- ============================================================================
-- ThreatBase — Row Level Security policies (idempotent, safe to re-run)
-- ----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
--   Enabling RLS with no SELECT policy makes Postgres deny every read, which is
--   why "total reports" and the profile page went blank. A RESTRICTIVE MFA
--   policy on `profiles` made it worse: with no FOR clause it applied to ALL
--   commands, so any user without MFA (aal2) could not even read/create their
--   own profile. This script adds the correct least-privilege policies so the
--   site works again while keeping security tight.
--
-- HOW TO APPLY
--   Paste into Supabase → SQL Editor → Run. Re-running is safe.
--
-- MODEL
--   profiles      public read (display fields only, no email); owner-only writes
--   reported_ips  public read; owner-only edit/delete; inserts ONLY via the
--                 api_insert_report SECURITY DEFINER RPC (no client INSERT policy)
--   disputes      public read (scanner needs the count); authenticated insert
--   api_keys      owner-only AND require MFA (aal2) for every operation
-- ============================================================================

-- 0. Ensure schema is complete and RLS is on ---------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_helper boolean DEFAULT false;

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reported_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys     ENABLE ROW LEVEL SECURITY;

-- Remove the over-broad MFA policy that blocked all non-MFA users on profiles.
-- (MFA belongs on api_keys, not on basic profile reads — see bottom of file.)
DROP POLICY IF EXISTS "Enforce MFA for Profiles" ON public.profiles;

-- ----------------------------------------------------------------------------
-- profiles : OWNER-ONLY read; owner-only insert/update
--
-- ⚠️ CHANGED 2026-09-17. This was `FOR SELECT TO anon, authenticated USING
-- (true)` — a public read of every profile. Production is owner-only: anon
-- SELECT on profiles returns zero rows there (verified directly against the
-- hosted project). The old "profiles holds only public display fields"
-- reasoning misses `role`, which the same hardening pass treats as sensitive
-- enough to guard with a trigger (profile_role_unchanged, A2 CRITICAL).
--
-- Three separate definer workarounds exist precisely BECAUSE this table is
-- owner-only, which is what production intends:
--   * VIEW top_contributors      WITH (security_invoker = false)
--   * VIEW reported_ips_feed     WITH (security_invoker = false)
--   * FUNCTION first_user_ids()  SECURITY DEFINER, crosses the same wall
-- If profiles were publicly readable, none of them would be necessary.
--
-- Cross-user display data (usernames, avatars, admin badges) reaches anon
-- through those views, which expose exactly five columns and no role strings.
-- Nothing in the browser reads another user's profile row: AuthContext only
-- ever selects its own (`.eq('id', userId)`).
--
-- If a sensitive column is ever added here, it stays protected by this policy.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- reported_ips : public read; owner-only edit/delete.
--   Ownership is the reporter's profile username, resolved SERVER-SIDE from
--   auth.uid(). This is the real fix for the client-side IDOR in ReportIP.tsx:
--   the browser's `.eq('reporter_alias', alias)` filter is attacker-controlled,
--   but this policy only lets a user touch rows whose alias is genuinely theirs.
--   Inserts intentionally have NO policy — they must go through the
--   api_insert_report RPC (Turnstile + auth + rate-limit enforced server-side).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "reported_ips_select_public" ON public.reported_ips;
CREATE POLICY "reported_ips_select_public" ON public.reported_ips
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "reported_ips_update_own" ON public.reported_ips;
CREATE POLICY "reported_ips_update_own" ON public.reported_ips
  FOR UPDATE TO authenticated
  USING      (reporter_alias = (SELECT p.username FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (reporter_alias = (SELECT p.username FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "reported_ips_delete_own" ON public.reported_ips;
CREATE POLICY "reported_ips_delete_own" ON public.reported_ips
  FOR DELETE TO authenticated
  USING (reporter_alias = (SELECT p.username FROM public.profiles p WHERE p.id = auth.uid()));

-- ----------------------------------------------------------------------------
-- disputes : public read (scanner counts disputes for anonymous visitors);
--            authenticated users may submit a dispute.
--   See follow-up note at the bottom about making disputes tamper-proof.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "disputes_select_public" ON public.disputes;
CREATE POLICY "disputes_select_public" ON public.disputes
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "disputes_insert_auth" ON public.disputes;
CREATE POLICY "disputes_insert_auth" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- api_keys : owner-only, AND require MFA (aal2) for EVERY operation.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "api_keys_select_own" ON public.api_keys;
CREATE POLICY "api_keys_select_own" ON public.api_keys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_insert_own" ON public.api_keys;
CREATE POLICY "api_keys_insert_own" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_update_own" ON public.api_keys;
CREATE POLICY "api_keys_update_own" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Restrictive MFA gate. RESTRICTIVE policies are AND-ed with the owner policies
-- above. IMPORTANT: a RESTRICTIVE policy with only USING does NOT gate INSERTs
-- (INSERT is checked by WITH CHECK), so we set BOTH — otherwise a non-MFA user
-- could still create keys. This replaces the earlier "Enforce MFA for API Keys".
DROP POLICY IF EXISTS "Enforce MFA for API Keys" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_require_mfa"     ON public.api_keys;
CREATE POLICY "api_keys_require_mfa" ON public.api_keys
  AS RESTRICTIVE TO authenticated
  USING      ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

-- ============================================================================
-- VERIFICATION (run these after applying)
-- ============================================================================
-- 1) RLS on every table (relrowsecurity must be true):
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('profiles','reported_ips','disputes','api_keys');
--
-- 2) Policies present:
--    SELECT tablename, policyname, permissive, roles, cmd
--    FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
--
-- 3) SECURITY DEFINER functions have search_path pinned (proconfig must list
--    search_path=""). If proconfig is NULL the search_path is NOT pinned:
--    SELECT proname, prosecdef, proconfig FROM pg_proc
--    WHERE proname IN ('validate_api_key_hash','api_insert_report',
--                      'migrate_reporter_alias','delete_user');

-- ============================================================================
-- ⚠️  FOLLOW-UP HARDENING — read before relying on this as "fully secure"
-- ============================================================================
-- A) SEARCH_PATH BREAKAGE: You ran  ALTER FUNCTION … SET search_path = ''.
--    With an empty search_path, the function BODY must schema-qualify every
--    object (public.api_keys, public.reported_ips, auth.uid(), …). If any body
--    used bare names, that RPC now ERRORS. Re-test: validate an API key, submit
--    a community report, change a username (migrate_reporter_alias), delete an
--    account. If any fail, edit the function to qualify names with public./auth.
--
-- B) RPCs ARE CALLABLE WITH THE PUBLIC ANON KEY (important):
--    Postgres grants EXECUTE to PUBLIC by default, so anyone holding the
--    publishable anon key (it ships in the browser bundle) can call
--    `api_insert_report` directly via PostgREST and bypass Turnstile, the login
--    check, and the KV rate limit — i.e. poison the community blocklist.
--    The clean fix is to have the Cloudflare Functions use the SERVICE_ROLE key
--    (server-only secret) for the privileged insert, then lock the RPC down:
--
--      -- ONLY after the server is switched to the service_role key:
--      -- REVOKE EXECUTE ON FUNCTION public.api_insert_report(text,text,text,text) FROM anon, public;
--      -- GRANT  EXECUTE ON FUNCTION public.api_insert_report(text,text,text,text) TO service_role;
--
--    Do NOT revoke yet if your Functions still use the anon key — reports would
--    break. (Ask Claude to implement the service_role swap in functions/.)
--
-- C) DISPUTE INTEGRITY: `disputes` has no user_id, so reporter_alias is
--    client-chosen and one account can flip an indicator to "disputed" (the
--    scanner clears malicious at >=3 disputes). Recommended schema change:
--      ALTER TABLE public.disputes ADD COLUMN user_id uuid DEFAULT auth.uid();
--      CREATE UNIQUE INDEX disputes_ip_user_uniq ON public.disputes (ip, user_id);
--    then tighten the insert policy to WITH CHECK (auth.uid() = user_id).
