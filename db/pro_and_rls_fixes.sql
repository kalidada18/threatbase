-- ============================================================================
-- Fix #4 — Pro/free entitlement + RLS audit (APPLIED to production 2026-09-05)
-- ----------------------------------------------------------------------------
-- Applied as Supabase migrations, in this order:
--   fix_profile_role_escalation_and_first_user_ids
--   fix_dispute_forgery_and_report_dedup
--   fix_duplicate_and_stale_policies
--   fix_profile_role_escalation_column_grants
--   allow_profile_upsert_id_column
--   pro_entitlement_inherits_to_new_keys
--   lock_down_trigger_function_execute
--   fix_comment_username_impersonation
--
-- This file is the consolidated, idempotent record. Verification queries at the
-- bottom. NOTE: db/rls_policies.sql is now STALE where it conflicts with this
-- file — re-running it would re-introduce the permissive disputes insert policy
-- (see #4) and the duplicate policies (#7).
-- ============================================================================

-- ── 1. Pro was unreachable for paying customers ─────────────────────────────
-- db/pro_admin.md's flow is: flip is_pro on the customer's key, then have them
-- revoke it and generate a fresh one (the plaintext key, and therefore the Pro
-- feed URL, only exists at creation). But is_pro DEFAULTs false and
-- `authenticated` has no INSERT grant on that column, so the fresh key was
-- always is_pro = false → /feed/<token>/... returned 403 "This is a Threatbase
-- Pro feed" to a customer who had paid, and Profile.tsx never rendered the Pro
-- URL block. Pro is an entitlement of the USER, so let new keys inherit it.
-- Inactive keys still count: revoking a key must not cancel a subscription.
CREATE OR REPLACE FUNCTION public.api_keys_inherit_pro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT NEW.is_pro THEN
    NEW.is_pro := EXISTS (
      SELECT 1 FROM public.api_keys a
      WHERE a.user_id = NEW.user_id AND a.is_pro
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS api_keys_inherit_pro ON public.api_keys;
CREATE TRIGGER api_keys_inherit_pro
  BEFORE INSERT ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.api_keys_inherit_pro();

-- A free user cannot self-grant: `authenticated` has INSERT only on
-- (id, user_id, key_hash, prefix, created_at), so an is_pro=true in the request
-- body is rejected by the column grant, not merely ignored.

-- ── 2. profiles: role / is_helper were self-writable (privilege escalation) ──
-- Profile.tsx grants the "Community Helper" badge from profile.role /
-- is_helper and calls them server-controlled, but anon+authenticated held a
-- TABLE-level UPDATE/INSERT grant, which covers every column. Any signed-in
-- user could set role='admin'. Column-level REVOKE is a no-op against a
-- table-level grant — the grant itself has to go.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT INSERT (id, username, full_name, avatar_url, bio, website, created_at, updated_at)
  ON public.profiles TO authenticated;
-- UPDATE(id) is required because PostgREST's .upsert() emits
-- INSERT … ON CONFLICT DO UPDATE SET including the conflict column. Safe:
-- profiles_update_own pins auth.uid() = id in USING and WITH CHECK.
GRANT UPDATE (id, username, full_name, avatar_url, bio, website, updated_at)
  ON public.profiles TO authenticated;

-- ── 3. first_user_ids() did not exist ───────────────────────────────────────
-- Profile.tsx rpc('first_user_ids') 404'd on every profile load, so the
-- First/Second/Third Blood badges never rendered. profiles is owner-only
-- readable, so this is SECURITY DEFINER and returns ids only.
CREATE OR REPLACE FUNCTION public.first_user_ids()
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.id FROM public.profiles p ORDER BY p.created_at LIMIT 3;
$function$;
REVOKE ALL ON FUNCTION public.first_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.first_user_ids() TO authenticated, service_role;

-- ── 4. disputes: forgeable, and the integrity fix had been reverted ─────────
-- db/disputes_integrity.sql set WITH CHECK (auth.uid() = user_id), but a later
-- run of db/rls_policies.sql re-created disputes_insert_auth with
-- WITH CHECK (true), and the older "Authenticated users can insert disputes"
-- policy was still present. Permissive policies are OR-ed, so the widest won:
-- one account could insert unlimited disputes with a forged user_id and
-- whitewash any indicator (the scanner clears malicious at >= 3 disputes, and
-- pipeline/sync_community_reports.py writes >= 3 into false_positives.txt).
DROP POLICY IF EXISTS "Authenticated users can insert disputes" ON public.disputes;
DROP POLICY IF EXISTS "disputes_insert_auth" ON public.disputes;
CREATE POLICY "disputes_insert_auth" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND length(ip) between 1 and 45
    AND length(reporter_alias) between 1 and 50
    AND coalesce(reason, '') <> ''
    AND length(coalesce(reason, '')) <= 1000
  );
-- reporter_alias is client-chosen, so (ip, reporter_alias) was bypassable by
-- varying the alias. (ip, user_id) from disputes_integrity.sql is the real key.
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS unique_dispute;

-- ── 5. report dedup index was missing ───────────────────────────────────────
-- functions/api/v1/report.ts and functions/api/community-report.ts both
-- document dedup as "enforced at the DB level via a unique constraint on
-- (ip, user_id)". No such index existed, so the 23505 → 409 "already reported"
-- branch was dead code and one API key could report the same IP unboundedly.
CREATE UNIQUE INDEX IF NOT EXISTS reported_ips_ip_user_uniq
  ON public.reported_ips (ip, user_id)
  WHERE user_id IS NOT NULL;

-- ── 6. delete_user() always failed for anyone with reports ──────────────────
-- reported_ips.user_id → auth.users had no ON DELETE action, so the "Delete
-- Account" button raised 23503. Detach the rows rather than delete community
-- intel (profiles/api_keys/comments already CASCADE).
ALTER TABLE public.reported_ips DROP CONSTRAINT IF EXISTS reported_ips_user_id_fkey;
ALTER TABLE public.reported_ips
  ADD CONSTRAINT reported_ips_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 7. duplicate / stale policies from repeated rls_policies.sql runs ───────
-- Postgres OR-s permissive policies, so extras can only widen access. The
-- api_keys trio was granted to PUBLIC (not authenticated), which is what the
-- RESTRICTIVE MFA policy had to fight.
DROP POLICY IF EXISTS "Users can view their own API keys"    ON public.api_keys;
DROP POLICY IF EXISTS "Users can insert their own API keys"  ON public.api_keys;
DROP POLICY IF EXISTS "Users can update their own API keys"  ON public.api_keys;
DROP POLICY IF EXISTS "Allow users to update their own reports"   ON public.reported_ips;
DROP POLICY IF EXISTS "Users can only update their own reports"   ON public.reported_ips;
DROP POLICY IF EXISTS "reported_ips_update_disabled_no_owner_col" ON public.reported_ips;
DROP POLICY IF EXISTS "Anyone can read reports"                   ON public.reported_ips;
DROP POLICY IF EXISTS "Disputes are viewable by everyone"         ON public.disputes;

-- api_keys UPDATE is column-restricted to is_active by GRANT, but the policy
-- had no WITH CHECK, so a user could move a key to another user_id.
DROP POLICY IF EXISTS "api_keys_update_own" ON public.api_keys;
CREATE POLICY "api_keys_update_own" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 8. comments.username was client-supplied (impersonation) ────────────────
-- ReportScanner.tsx sends profile?.username, but PostgREST takes whatever the
-- browser puts there — so any signed-in user could comment as
-- "threatbase-admin" on any indicator. The column comment already claimed it
-- was a snapshot of the author's profile name; make that true server-side.
CREATE OR REPLACE FUNCTION public.comments_stamp_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.username := coalesce(
    (SELECT p.username FROM public.profiles p WHERE p.id = NEW.user_id),
    'contributor'
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS comments_stamp_username ON public.comments;
CREATE TRIGGER comments_stamp_username
  BEFORE INSERT OR UPDATE OF username ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_stamp_username();

DROP POLICY IF EXISTS "authenticated users can comment"   ON public.comments;
DROP POLICY IF EXISTS "authors can delete their comments" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ⚠️ ADDED 2026-09-17 — this file never created a SELECT policy for comments,
-- so every comment was write-only: src/components/ReportScanner.tsx:242 reads
-- .from('comments').select(...).eq('indicator', ip) with the anon client, and
-- with no SELECT policy RLS returned zero rows for everyone. The feature looked
-- implemented and always rendered an empty list. The hosted project does have
-- this policy (anon SELECT returns its rows), so this restores parity.
-- The trigger above stamps username from profiles, so nothing sensitive is
-- exposed here — indicator, body, username, user_id, created_at only.
DROP POLICY IF EXISTS comments_select_public ON public.comments;
CREATE POLICY comments_select_public ON public.comments
  FOR SELECT TO anon, authenticated USING (true);

-- ── 9. SECURITY DEFINER lockdown ────────────────────────────────────────────
-- Trigger functions inherit the default EXECUTE-to-PUBLIC grant, which exposes
-- them as callable RPCs at /rest/v1/rpc/<name>. Triggers fire as the table
-- owner regardless of grants, so revoking costs nothing.
REVOKE ALL ON FUNCTION public.api_keys_inherit_pro()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comments_stamp_username()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()          FROM PUBLIC, anon, authenticated;

-- validate_api_key_hash is only ever called server-side with the service_role
-- key (functions/api/v1/_middleware.ts), but authenticated could call it to
-- probe key hashes. Same lockdown as validate_feed_token.
REVOKE EXECUTE ON FUNCTION public.validate_api_key_hash(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validate_api_key_hash(text) TO service_role;

-- ============================================================================
-- VERIFICATION — each block should behave as the comment says.
-- ============================================================================
-- Free user cannot self-grant Pro; Pro user's new key inherits it:
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<free-uid>","role":"authenticated","aal":"aal2"}';
--   insert into api_keys (user_id, key_hash, prefix, is_pro)
--     values ('<free-uid>','h','p',true);   -- expect: permission denied
--   rollback;
--
-- Forged dispute is rejected:
--   insert into disputes (ip, reporter_alias, reason, user_id)
--     values ('203.0.113.9','x','y','<someone-else>');  -- expect: RLS violation
--
-- Exactly one policy per table+command, none granted to {public}:
--   select tablename, cmd, policyname, roles::text from pg_policies
--   where schemaname='public' order by tablename, cmd;
--
-- No SECURITY DEFINER function is anon/authenticated-callable except
-- delete_user, migrate_reporter_alias and first_user_ids (all uid-guarded):
--   select proname, array_to_string(proacl,' | ') from pg_proc
--   where pronamespace='public'::regnamespace and prosecdef;
