/**
 * Bound a promise that has no AbortSignal of its own.
 *
 * supabase/auth-js's MFA methods (`enroll`, `challenge`, `verify`, `unenroll`)
 * take no `signal` argument, so the `AbortSignal.timeout()` pattern used
 * everywhere else in this codebase cannot apply to them. When one of them
 * stalls — observed in production: a challenge that never reached the server
 * and never settled, apparently queued behind auth-js's internal session lock —
 * the `finally { setLoading(false) }` downstream is unreachable and the UI sits
 * on a spinner with no way out but a full reload.
 *
 * This does NOT cancel the underlying request; it stops the caller waiting on
 * it. That is safe for every MFA call here:
 *
 *  - an `enroll` that lands after the timeout leaves an unverified factor,
 *    which `handleStartSetup` deletes before the next attempt;
 *  - a `verify` that lands late only ever succeeds, since a TOTP code stays
 *    valid for its whole window — the failure mode is a success reported as a
 *    failure, not a broken account;
 *  - `challenge` and `unenroll` are freely repeatable.
 *
 * The message is shown to the user, so it says what to do next.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s. Reload the page and try again.`)),
      ms,
    )
  })
  return Promise.race([p, guard]).finally(() => clearTimeout(timer)) as Promise<T>
}
