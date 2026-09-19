/**
 * Client for the server-side session routes (functions/api/auth/*, /api/me).
 *
 * Phase 1 contract: the browser keeps doing everything it already does with its
 * Supabase session, and ALSO holds an HttpOnly `tb_session` cookie that mirrors
 * it. That cookie is invisible to this file on purpose — it cannot be read,
 * written, or deleted from JS, which is the entire point. Every call here is
 * "tell the server to change the cookie", never "hand the server a token in a
 * header the browser would otherwise send".
 *
 * Two rules this module keeps:
 *  1. `credentials: 'same-origin'` on every request. Without it no cookie is
 *     attached and every route below answers 401 forever, quietly.
 *  2. Nothing here throws into UI. establishSession() is called from an auth
 *     event handler that must not fail because a mirrored credential failed to
 *     sync; it resolves false and the app keeps working exactly as it did before
 *     this feature existed.
 */

const SESSION_PATH = '/api/auth/session'
const LOGOUT_PATH = '/api/auth/logout'
const LIST_PATH = '/api/auth/sessions'
const ME_PATH = '/api/me'

/** Handoff is best-effort and must never outlive the auth event that triggered
 *  it: a wedged connection would otherwise sit on a promise nobody awaits. */
const HANDOFF_TIMEOUT_MS = 10_000
const QUERY_TIMEOUT_MS = 15_000

export interface SessionSummary {
  id: string
  createdAt: string
  lastSeenAt: number
  userAgent: string | null
  lastSeenIp: string | null
  current?: boolean
}

export interface MePayload {
  id: string
  username: string | null
  role: string
  is_pro: boolean
  aal: string
  session_id: string
  expires_at: number | null
}

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    // Network failure, DNS, or the timeout firing. Callers treat null as
    // "unknown", never as "not signed in".
    return null
  }
}

/**
 * Mirror a live Supabase session into a server-side one.
 *
 * Returns true only on a 200, which the mint route guarantees means a row
 * exists and the cookie is set. false covers 4xx/5xx and transport failure
 * alike: the caller's job is to stop, not to distinguish.
 */
export async function establishSession(
  accessToken: string,
  refreshToken?: string,
): Promise<boolean> {
  if (!accessToken) return false
  const res = await postJson(
    SESSION_PATH,
    { mode: 'exchange', access_token: accessToken, ...(refreshToken ? { refresh_token: refreshToken } : {}) },
    HANDOFF_TIMEOUT_MS,
  )
  return !!res && res.ok
}

/**
 * Best-effort sign-out of the mirrored session.
 *
 * `scope: 'all'` also revokes every other device. Callers must NOT await this
 * before auth.signOut(): if the edge is unreachable the visitor still has to be
 * signed out of the app, so this runs alongside the existing flow rather than in
 * front of it. The cookie is HttpOnly, so there is nothing left to clean up here
 * if it fails — the row expires on its own.
 */
export async function endSession(scope?: 'all'): Promise<boolean> {
  const res = await postJson(LOGOUT_PATH, scope === 'all' ? { scope } : {}, HANDOFF_TIMEOUT_MS)
  return !!res && res.ok
}

/**
 * List this account's live sessions. Returns null on failure (a UI can then keep
 * whatever it already showed) and [] when there genuinely are none to report.
 */
export async function fetchSessions(): Promise<SessionSummary[] | null> {
  try {
    const res = await fetch(LIST_PATH, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data?.sessions) ? (data.sessions as SessionSummary[]) : []
  } catch {
    return null
  }
}

/** Revoke one listed session by its row id (a uuid, not a credential). */
export async function revokeSessionById(id: string): Promise<boolean> {
  return revokeRequest({ id })
}

/** Revoke every OTHER device and rotate this one — the "I saw a stranger here"
 *  button. On success this browser receives a fresh cookie, so it stays signed
 *  in while every other device drops on its next request. */
export async function revokeOtherSessions(): Promise<boolean> {
  return revokeRequest({ scope: 'others' })
}

async function revokeRequest(body: unknown): Promise<boolean> {
  try {
    const res = await fetch(LIST_PATH, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Who the cookie says I am. Null when unsigned or unreachable; a caller that
 *  needs to tell those apart should check the HTTP status itself. */
export async function whoAmI(): Promise<MePayload | null> {
  try {
    const res = await fetch(ME_PATH, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return (await res.json()) as MePayload
  } catch {
    return null
  }
}
