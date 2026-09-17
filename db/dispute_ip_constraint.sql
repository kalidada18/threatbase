-- ============================================================================
-- Dispute ip format constraint (server-side gate)
-- ----------------------------------------------------------------------------
-- disputes.ip is free text: the browser inserts it directly (ReportScanner.tsx)
-- and RLS only bounded its LENGTH, so "0.0.0.0/0" is a perfectly valid row.
-- The pipeline reads >=3-disputed IPs into ioc/data/false_positives.txt, which
-- update_feed.py parses with "/"-bearing lines treated as CIDRs — one accepted
-- row would delete every IPv4 from the published blocklist. sync now filters,
-- but DB CHECKs are the real gate: they also protect sync_apt.py's reader and
-- any future consumer of the table. Verified: current rows all pass the cast.
-- ============================================================================

ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_ip_is_ip;
ALTER TABLE public.disputes
  ADD CONSTRAINT disputes_ip_is_ip
  CHECK (host(ip::inet) = ip);
