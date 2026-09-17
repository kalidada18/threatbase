-- ============================================================================
-- Fix #3 — Lock down api_insert_report so it is callable ONLY by the server.
-- ----------------------------------------------------------------------------
-- WHY
--   Postgres grants EXECUTE on functions to PUBLIC by default. The publishable
--   anon key ships in the browser bundle, so today anyone can call
--   `api_insert_report` directly via PostgREST and bypass Turnstile, the login
--   check and the KV rate limit — i.e. poison the community blocklist.
--
--   The Cloudflare Functions now perform the privileged insert with the
--   server-only service_role key (functions/api/community-report.ts and
--   functions/api/v1/report.ts). Once that is live, no client needs EXECUTE on
--   this RPC, so we revoke it from everyone except service_role.
--
-- ⚠️  PREREQUISITE — do this FIRST, or community/API reports will break:
--   1. Set the service_role secret on the Cloudflare Pages project:
--        npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
--      (or Dashboard → Pages → threatbase → Settings → Environment variables.
--       Find the value in Supabase → Project Settings → API → service_role key.)
--   2. Deploy the updated Functions:
--        npm run deploy
--   3. Verify a report succeeds BOTH from the website form AND from
--        POST /api/v1/report  (with a valid x-api-key).
--
-- ONLY AFTER step 3 is confirmed in production, run this file in the Supabase
-- SQL editor. It is idempotent / safe to re-run.
-- ============================================================================

-- ⚠️  SIGNATURE MATTERS: REVOKE/GRANT bind to an exact argument-type list. The
--   live function is the 5-arg version (…, p_user_id). An earlier copy of this
--   file revoked the 4-arg signature, which does not exist in the database — so
--   it was a silent no-op. If you ever add an overload, you must revoke it too,
--   or it inherits the default EXECUTE-to-PUBLIC grant and reopens this hole.
--   Confirm with the verification query at the bottom, not by assumption.

REVOKE EXECUTE ON FUNCTION public.api_insert_report(text, text, text, text, uuid)
  FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.api_insert_report(text, text, text, text, uuid)
  TO service_role;

-- Drop the stale 4-arg overload if an older db/functions.sql ever created it.
-- A leftover overload is anon-callable by default and bypasses Turnstile, the
-- login check and the KV rate limit.
DROP FUNCTION IF EXISTS public.api_insert_report(text, text, text, text);

-- Verification (expect EXECUTE to remain only for service_role / owner):
--   SELECT p.oid::regprocedure AS signature, r.grantee, r.privilege_type
--   FROM pg_proc p
--   LEFT JOIN information_schema.role_routine_grants r
--     ON r.specific_name = p.proname || '_' || p.oid
--   WHERE p.proname = 'api_insert_report';
-- Any row with grantee anon/authenticated/PUBLIC is a live bypass.
