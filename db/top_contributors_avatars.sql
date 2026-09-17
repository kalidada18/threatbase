-- Top Contributors avatars — APPLIED to prod 2026-09-06 via Supabase MCP
-- (migration name: top_contributors_avatars).
--
-- Root cause: the old view exposed only (reporter_alias, reports_count), so
-- Leaderboard.tsx's `leader.avatar_url || DEFAULT_AVATAR` always fell to the
-- robot PNG. Avatars were already captured at OAuth sign-in (AuthContext
-- stores user_metadata.avatar_url into profiles).
--
-- security_invoker=false: the view reads profiles, which is owner-only-RLS;
-- the view runs as its owner (postgres) so anon can still SELECT it.
-- Join on reported_ips.user_id, not reporter_alias — aliases are
-- client-chosen and forgeable; user_id is the trustworthy link.
--
-- CREATE OR REPLACE preserved the existing anon/authenticated grants
-- (verified via information_schema.table_privileges).

CREATE OR REPLACE VIEW public.top_contributors
WITH (security_invoker=false) AS
SELECT r.reporter_alias,
       count(*) AS reports_count,
       max(p.avatar_url) AS avatar_url
FROM public.reported_ips r
LEFT JOIN public.profiles p ON p.id = r.user_id
WHERE r.reporter_alias IS NOT NULL AND r.reporter_alias <> ''
GROUP BY r.reporter_alias;

-- Verified after apply: lamichhanesujal18 -> lh3.googleusercontent.com photo,
-- bohoraronish10 -> avatars.githubusercontent.com photo. Rows with null
-- avatar are anonymous reports (user_id IS NULL) — robot fallback is correct
-- there; nothing to backfill (profiles all have avatar_url already).

-- ============================================================================
-- FOLLOW-UP, same day (migration reported_ips_feed_avatars): the ReportIP
-- "Live Feed" cards rendered DEFAULT_AVATAR hardcoded (ReportIP.tsx:611).
-- reported_ips.user_id has an FK to auth.users, NOT profiles, so a
-- client-side profiles(avatar_url) embed is impossible — and profiles is
-- owner-only-RLS anyway. Same definer-view pattern:
--
--   CREATE OR REPLACE VIEW public.reported_ips_feed
--   WITH (security_invoker=false) AS
--   SELECT r.id, r.ip, r.category, r.comment, r.created_at, r.processed_at,
--          r.reporter_alias, r.user_id, p.avatar_url
--   FROM public.reported_ips r
--   LEFT JOIN public.profiles p ON p.id = r.user_id;
--
-- Reads go through the view; inserts/edits still target reported_ips.
-- Note: 28 of lamichhanesujal18's older reports have user_id NULL (filed
-- before the link existed) and keep the robot — cannot be attributed
-- retroactively.

