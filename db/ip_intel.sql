-- ============================================================
-- ip_intel — machine-read threat corpus for ~900K IPs
-- (additive: nothing existing reads or writes this table)
--
-- Deliberate choices:
--  - inet, not text: Postgres rejects malformed IPs at cast time,
--    normalizes, and keeps the PK btree compact (~20 B/key).
--    Existing reported_ips/disputes stay text — untouched.
--  - RLS enabled, ZERO policies: default-deny for anon/authenticated;
--    service_role (BYPASSRLS) is the only path in and out. No
--    per-row auth cost because no policy ever evaluates.
--  - Merge semantics live in upsert_ip_intel: GREATEST(score),
--    OR(malicious), GREATEST(feed_count) — an import can only ever
--    raise confidence, never silently drop a true verdict or a
--    useful score.
--  - RiskScore tiers map score HIGH=90 / MEDIUM=60 / LOW=20 in the
--    importer (pipeline/import_ip_intel.py); malicious=true for every
--    feed row since listing on any feed is a positive verdict.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ip_intel (
  ip         inet        PRIMARY KEY,
  score      smallint    NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- absent `malicious` on import = score >= 50, derived in upsert_ip_intel;
  -- a bare column default cannot reference `score`, so none here.
  malicious  boolean     NOT NULL,
  -- feed-line carriage (lossless migration of threatbase-ip.txt / -ipv6.txt):
  feed_count smallint    NOT NULL DEFAULT 1,   -- #feeds agreeing (CSV col 2)
  tags       text,                             -- CSV col 4 verbatim ("Malicious", "Mixed", …)
  source     text,                             -- sources list, CSV col 7 verbatim
  first_seen date,
  last_seen  date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_intel ENABLE ROW LEVEL SECURITY;

-- Batch upsert: p_rows = [{ip, score, malicious?, source?, first_seen?,
-- last_seen?, feed_count?, tags?}, …] Returns inserted/updated counts.
-- Idempotent: re-sending a batch only re-runs the (monotonic) merge.
-- Invalid JSON rows RAISE the whole batch — the importer validates
-- client-side so a poison row never blocks 4,999 good ones.
CREATE OR REPLACE FUNCTION public.upsert_ip_intel(p_rows jsonb)
RETURNS TABLE(inserted bigint, updated bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH src AS (
    -- belt-and-suspenders dedup: ON CONFLICT forbids the same key twice in
    -- one statement; keep the highest-score row per ip.
    SELECT ip, score, malicious, source, first_seen, last_seen, feed_count, tags
    FROM (
      SELECT
        (r ->> 'ip')::inet                                   AS ip,
        (r ->> 'score')::smallint                            AS score,
        COALESCE(
          (r ->> 'malicious')::boolean,
          ((r ->> 'score')::int >= 50)
        )                                                    AS malicious,
        NULLIF(r ->> 'source', '')                           AS source,
        NULLIF(r ->> 'first_seen', '')::date                 AS first_seen,
        NULLIF(r ->> 'last_seen', '')::date                  AS last_seen,
        COALESCE(NULLIF(r ->> 'feed_count', '')::smallint, 1) AS feed_count,
        NULLIF(r ->> 'tags', '')                             AS tags,
        row_number() OVER (
          PARTITION BY (r ->> 'ip')::inet
          ORDER BY (r ->> 'score')::int DESC
        )                                                    AS rn
      FROM jsonb_array_elements(p_rows) r
      WHERE r ->> 'ip' IS NOT NULL AND r ->> 'score' IS NOT NULL
    ) d
    WHERE rn = 1
  ), merged AS (
    INSERT INTO public.ip_intel AS t
      (ip, score, malicious, source, first_seen, last_seen, feed_count, tags)
    SELECT ip, score, malicious, source, first_seen, last_seen, feed_count, tags FROM src
    ON CONFLICT (ip) DO UPDATE SET
      score      = GREATEST(t.score, EXCLUDED.score),
      malicious  = t.malicious OR EXCLUDED.malicious,
      feed_count = GREATEST(t.feed_count, EXCLUDED.feed_count),
      source     = COALESCE(EXCLUDED.source, t.source),
      tags       = COALESCE(EXCLUDED.tags, t.tags),
      first_seen = LEAST(t.first_seen, EXCLUDED.first_seen),
      last_seen  = GREATEST(t.last_seen, EXCLUDED.last_seen),
      updated_at = now()
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  FROM merged;
$$;

-- Service-role only. No anonymous or user-facing EXECUTE path exists by design.
REVOKE ALL ON FUNCTION public.upsert_ip_intel(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ip_intel(jsonb) TO service_role;
