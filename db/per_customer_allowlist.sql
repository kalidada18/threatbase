-- ============================================================================
-- Per-customer feed allowlist — server-side false-positive suppression
-- ----------------------------------------------------------------------------
-- NOT YET APPLIED. Review, then run via the Supabase dashboard SQL editor or
-- `supabase db push`. This is the schema behind the Pro claim "your own
-- allowlist is applied to every download" — the thing pfBlockerNG's local
-- whitelist cannot do (it dies with the box; ours is keyed to the token).
--
-- Delivery side (already coded): functions/feed/[[path]].ts calls
-- feed_allowlist_ips(client_hash) on every cache-miss for paid ip/ and
-- firewall/ products and drops matching lines via src/lib/allowlistFilter.ts
-- (unit-tested: src/lib/allowlistFilter.test.ts, `node --test`).
--
-- Global suppression already exists (disputes >= 3 -> data/false_positives.txt
-- applied pre-publish by the pipeline). This adds the PER-CUSTOMER layer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feed_allowlist (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip         inet NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ip)
);

ALTER TABLE public.feed_allowlist ENABLE ROW LEVEL SECURITY;

-- Owner-only CRUD straight from Profile via PostgREST (supabase-js in
-- src/components — same pattern as api_keys). note length checked in policy
-- because reporter_alias taught us client strings need a server bound
-- (db/pro_and_rls_fixes.sql #4).
DROP POLICY IF EXISTS feed_allowlist_own ON public.feed_allowlist;
CREATE POLICY feed_allowlist_own ON public.feed_allowlist
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND length(coalesce(note, '')) <= 200
  );

-- Table-level grant to authenticated; RLS narrows rows. (Column-level grants
-- are NOT needed here — no privileged column exists. The api_keys lesson was
-- a table grant covering an entitlement column; there is nothing here to
-- escalate through.)
GRANT SELECT, INSERT, DELETE ON public.feed_allowlist TO authenticated;

-- ponytail: no per-user row cap. 1000 rows is still a trivial filter; add a
-- BEFORE INSERT count check if anyone allowlists their whole /24 as a joke.

-- The delivery-time lookup: token hash -> owner's allowlisted IPs. Mirrors
-- validate_feed_token: SECURITY DEFINER, search_path pinned, service_role
-- execute only (the Worker holds the service key; customers cannot probe
-- other users' allowlists via /rest/v1/rpc).
CREATE OR REPLACE FUNCTION public.feed_allowlist_ips(client_hash text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT coalesce(array_agg(a.ip::text), '{}')::text[]
  FROM public.api_keys k
  JOIN public.feed_allowlist a ON a.user_id = k.user_id
  WHERE k.key_hash = client_hash AND k.is_active
$function$;

REVOKE ALL ON FUNCTION public.feed_allowlist_ips(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feed_allowlist_ips(text) TO service_role;

-- ============================================================================
-- VERIFICATION — each should behave as the comment says.
-- ============================================================================
-- Owner CRUD works, other users' rows invisible:
--   (as authenticated user A) insert into feed_allowlist (user_id, ip)
--     values (auth.uid(), '8.8.8.8');        -- ok
--   select * from feed_allowlist;             -- only A's rows
--
-- RPC returns the joined IPs for a live key hash, {} otherwise:
--   (service role) select feed_allowlist_ips('<sha256 of a real key>');
--
-- RPC is not callable by customers:
--   (as authenticated) select * from rpc('feed_allowlist_ips', ...)  -- 42501
