-- ============================================================
-- indicator_intel — domain / url / cidr corpus (additive, third
-- mirror of the ip_intel design: read db/ip_intel.sql first)
--
--  - One table, `kind` column, text PK = the indicator verbatim.
--    A domain can never equal a URL (scheme) or a CIDR ('/'), so
--    value alone stays unique; the scanner looks a value up without
--    knowing its kind.
--  - cidr rows store the network text ("1.10.16.0/20"); subnet
--    containment searches cast at query time over ~22K rows.
--  - Same rules as the siblings: RLS on + ZERO policies
--    (service_role only), monotonic merge in the RPC.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.indicator_intel (
  value      text        PRIMARY KEY CHECK (length(value) BETWEEN 1 AND 2048),
  kind       text        NOT NULL CHECK (kind IN ('domain', 'url', 'cidr')),
  score      smallint    NOT NULL CHECK (score BETWEEN 0 AND 100),
  malicious  boolean     NOT NULL,
  feed_count smallint    NOT NULL DEFAULT 1,
  tags       text,
  source     text,
  first_seen date,
  last_seen  date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.indicator_intel ENABLE ROW LEVEL SECURITY;

-- Batch upsert: p_rows = [{value, kind, score, malicious?, source?,
-- first_seen?, last_seen?, feed_count?, tags?}, …].
CREATE OR REPLACE FUNCTION public.upsert_indicator_intel(p_rows jsonb)
RETURNS TABLE(inserted bigint, updated bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH src AS (
    SELECT value, kind, score, malicious, source, first_seen, last_seen, feed_count, tags
    FROM (
      SELECT
        r ->> 'value'                                       AS value,
        r ->> 'kind'                                        AS kind,
        (r ->> 'score')::smallint                           AS score,
        COALESCE(
          (r ->> 'malicious')::boolean,
          ((r ->> 'score')::int >= 50)
        )                                                   AS malicious,
        NULLIF(r ->> 'source', '')                          AS source,
        NULLIF(r ->> 'first_seen', '')::date                AS first_seen,
        NULLIF(r ->> 'last_seen', '')::date                 AS last_seen,
        COALESCE(NULLIF(r ->> 'feed_count', '')::smallint, 1) AS feed_count,
        NULLIF(r ->> 'tags', '')                            AS tags,
        row_number() OVER (
          PARTITION BY r ->> 'value'
          ORDER BY (r ->> 'score')::int DESC
        )                                                   AS rn
      FROM jsonb_array_elements(p_rows) r
      WHERE r ->> 'value' IS NOT NULL AND r ->> 'kind' IS NOT NULL
        AND r ->> 'score' IS NOT NULL
    ) d
    WHERE rn = 1
  ), merged AS (
    INSERT INTO public.indicator_intel AS t
      (value, kind, score, malicious, source, first_seen, last_seen, feed_count, tags)
    SELECT value, kind, score, malicious, source, first_seen, last_seen, feed_count, tags FROM src
    ON CONFLICT (value) DO UPDATE SET
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

REVOKE ALL ON FUNCTION public.upsert_indicator_intel(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_indicator_intel(jsonb) TO service_role;
