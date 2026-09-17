# Database (Supabase / Postgres)

Version-controlled SQL so the database is reproducible from the repo. Apply by
pasting each file into **Supabase → SQL Editor → Run**. All files are idempotent
and safe to re-run.

## Apply order (fresh project)

Verified end-to-end against the self-hosted rebuild, 2026-09-17.

1. **`00_bootstrap.sql`** — the five core app tables (`profiles`,
   `reported_ips`, `disputes`, `api_keys`, `comments`), the `api_insert_report`
   RPC, `handle_new_user()` + its `auth.users` trigger, and the two definer
   views. **Read its header first**: these columns were recovered from the live
   PostgREST API, not dumped, so the types are inferred.
2. **`functions.sql`** — `validate_api_key_hash`, `migrate_reporter_alias`,
   `delete_user`, `validate_feed_token`. (`api_insert_report` now lives in the
   bootstrap; the block here is the stale 4-arg version, still commented out —
   running it would create an anon-callable overload.)
3. **`rls_policies.sql`** — RLS for `profiles`, `reported_ips`, `disputes`,
   `api_keys`. Stale wherever it conflicts with `pro_and_rls_fixes.sql` (as its
   own header says) — run it *before*, **never after**.
4. **`disputes_integrity.sql`** — binds each dispute to a user, one per
   `(ip, user)`.
5. **`dispute_ip_constraint.sql`** — `disputes.ip` must be a bare IP.
6. **`ip_intel.sql`** → 7. **`indicator_intel.sql`** → 8. **`hash_intel.sql`** —
   the three bulk corpus tables. RLS with zero policies: only `service_role`
   reads or writes them.
9. **`lookup_intel.sql`** — the single-row verdict read. The *only* read path
   into the corpus; drop/rebuild it whenever its `RETURNS TABLE` changes shape.
10. **`pro_and_rls_fixes.sql`** — Pro inheritance, disputes/comments integrity,
    column-level grants on `profiles`.
11. **`harden_attacker_review_2026_09_15.sql`** — ⚠️ **two edits needed on a
    fresh database** (both noted inline in the file):
    - Delete the six lines REVOKEing/GRANTing `trace_neighborhood` and
      `upsert_trace_edge` — neither function is defined anywhere in this repo,
      so the block errors.
    - Delete the `ALTER VIEW … SET (security_invoker = on)` lines for
      `top_contributors` / `reported_ips_feed`. That ALTER is **wrong** on a
      fresh DB: both views read the owner-only `profiles` table and must stay
      definer, or every avatar on the leaderboard goes blank.
12. **`mint_api_key_rpc.sql`** — `mint_api_key`. Enforces `aal2`.
13. **`top_contributors_avatars.sql`** — ⚠️ **stale**: the file's view lacks
    `is_admin` / `is_superadmin`, which `Leaderboard.tsx` reads and the
    bootstrap already defines. Skip it, or update it before running.
14. **`lock_down_api_insert_report.sql`** — ⚠️ **Run this LAST, only after** the
    `SUPABASE_SERVICE_ROLE_KEY` secret is set on Cloudflare Pages and the
    updated Functions are deployed (see the file header), otherwise reporting
    breaks.
15. **`per_customer_allowlist.sql`** — optional, never applied to production.

## Notes

- These dumps are maintained by hand. When you change a function or policy in
  the Supabase dashboard, update the matching file here so the repo stays the
  source of truth. (A `supabase db pull` migrations workflow would automate
  this — a good future improvement.)
- The privileged `service_role` key is **server-only** — it must never appear in
  client code or in `src/`. It is read from `env` inside the Cloudflare
  Functions.
