-- ============ Threatbase hardening pass (attacker review) 2026-09-15 ============
-- Applied via Supabase MCP as migration harden_attacker_review_2026_09_15.
-- Mirror kept for the repo. Fixes found by auditing pg_policies/pg_proc as an
-- attacker:

-- A2 CRITICAL: profiles_update_own let any user write any column of their own
-- row — including role -> PATCH /rest/v1/profiles {"role":"superadmin"} was a
-- one-request privilege escalation. Locked by trigger (RLS can't see OLD, so
-- a policy-level guard is impossible for PostgREST updates; the trigger fires
-- for every non-owner role). Superadmin is now only grantable by whoever
-- already has service_role / direct DB access.
CREATE OR REPLACE FUNCTION public.profile_role_unchanged()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role is not user-editable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_role_lock ON public.profiles;
CREATE TRIGGER profiles_role_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_role_unchanged();

-- A3 HIGH: reported_ips DELETE/UPDATE owned rows by reporter_alias string
-- match only -> register, rename yourself to a victim's alias, edit/delete
-- their reports. Ownership now also requires row user_id = auth.uid().
-- (37 pre-link orphan rows with user_id NULL become owner-immutable; they
-- stay publicly readable. Backfill them if the old accounts still exist.)
DROP POLICY IF EXISTS reported_ips_delete_own ON public.reported_ips;
CREATE POLICY reported_ips_delete_own ON public.reported_ips
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()
         AND reporter_alias = (SELECT p.username FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS reported_ips_update_own ON public.reported_ips;
CREATE POLICY reported_ips_update_own ON public.reported_ips
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
         AND reporter_alias = (SELECT p.username FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (user_id = auth.uid()
         AND reporter_alias = (SELECT p.username FROM public.profiles p WHERE p.id = auth.uid()));

-- A4 MEDIUM: api_keys_require_mfa was PERMISSIVE -> OR'd with select_own /
-- update_own, so the MFA requirement never actually applied to SELECT/UPDATE.
-- RESTRICTIVE policies AND with permissive ones; now it's a real gate.
-- (mint_api_key already checked aal2 internally; this closes the read path.)
DROP POLICY IF EXISTS api_keys_require_mfa ON public.api_keys;
CREATE POLICY api_keys_require_mfa ON public.api_keys
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK ((auth.jwt() ->> 'aal') = 'aal2');

-- A6: trace functions were left with default PUBLIC EXECUTE and an unpinned
-- search_path (search-path hijack via CREATE SCHEMA public on shared db).
-- Zero callers in app code -> revoked from anon/authenticated, pinned, and
-- granted to service_role only (pipeline writes go through it).
--
-- ⚠️ COMMENTED OUT 2026-09-17 — these two functions exist ONLY on the hosted
-- project. Neither is defined anywhere in this repo, and nothing in the app or
-- pipeline calls them (grep: only this file mentions them). On a fresh database
-- these eight statements abort the whole file. Drop the block entirely unless
-- the trace feature is coming back — in which case recover the definitions
-- first (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname LIKE '%trace%').
--
-- REVOKE ALL ON FUNCTION public.trace_neighborhood(text, integer) FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION public.upsert_trace_edge(text,text,text,text,text,text,text,text,integer,date,date,text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.trace_neighborhood(text, integer) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.upsert_trace_edge(text,text,text,text,text,text,text,text,integer,date,date,text) TO service_role;
-- ALTER FUNCTION public.trace_neighborhood(text, integer) SET search_path = public;
-- ALTER FUNCTION public.upsert_trace_edge(text,text,text,text,text,text,text,text,integer,date,date,text) SET search_path = public;

-- A1 MEDIUM: delete_user() (SECURITY DEFINER, deletes the auth.users row) had
-- the PUBLIC default grant -> reachable anonymously-by-role; throwaway-account
-- churn + evidence-wiping was frictionless. anon/PUBLIC revoked; the account
-- page (authenticated, own id only) still works. Re-auth gating (password/TOTP
-- recheck before delete) is a client-side roadmap item.
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC, anon;

-- A7 LOW: first_user_ids() crosses the owner-only profiles wall (definer);
-- cosmetic join-order badge -> authenticated-only, anon revoked.
REVOKE ALL ON FUNCTION public.first_user_ids() FROM PUBLIC, anon;

-- Views: reported_ips_feed / top_contributors were SECURITY DEFINER and the
-- Supabase linter flagged that as ERROR.
--
-- ⚠️ DO NOT APPLY THE ALTER BELOW. The reasoning it was written with ("they
-- only expose publicly visible columns, so zero app-visible change") is WRONG:
-- both views LEFT JOIN public.profiles, which is OWNER-ONLY under RLS, so an
-- invoker view returns NULL avatar_url for every row and the Leaderboard and
-- the ReportIP live-feed cards all fall back to the robot placeholder.
--
-- Confirmed on the hosted project 2026-09-17: anon SELECT on profiles returns 0
-- rows, yet top_contributors returns real avatars — i.e. the views are definer
-- there, so this ALTER is not in effect in production either. db/
-- top_contributors_avatars.sql:9-10 documents the definer choice deliberately.
--
-- The linter ERROR is an accepted trade: the views expose only
-- (reporter_alias, counts, avatar_url) — no email, no bio, no role, no id.
--
-- ALTER VIEW public.reported_ips_feed SET (security_invoker = on);
-- ALTER VIEW public.top_contributors SET (security_invoker = on);

