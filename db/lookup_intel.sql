-- ============================================================
-- public.lookup_intel — the single-row verdict read for the corpus
-- loaded by pipeline/import_ip_intel.py (ip_intel / hash_intel /
-- indicator_intel).
--
-- Contract: the caller passes the normalized indicator plus the
-- PROBE ORDER for pivots (a domain's parents, a URL's host and its
-- parents). The function is a dumb ordered key-lookup — all domain
-- and URL parsing stays in TypeScript (src/scanner.ts's
-- extractUrlHost / parentDomains), so the pivot rules exist once.
--
-- Returns the first candidate that hits, naming which one it was:
--   match_kind 'exact'  — p_value itself matched
--   match_kind 'parent' — a p_parents entry matched (subdomain /
--                         URL-host pivot); `matched` is that entry
--   match_kind 'subnet' — an IPv4 candidate sits inside a listed
--                         CIDR; `matched_cidr` carries the range
--   src                 — 'ip' | 'cidr' | 'hash' | 'subnet' | the
--                         indicator_intel `kind` when it is not cidr
--
-- Order mirrors scanIndicatorLogic (src/scanner.ts:421-498): exact
-- key first, then containment, and containment after every exact
-- probe since a URL's host IP is a candidate like any other.
--
-- SECURITY DEFINER + `search_path = ''`: the RLS policies on the
-- three intel tables are deny-all (zero policies), so this function
-- is the ONLY read path. Callers need no table grants.
-- ============================================================

-- DROP first: the previous version's OUT columns differ, and
-- CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS public.lookup_intel(text);

-- The containment branch below filters indicator_intel by kind.
-- Without this index the planner seq-scans all 3.69M rows casting
-- value::inet per row (~1.5 s warm, ~9 s cold) — over the anon
-- role's 3 s statement_timeout, so every unlisted IPv4 500'd.
-- With it the branch touches only the 22,288 cidr rows.
-- Upgrade path if that ever measures slow: a GiST index on
-- ((value::inet) inet_ops) WHERE kind = 'cidr' to serve >>= directly.
CREATE INDEX IF NOT EXISTS indicator_intel_kind_idx
  ON public.indicator_intel (kind);

CREATE OR REPLACE FUNCTION public.lookup_intel(
  p_value   text,
  p_parents text[] DEFAULT '{}'::text[]
)
RETURNS TABLE(
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
  v       text   := lower(btrim(p_value));
  vip     inet;
  ip_ok   boolean := false;
  cands   text[];
  r       record;
  subnet  text;
  dcount  bigint;
  -- Cast-safe dotted quad. The looser [0-9]{1,3} form matches
  -- 999.999.999.999, which raises on ::inet before the loop's own
  -- guard can skip it.
  v4_re   constant text := '^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$';
  i       int;
BEGIN
  IF v = '' OR length(v) > 512 THEN RETURN; END IF;

  cands := array_prepend(v, COALESCE(p_parents, '{}'::text[]));

  dcount := (SELECT count(*) FROM public.disputes d WHERE d.ip = v);

  -- ---------- 1. exact IP (IPv4 and IPv6 both live in ip_intel) ----------
  -- '/' excluded: a range is a CIDR, handled by branch 2. inet accepts
  -- '1.19.0.0/16', so without the guard a range would probe ip_intel first.
  IF v !~ '/' AND (v ~ v4_re OR (v LIKE '%:%' AND v ~ '^[0-9a-f:.]+$')) THEN
    BEGIN
      vip := v::inet;
      ip_ok := true;
    EXCEPTION WHEN others THEN
      ip_ok := false;  -- not a real address; let the other branches try
    END;
    IF ip_ok THEN
      SELECT i2.score, i2.malicious, i2.feed_count, i2.tags, i2.source INTO r
      FROM public.ip_intel i2 WHERE i2.ip = vip LIMIT 1;
      IF FOUND THEN
        RETURN QUERY SELECT v, 'exact'::text, 'ip'::text, r.score, r.malicious,
                            r.feed_count, r.tags, r.source, NULL::text, dcount;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- ---------- 2. exact CIDR ----------
  IF v LIKE '%/%' THEN
    SELECT i2.score, i2.malicious, i2.feed_count, i2.tags, i2.source INTO r
    FROM public.indicator_intel i2 WHERE i2.kind = 'cidr' AND i2.value = v LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v, 'exact'::text, 'cidr'::text, r.score, r.malicious,
                          r.feed_count, r.tags, r.source, NULL::text, dcount;
      RETURN;
    END IF;
  END IF;

  -- ---------- 3. exact hash ----------
  IF v ~ '^([0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$' THEN
    SELECT h.score, h.malicious, h.feed_count, h.tags, h.source INTO r
    FROM public.hash_intel h WHERE h.hash = v LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v, 'exact'::text, 'hash'::text, r.score, r.malicious,
                          r.feed_count, r.tags, r.source, NULL::text, dcount;
      RETURN;
    END IF;
  END IF;

  -- ---------- 4. exact domain / URL ----------
  SELECT i2.score, i2.malicious, i2.feed_count, i2.tags, i2.source, i2.kind INTO r
  FROM public.indicator_intel i2 WHERE i2.value = v LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v, 'exact'::text, r.kind, r.score, r.malicious,
                        r.feed_count, r.tags, r.source, NULL::text, dcount;
    RETURN;
  END IF;

  -- ---------- 5. pivot candidates, in the caller's order ----------
  -- A parent is either a listed domain (subdomain / URL-host pivot)
  -- or a listed IP (URL hosted on known-bad infrastructure).
  FOR i IN 2 .. COALESCE(array_length(cands, 1), 0) LOOP
    SELECT i2.score, i2.malicious, i2.feed_count, i2.tags, i2.source, i2.kind INTO r
    FROM public.indicator_intel i2
    WHERE i2.value = cands[i] AND i2.kind = 'domain'
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT cands[i], 'parent'::text, r.kind, r.score, r.malicious,
                          r.feed_count, r.tags, r.source, NULL::text, dcount;
      RETURN;
    END IF;

    IF cands[i] ~ v4_re THEN
      SELECT i2.score, i2.malicious, i2.feed_count, i2.tags, i2.source INTO r
      FROM public.ip_intel i2 WHERE i2.ip = cands[i]::inet LIMIT 1;
      IF FOUND THEN
        RETURN QUERY SELECT cands[i], 'parent'::text, 'ip'::text, r.score, r.malicious,
                            r.feed_count, r.tags, r.source, NULL::text, dcount;
        RETURN;
      END IF;
    END IF;
  END LOOP;

  -- ---------- 6. CIDR containment ----------
  -- Closes the "hidden IP" gap the feed scanner handles with
  -- findMatchingCidr: an address malicious only by virtue of its
  -- subnet has no exact row anywhere. Nearest candidate wins, so a
  -- URL's own host is preferred over its parent domains.
  FOR i IN 1 .. COALESCE(array_length(cands, 1), 0) LOOP
    IF cands[i] !~ v4_re THEN CONTINUE; END IF;
    subnet := NULL;
    BEGIN
      SELECT sc.value INTO subnet
      FROM public.indicator_intel sc
      WHERE sc.kind = 'cidr'
        AND sc.value LIKE '%/%'
        AND family(sc.value::inet) = 4
        AND sc.value::inet >>= cands[i]::inet
      LIMIT 1;
    EXCEPTION WHEN others THEN
      -- One malformed cidr row must not 500 every hunt.
      subnet := NULL;
    END;
    IF subnet IS NOT NULL THEN
      RETURN QUERY SELECT cands[i], 'subnet'::text, 'subnet'::text, 90::smallint, true,
                          1::smallint, 'Malicious Subnet'::text, NULL::text, subnet, dcount;
      RETURN;
    END IF;
  END LOOP;
END;
$function$;

-- Default EXECUTE goes to PUBLIC on CREATE; state the intended
-- grantees explicitly so a later REVOKE-from-PUBLIC sweep cannot
-- silently take the browser's read path down with it.
GRANT EXECUTE ON FUNCTION public.lookup_intel(text, text[]) TO anon, authenticated, service_role;
