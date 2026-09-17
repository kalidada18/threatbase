-- ============================================================
-- hash_intel — machine-read hash corpus (additive, mirrors ip_intel)
--
-- Same design contract as db/ip_intel.sql — read that first:
--  - text PK (not citext): feed hashes are lowercase hex; the CHECK enforces
--    md5/sha1/sha256 length+alphabet at insert, the importer validates too.
--  - RLS enabled, ZERO policies: service_role is the only path in/out.
--  - upsert_hash_intel merges monotonically (GREATEST score, OR malicious,
--    GREATEST feed_count) — an import can only raise confidence.
--  - feed rows are always malicious=true, score=90 (listing on any feed is
--    a positive verdict; hash feeds carry no tier).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hash_intel (
  hash       text        PRIMARY KEY
    CHECK (hash ~ '^([0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$'),
  score      smallint    NOT NULL CHECK (score BETWEEN 0 AND 100),
  malicious  boolean     NOT NULL,
  feed_count smallint    NOT NULL DEFAULT 1,
  tags       text,
  source     text,
  first_seen date,
  last_seen  date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hash_intel ENABLE ROW LEVEL SECURITY;

-- Batch upsert: p_rows = [{hash, score, malicious?, source?, first_seen?,
-- last_seen?, feed_count?, tags?}, …]. Idempotent; same shape and merge
-- semantics as upsert_ip_intel, keyed on hash instead of inet.
CREATE OR REPLACE FUNCTION public.upsert_hash_intel(p_rows jsonb)
RETURNS TABLE(inserted bigint, updated bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH src AS (
    SELECT hash, score, malicious, source, first_seen, last_seen, feed_count, tags
    FROM (
      SELECT
        lower(r ->> 'hash')                               AS hash,
        (r ->> 'score')::smallint                         AS score,
        COALESCE(
          (r ->> 'malicious')::boolean,
          ((r ->> 'score')::int >= 50)
        )                                                 AS malicious,
        NULLIF(r ->> 'source', '')                        AS source,
        NULLIF(r ->> 'first_seen', '')::date              AS first_seen,
        NULLIF(r ->> 'last_seen', '')::date               AS last_seen,
        COALESCE(NULLIF(r ->> 'feed_count', '')::smallint, 1) AS feed_count,
        NULLIF(r ->> 'tags', '')                          AS tags,
        row_number() OVER (
          PARTITION BY lower(r ->> 'hash')
          ORDER BY (r ->> 'score')::int DESC
        )                                                 AS rn
      FROM jsonb_array_elements(p_rows) r
      WHERE r ->> 'hash' IS NOT NULL AND r ->> 'score' IS NOT NULL
    ) d
    WHERE rn = 1
  ), merged AS (
    INSERT INTO public.hash_intel AS t
      (hash, score, malicious, source, first_seen, last_seen, feed_count, tags)
    SELECT hash, score, malicious, source, first_seen, last_seen, feed_count, tags FROM src
    ON CONFLICT (hash) DO UPDATE SET
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

REVOKE ALL ON FUNCTION public.upsert_hash_intel(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hash_intel(jsonb) TO service_role;
