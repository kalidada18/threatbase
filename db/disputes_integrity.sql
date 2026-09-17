-- ============================================================================
-- Fix #2 — Dispute integrity (applied to production 2026-06-22)
-- ----------------------------------------------------------------------------
-- Before: `disputes` had no user_id and an insert policy of WITH CHECK (true),
-- so one authenticated account could insert 3+ disputes for any IP. The scanner
-- clears `isMalicious` at count >= 3, letting an attacker whitewash their own
-- malicious infrastructure.
--
-- After: each dispute is bound to the caller's uid, with at most one dispute per
-- (ip, user). Reaching the scanner's >=3 threshold now requires 3 distinct
-- accounts. This also activates the client's existing 23505 ("already disputed")
-- handling in src/components/ReportScanner.tsx.
--
-- Idempotent / safe to re-run.
-- ============================================================================

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL DEFAULT auth.uid();

CREATE UNIQUE INDEX IF NOT EXISTS disputes_ip_user_uniq
  ON public.disputes (ip, user_id);

DROP POLICY IF EXISTS "disputes_insert_auth" ON public.disputes;
CREATE POLICY "disputes_insert_auth" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
