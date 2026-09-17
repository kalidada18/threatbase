/**
 * The terminal state of a comments read, as one decision instead of a pair of
 * booleans.
 *
 * The bug this pins: postgrest-js answers a *failed* read with
 * `{data: null, error}` but a genuinely *empty* one with `{data: [], error: null}`.
 * The old component set `loadFailed` only when `error` was truthy and the row
 * list only when `data` was truthy, so `{data: null, error: null}` — an aborted
 * request that resolved without an error object, which is exactly what
 * `abortSignal` produces — fell through both branches and rendered "No comments
 * on this indicator yet." for an indicator whose comments had never loaded.
 * A wrong empty state is worse than an error: it reads as a fact about the data.
 */
export type CommentsStatus = 'ready' | 'error'

export function commentsSettled(res: { data: any[] | null; error: any }): {
  rows: any[]
  status: CommentsStatus
} {
  if (res.error || !res.data) return { rows: [], status: 'error' }
  return { rows: res.data, status: 'ready' }
}
