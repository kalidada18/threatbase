-- ============================================================
-- public.lookup_intel_batch — many verdicts, one round trip.
--
-- Exists for the Pro bulk hunt (src/lib/bulkScan.ts), which used to
-- run scanIndicatorLogic in the browser: it downloaded the ~56 MB
-- IP feed once per session and then binary-searched it per row. That
-- is fast per row, but it is the last read path that still needed
-- the published /ioc text at all, and it downloads 56 MB to answer
-- questions the corpus already holds.
--
-- Calling public.lookup_intel once per row instead would be ONE
-- ROUND TRIP PER ROW — BULK_MAX_ROWS is 10000, so a full file would
-- be 10 000 sequential requests (minutes of latency) against 20-odd
-- for this. Hence a batch: the per-row semantics stay in
-- lookup_intel, and this function is a thin fan-out over it, so the
-- two can never disagree about what counts as a hit.
--
-- NOT a SQL rewrite of the lookup rules — deliberately. Every branch
-- (exact IP / CIDR / hash / domain-or-URL, ordered pivots, subnet
-- containment, the >=3 dispute rule) lives in exactly one place.
--
-- Contract: p_items is a jsonb array of {value, parents?} in probe
-- order, same shape lookup_intel takes per row. Returns ONLY the
-- rows that matched, echoing the input as `input_value` so the
-- caller can map back — a value with no row is clean, exactly like
-- the single-value function returning zero rows.
--
-- Batching does not change authorisation. This is SECURITY DEFINER
-- for the same reason lookup_intel is (the three intel tables are
-- deny-all under RLS, so this function is the only read path). It is
-- NOT a way around the per-role statement_timeout: the statement is
-- issued by the caller, so the batch competes with anon's 3 s /
-- authenticated's 8 s just as a single lookup does. That is what
-- MAX_ITEMS is for.
--
-- Grant differs from lookup_intel deliberately: this one is NOT for
-- anon. One call costs ~1.2 s of database time (measured, 500 items),
-- and the publishable anon key ships in the browser bundle — so an
-- anon grant would let anyone spend 500x a normal lookup per request.
-- The bulk hunt is Pro-gated, so its caller is always signed in.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lookup_intel_batch(p_items jsonb)
RETURNS TABLE(
  input_value   text,
  matched       text,
  match_kind    text,
  src           text,
  score         smallint,
  malicious     boolean,
  feed_count    smallint,
  tags          text,
  source        text,
  matched_cidr  text,
  dispute_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- Sized so one call stays comfortably inside authenticated's 8 s
  -- statement_timeout at the measured rate (see the benchmark note
  -- at the foot of this file). Raising it without re-measuring turns
  -- a slow batch into a 500 for the whole chunk, not a slow row.
  MAX_ITEMS constant int := 500;
  it   jsonb;
  v    text;
  par  text[];
  r    record;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN;
  END IF;

  -- Reject rather than silently truncate: a caller that chunks too
  -- coarsely should see the cut, not quietly lose the tail.
  IF jsonb_array_length(p_items) > MAX_ITEMS THEN
    RAISE EXCEPTION 'lookup_intel_batch: % items exceeds the % limit',
      jsonb_array_length(p_items), MAX_ITEMS
      USING ERRCODE = '54000';
  END IF;

  -- jsonb_array_elements preserves array order, so hits come back in
  -- the caller's order.
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v := it ->> 'value';
    IF v IS NULL OR v = '' THEN CONTINUE; END IF;

    -- Absent/null/empty parents all collapse to the empty array, which
    -- is lookup_intel's own DEFAULT.
    par := COALESCE(
      (SELECT array_agg(x)
         FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(it -> 'parents') = 'array'
                     THEN it -> 'parents'
                     ELSE '[]'::jsonb END) AS x),
      '{}'::text[]);

    FOR r IN SELECT * FROM public.lookup_intel(v, par) LOOP
      RETURN QUERY SELECT v, r.matched, r.match_kind, r.src, r.score, r.malicious,
                          r.feed_count, r.tags, r.source, r.matched_cidr,
                          r.dispute_count;
    END LOOP;
  END LOOP;
END;
$function$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, so the PUBLIC
-- grant has to be taken away explicitly — granting to the intended
-- roles alone leaves every role (including anon) able to call it.
-- lookup_intel.sql states its grantees but never does this REVOKE.
--
-- anon is named here as well as PUBLIC, and that is not redundant:
-- an explicit grant from an earlier version of this file survives a
-- CREATE OR REPLACE (which preserves the ACL) and is NOT removed by
-- REVOKE ... FROM PUBLIC. Revoking both makes the statement idempotent
-- whatever state the function was left in.
REVOKE EXECUTE ON FUNCTION public.lookup_intel_batch(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.lookup_intel_batch(jsonb) TO authenticated, service_role;
