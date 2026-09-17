-- ============================================================================
-- ThreatBase — 00_bootstrap.sql — the five core app tables + views
-- ----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS: the intel tables (ip_intel / indicator_intel /
-- hash_intel) are version-controlled in db/, but the five *application* tables
-- never were. Their DDL existed only inside the hosted project
-- fybwjibrvwqwnspgswtp and was recovered for the self-hosted rebuild by
-- probing the live PostgREST API with the publishable key.
--
-- PROVENANCE — read before trusting a column:
--   * Column *names*: recovered verbatim (OpenAPI schema + existence probes).
--   * Types, defaults, NOT NULLs, constraints: INFERRED from app usage in
--     src/AuthContext.tsx, src/components/{Profile,ReportScanner,ReportIP,
--     Leaderboard}.tsx and functions/api/**. They are not a pg_dump.
--   * api_insert_report and handle_new_user exist ONLY in production; the
--     bodies here are reimplementations pinned by their callers, not dumps.
--     See db/functions.sql:34-68 for the stale 4-arg version's warning.
--
-- APPLY FIRST, then db/functions.sql. RLS policies come later — this file
-- leaves every table deny-all (RLS on, zero policies), which is the correct
-- fail-closed state until db/rls_policies.sql + db/pro_and_rls_fixes.sql land.
-- ============================================================================


-- ============================================================================
-- 1. Tables
-- ============================================================================

-- profiles — one row per auth.users row. Owner-only-readable (see the view
-- section for why avatars are still public). `role` drives Pro/superadmin.
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text        NOT NULL UNIQUE,
  full_name  text,
  avatar_url text,
  bio        text,
  website    text,
  role       text        NOT NULL DEFAULT 'user',
  is_helper  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- reported_ips — the community blocklist. Public-read; inserts go through
-- api_insert_report (server, service_role) or the RLS insert policy.
-- `processed_at IS NULL` is the pipeline's work queue
-- (pipeline/sync_community_reports.py:47): rows leave for the feed once the
-- false-positive sync has stamped them.
CREATE TABLE IF NOT EXISTS public.reported_ips (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip             text        NOT NULL CHECK (host(ip::inet) = ip),
  category       text        NOT NULL,
  comment        text,
  reporter_alias text,
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz
);

-- disputes — the false-positive appeal. >=3 distinct disputers suppress an IP
-- (i.e. the report set is what pipeline/ writes to ioc/data/false_positives.txt).
-- user_id defaults to auth.uid() so the browser insert in
-- src/components/ReportScanner.tsx:590-594 can omit it.
CREATE TABLE IF NOT EXISTS public.disputes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip             text        NOT NULL CHECK (host(ip::inet) = ip),
  reason         text,
  reporter_alias text,
  user_id        uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- api_keys — Pro feed + programmatic API credentials. Only the SHA-256 hash
-- is stored (db/mint_api_key_rpc.sql validates the hex-64 shape).
CREATE TABLE IF NOT EXISTS public.api_keys (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash   text        NOT NULL UNIQUE,
  prefix     text,
  is_active  boolean     NOT NULL DEFAULT true,
  is_pro     boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- comments — per-indicator discussion. `username` is stamped server-side by
-- the comments_stamp_username() trigger in db/pro_and_rls_fixes.sql.
CREATE TABLE IF NOT EXISTS public.comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator  text        NOT NULL,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reported_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments     ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS reported_ips_processed_at_idx
  ON public.reported_ips (processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS reported_ips_created_at_idx
  ON public.reported_ips (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_user_id_idx
  ON public.reported_ips (user_id);
CREATE INDEX IF NOT EXISTS disputes_ip_idx
  ON public.disputes (ip);
CREATE INDEX IF NOT EXISTS comments_indicator_idx
  ON public.comments (indicator);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx
  ON public.api_keys (user_id);


-- ============================================================================
-- 2. api_insert_report — the privileged insert path
-- ----------------------------------------------------------------------------
-- Called ONLY by the two server endpoints, both with the service role:
--   functions/api/community-report.ts:124  (browser form, JWT verified first)
--   functions/api/v1/report.ts             (programmatic, API key)
-- Both pass NAMED arguments, so parameter order is not load-bearing.
--
-- NOT anon-callable: db/lock_down_api_insert_report.sql revokes PUBLIC/anon/
-- authenticated and grants service_role. That lock-down runs LAST on purpose
-- (CREATE FUNCTION grants EXECUTE to PUBLIC by default).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.api_insert_report(
  p_ip             text,
  p_category       text,
  p_comment        text,
  p_reporter_alias text,
  p_user_id        uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Same limits the client-side validators enforce (src/lib/apiValidation.ts),
  -- re-stated here because the RPC is reachable with a service key.
  IF p_ip IS NULL OR length(p_ip) = 0 OR length(p_ip) > 45 THEN
    RAISE EXCEPTION 'invalid ip' USING ERRCODE = '22023';
  END IF;
  IF p_category IS NULL OR length(p_category) = 0 OR length(p_category) > 50 THEN
    RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_comment, '')) > 1000 THEN
    RAISE EXCEPTION 'comment too long' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_reporter_alias, '')) > 50 THEN
    RAISE EXCEPTION 'reporter_alias too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reported_ips (ip, category, comment, reporter_alias, user_id)
  VALUES (p_ip, p_category, p_comment, p_reporter_alias, p_user_id);
END;
$function$;


-- ============================================================================
-- 3. handle_new_user — create the profiles row on signup
-- ----------------------------------------------------------------------------
-- Belt-and-braces: src/AuthContext.tsx:58-93 already creates the profile
-- client-side on PGRST116 and retries a colliding username with a random
-- suffix, so the app survives this trigger failing. It exists so the row is
-- present the instant the JWT is, which is what the FK-bearing inserts want.
--
-- db/pro_and_rls_fixes.sql:185 revokes EXECUTE on this function, so it must
-- keep the zero-argument signature used in that REVOKE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_base text;
  v_user text;
BEGIN
  v_base := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'user_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'preferred_username', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'user'
  );
  -- Truncate first: a long base plus a suffix must still fit sanely, and
  -- AuthContext's `${baseUsername}_${random}` pattern is the precedent.
  v_base := left(v_base, 40);

  v_user := v_base;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_user) THEN
    -- One retry keyed on the uuid prefix; a 6-hex collision on top of an
    -- already-taken username is vanishingly unlikely, and AuthContext's
    -- PGRST116 path is the backstop if it ever happens.
    v_user := v_base || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    v_user,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 4. Views — deliberately SECURITY DEFINER
-- ----------------------------------------------------------------------------
-- Both views read public.profiles, which is OWNER-ONLY under RLS (the browser
-- can only select its own row — verified against the live project, where anon
-- SELECT on profiles returns 0 rows). A DEFINER view is therefore the only way
-- anon gets an avatar_url, and it is what production does:
-- db/top_contributors_avatars.sql:9-10 states it explicitly.
--
-- ⚠️  Do NOT "harden" these with `ALTER VIEW … SET (security_invoker = on)`.
--    db/harden_attacker_review_2026_09_15.sql:80-81 does exactly that; on a
--    fresh database it is WRONG and would blank every avatar on the
--    leaderboard. Drop those two lines when applying that file. (The hosted
--    project's views are definer too — that ALTER was reverted there.)
-- ============================================================================

-- Leaderboard. `is_admin` / `is_superadmin` are newer than the repo's copy of
-- this view (db/top_contributors_avatars.sql lacks them; src/components/
-- Leaderboard.tsx:75-76 reads them). bool_or over the LEFT JOIN yields NULL for
-- alias groups whose reports all have user_id IS NULL — matching live, where
-- the "Anonymous" group reports null for both.
CREATE OR REPLACE VIEW public.top_contributors
WITH (security_invoker = false) AS
SELECT r.reporter_alias,
       count(*)                  AS reports_count,
       max(p.avatar_url)         AS avatar_url,
       bool_or(p.role = 'admin') AS is_admin,
       bool_or(p.role = 'superadmin') AS is_superadmin
FROM public.reported_ips r
LEFT JOIN public.profiles p ON p.id = r.user_id
WHERE r.reporter_alias IS NOT NULL AND r.reporter_alias <> ''
GROUP BY r.reporter_alias;

-- Live feed cards (src/components/ReportIP.tsx:189). reported_ips.user_id FKs
-- to auth.users, not profiles, so there is no embeddable relationship — the
-- join has to live in a definer view.
CREATE OR REPLACE VIEW public.reported_ips_feed
WITH (security_invoker = false) AS
SELECT r.id, r.ip, r.category, r.comment, r.created_at, r.processed_at,
       r.reporter_alias, r.user_id, p.avatar_url
FROM public.reported_ips r
LEFT JOIN public.profiles p ON p.id = r.user_id;

GRANT SELECT ON public.top_contributors  TO anon, authenticated, service_role;
GRANT SELECT ON public.reported_ips_feed TO anon, authenticated, service_role;


-- ============================================================================
-- 5. VERIFY — run after applying, before db/functions.sql
-- ----------------------------------------------------------------------------
--   select relname, relrowsecurity from pg_class
--    where relname in ('profiles','reported_ips','disputes','api_keys','comments');
--     -> 5 rows, all relrowsecurity = t
--
--   select proname, pronargs, prosecdef, proconfig from pg_proc
--    where proname in ('api_insert_report','handle_new_user');
--     -> api_insert_report | 5 | t | {search_path=}
--        handle_new_user    | 0 | t | {search_path=}
--
--   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;
--     -> on_auth_user_created
--
--   select relname, reloptions from pg_class
--    where relname in ('top_contributors','reported_ips_feed');
--     -> reloptions NULL / 'security_invoker=false' — NOT 'security_invoker=true'
-- ============================================================================
