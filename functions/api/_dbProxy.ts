/**
 * Pure request-shaping logic for the /api/db BFF proxy (Phase 2).
 *
 * Split out of db/[[path]].ts for the same reason _session.ts exists: these
 * functions are the security-relevant decisions, and they are testable without
 * a database. Per the project's testing stance, the PostgREST round-trip itself
 * is NOT mocked — a mocked DB only proves the mock works. What gets tested here
 * is path acceptance, header filtering, and the credential substitution.
 *
 * THE CONTRACT THIS EXISTS TO HOLD: the browser stops holding a Supabase JWT and
 * starts holding only the tb_session cookie. This module turns that cookie back
 * into the *user's own* Bearer token on the way upstream, so Postgres still
 * evaluates every RLS policy against `auth.uid()` and the real `aal` claim.
 * Forwarding the service role here would silently make every row policy
 * decorative — see the note inside forwardRequestHeaders.
 */
import { SUPABASE_ANON_KEY } from '../../src/lib/supabaseConfig'

/** Services the proxy will speak to. Exactly one, because exactly one has a
 *  caller: `grep -r "db\.auth"` over src/ returns nothing but comments saying it
 *  must not be used, and the `db` client sets persistSession:false, so every real
 *  auth call still goes direct through supabaseClient.
 *
 *  `auth/v1` used to be listed here on the theory that Phase 3's MFA calls would
 *  then "come free" through the same prefix. Both halves of that theory are
 *  false, and this is the record of why so it does not get re-added:
 *
 *   1. Nothing calls it. An allowlist entry with no caller is only attack
 *      surface, and for GoTrue that surface is rate-limited endpoints (/otp,
 *      /signup, /recover) whose abuse would originate from the edge rather than
 *      the attacker's IP — defeating GoTrue's per-IP throttling.
 *   2. It would not have worked anyway. With persistSession:false, auth-js
 *      resolves the session BEFORE it builds a request (GoTrueClient.js:4869 for
 *      _enroll, which returns sessionError at 4873 and never reaches the
 *      _request at 4880). So db.auth.mfa.* fails locally, no HTTP is sent, and
 *      the proxy path is never taken. Phase 3 needs purpose-built server routes
 *      that hold the refresh token and talk to GoTrue directly; it does not need
 *      a second service mounted on this passthrough.
 *
 *  `storage` and `realtime` are absent for the same reason `auth` now is: zero
 *  `.storage.` and zero `.channel(` call sites in the browser tree (verified).
 *  Add a service when a real caller exists, not before. */
const ALLOWED_SERVICES = ['rest/v1'] as const

/** Hop-by-hop and connection-level headers, plus everything the upstream must
 *  not be allowed to learn from the client. `Cookie` is the important one: the
 *  visitor's tb_session must terminate HERE and never reach PostgREST, which has
 *  no use for it and whose logs would keep it forever. */
const STRIP_REQUEST_HEADERS = new Set([
  'cookie',
  'authorization',
  'apikey',
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cdn-loop',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'real-ip',
])

/** Response headers worth passing through. Everything else is dropped, and
 *  `set-cookie` is dropped specifically: GoTrue sets cookies when it handles a
 *  login, and forwarding that would hand the browser a second, unrevocable
 *  session mechanism running beside tb_session.
 *
 *  `content-range` is the one that would break silently if omitted: postgrest-js
 *  reads it to populate `count` (PostgrestBuilder.ts:415), so every paginated
 *  read and every `{ count: 'exact' }` would come back with count: null. The rest
 *  are carried because the browser or a 307 needs them, not because the client
 *  parses them — `preference-applied` in particular is informational only. */
const PASS_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'preference-applied',
  'location',
  'x-content-type-options',
]

/** Largest request body the proxy will relay. The real ceiling in this app is a
 *  bulk hunt submission; 1 MB is well above it while still bounding what a
 *  single authenticated request can make the edge buffer. */
export const MAX_BODY_BYTES = 1_000_000

export type UpstreamTarget = { url: string; service: string } | null

/**
 * Map an incoming `/api/db/<service>/...` pathname onto the real Supabase URL.
 *
 * Returns null for anything outside the allowlist, so the route can 404 without
 * having made a request. The reconstruction is deliberately from parts rather
 * than a string replace: a replace would let `//evil/x` or a stray scheme leak
 * into the upstream URL.
 */
export function resolveUpstream(
  pathname: string,
  baseUrl: string,
): UpstreamTarget {
  if (!pathname.startsWith('/api/db/')) return null

  const rest = pathname.slice('/api/db/'.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length < 2) return null

  const service = `${segments[0]}/${segments[1]}`
  if (!(ALLOWED_SERVICES as readonly string[]).includes(service)) return null

  // Reject any dot segment, in every spelling the URL parser would honour. See
  // containsDotSegment for why a literal-dot check is not enough.
  const tail = segments.slice(2)
  if (tail.some(containsDotSegment)) {
    return null
  }

  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return null
  }
  // The configured project is the only authority this proxy will ever dial. A
  // non-http scheme would otherwise be handed straight to fetch() and rejected at
  // runtime, and a mis-set SUPABASE_URL should read as "not configured" here
  // rather than as an upstream failure.
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null
  // Never trust a configured base with a trailing path: rebuild from origin so
  // the only path the upstream can receive is the one we validated.
  base.pathname = [service, ...tail].join('/')
  base.search = ''
  base.hash = ''
  // Post-normalisation invariant, and the reason the dot check above is a
  // courtesy rather than the load-bearing part. Assigning a pathname runs the
  // WHATWG parser, which can rewrite what we were handed. If the path the URL
  // actually holds no longer begins with the service we just allowlisted, then
  // something escaped the allowlist, and it does not matter which trick it used.
  // Validating the *result* is immune to the next encoding variant we have not
  // thought of; validating the input never will be.
  if (!base.pathname.startsWith(`/${service}/`)) return null
  return { url: base.toString(), service }
}

/**
 * True when a path segment is, or decodes to, a dot segment.
 *
 * A literal `.` / `..` check is not sufficient and neither is checking for a
 * literal dot anywhere in the segment: the URL parser also treats the percent-
 * encoded forms as dot segments (`%2e%2e`, `.%2e`, `%2e.`, and case-insensitive
 * `%2E`). So `/api/db/rest/v1/%2e%2e/%2e%2e/auth/v1/admin/users` normalises to
 * `/auth/v1/admin/users` and would otherwise walk out of the `rest/v1` prefix
 * this proxy exists to enforce.
 *
 * Anything that fails to decode is refused too: a malformed escape has no
 * business being in a table or function name, and letting it through means the
 * upstream gets to decide what it meant.
 */
function containsDotSegment(segment: string): boolean {
  if (segment.includes('.')) return true
  try {
    return decodeURIComponent(segment).includes('.')
  } catch {
    return true
  }
}

/**
 * Build the headers to send upstream: the client's own protocol headers, minus
 * the ones that must terminate at the edge, plus a credential the client never
 * sees.
 *
 * The Bearer token set here is the *user's* access token from their session row,
 * never SUPABASE_SERVICE_ROLE_KEY. With the service role, PostgREST connects as
 * a superuser that bypasses RLS, `auth.uid()` resolves to the service UUID, and
 * every policy in db/rls_policies.sql stops applying — a proxy that "works" in
 * every manual test while quietly letting any signed-in user read every row in
 * the database. The user token is also what makes a revoked session stop working
 * upstream.
 */
export function forwardRequestHeaders(
  request: Request,
  accessToken: string,
): Headers {
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) return
    headers.set(key, value)
  })
  headers.set('apikey', SUPABASE_ANON_KEY)
  headers.set('Authorization', `Bearer ${accessToken}`)
  // Cache-busting for the edge: a stale PostgREST read behind a cached response
  // would look like a write that silently failed.
  headers.set('Cache-Control', 'no-store')
  return headers
}

/** Which response headers survive the trip back to the browser. */
export function filterResponseHeaders(source: Headers): Headers {
  const headers = new Headers()
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = source.get(name)
    if (value !== null) headers.set(name, value)
  }
  // CORS has to be minted locally: an upstream `access-control-allow-origin:
  // <supabase-host>` would be both wrong and a hint about the origin's identity.
  return headers
}

/** True when the body is small enough to relay. Undefined/empty is fine — GET
 *  carries none. Measured in characters of already-read text, which for the
 *  JSON this endpoint accepts is a conservative proxy for bytes. */
export function bodyTooLarge(text: string | null | undefined): boolean {
  return !!text && text.length > MAX_BODY_BYTES
}

/** A session row can exist without a credential (a mint that carried no token).
 *  The route needs to tell "sign in again" apart from "not signed in", and the
 *  client needs a status it can retry after re-handoff. */
export const NO_CREDENTIAL_ERROR = 'session has no credential'
