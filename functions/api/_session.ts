/**
 * Server-side web sessions — the `tb_session` HttpOnly cookie.
 *
 * Phase 1 of moving web auth to the edge: the browser keeps only an opaque
 * random id, this module turns it into an identity. Schema and rationale in
 * db/sessions.sql. The service key stays server-side, and the cookie value is
 * never returned in a response body — the "active sessions" list exposes row
 * ids (uuids that are not credentials), not hashes and not secrets.
 *
 * SECRETS THIS NEEDS (Cloudflare Pages → Settings → Functions → Secrets):
 *   SUPABASE_SERVICE_ROLE_KEY  already configured (db/README.md step 14)
 *   SESSION_ENC_KEY            NEW. base64 of 32 random bytes; encrypts the
 *                              Supabase token pair at rest. Generate with:
 *                                node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *                              Missing key => minting and verification both fail
 *                              CLOSED (503), the same convention as the Pro
 *                              check in _pro.ts.
 *
 * LOCAL DEV: put SESSION_ENC_KEY in .dev.vars. cookieAttributes() drops the
 * `Domain` attribute on localhost so `wrangler pages dev` can set the cookie at
 * all; `Secure` stays because browsers treat http://localhost as trustworthy.
 */
import { createClient } from '@supabase/supabase-js'
import { json, corsHeaders } from './_common'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/lib/supabaseConfig'

export const SESSION_COOKIE = 'tb_session'

/**
 * The Pages Function bindings this subsystem reads. Declared on purpose rather
 * than left as `any`: there are six keys, they all come from wrangler.jsonc or
 * the dashboard, and the failure mode of a wrong name is silent — `env?.X` on a
 * typo yields undefined, which makes `peekKv` return 0 and turns a rate limiter
 * into a no-op that looks like it is working.
 *
 * All optional: a binding can genuinely be absent (that is what the 503 paths
 * exist for), so absence must stay representable.
 */
export interface SessionEnv {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  /** AES-256-GCM key for the stored token pair. See encKey(). */
  SESSION_ENC_KEY?: string
  /** Day-scoped counters for the auth rate limiters. */
  IOC_CACHE?: KvStringStore
}

/** The subset of a Workers KV namespace the auth counters actually use. */
export interface KvStringStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>
}

/**
 * Left loose deliberately, and the reason is worth recording so nobody re-tries
 * this: supabase-js v2 resolves `.rpc()` against the client's Database generic,
 * and without a generated one every function's Args collapses to `never` and its
 * Returns to `never` — so `ReturnType<typeof createClient>` turned the nine
 * `admin.rpc(...)` calls in this file into compile errors instead of checked
 * calls. Named anyway so the fix is one edit in one place: run
 * `supabase gen types typescript`, then make this
 * `SupabaseClient<Database>` and the `any` at every call site resolves itself.
 * A hand-written narrow interface was rejected: it would encode our guesses
 * about PostgREST rather than the actual schema, which is worse than `any`.
 */
export type AdminClient = any

/** Liveness dials. `ABSOLUTE` is the ceiling a session may never be refreshed
 *  past; `IDLE` is how long one survives without requests; `TOUCH` throttles how
 *  often the sliding deadline is rewritten (it bounds the WRITE budget, it is not
 *  a security boundary); `MAX_ACTIVE` caps live sessions per account. */
export const ABSOLUTE_TTL_SECONDS = 30 * 24 * 3600
export const IDLE_TTL_SECONDS = 14 * 24 * 3600
export const TOUCH_INTERVAL_SECONDS = 3600
export const MAX_ACTIVE_SESSIONS = 10

/** Per-IP-per-day gates on the mint endpoint, in the same IOC_CACHE bucket
 *  style as functions/api/v1/_middleware.ts. 20 failed credential attempts is
 *  generous for a person whose password manager is locked; 60 mints is far above
 *  any honest reload pattern. */
export const AUTH_FAIL_DAILY_LIMIT = 20
export const AUTH_MINT_DAILY_LIMIT = 60

// Counts only *rejected* refreshes (see functions/api/auth/refresh.ts), so an
// honest client refreshing once an hour per tab never increments it. The number
// is a ceiling on what a stolen cookie can spend GoTrue on, not a throttle on
// legitimate use.
export const AUTH_REFRESH_DAILY_LIMIT = 60

const PROD_HOST_SUFFIX = 'threatbase.qzz.io'
const PROD_COOKIE_DOMAIN = '.threatbase.qzz.io'
const UA_MAX_LEN = 200
/** A sha256hex'd id is 64 hex chars; the cookie itself is 43 base64url chars. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/

const te = new TextEncoder()
const td = new TextDecoder()

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/** `Uint8Array<ArrayBuffer>`, not `Uint8Array<ArrayBufferLike>`: WebCrypto's
 *  BufferSource demands the former and TS 6 will not widen it for us. */
function bytesFrom(source: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  const out = new Uint8Array(source.byteLength)
  out.set(source)
  return out
}

function b64urlEncode(source: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytesFrom(source))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const raw = Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const out = new Uint8Array(raw.byteLength)
  out.set(raw)
  return out
}

/** Lowercase hex sha256 — the same digest form api_keys.key_hash uses, so
 *  "credential table stores a hash, never the secret" holds identically across
 *  both tables. */
export async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', te.encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 256 bits of CSPRNG as base64url: 43 chars, safe in a cookie with no extra
 *  encoding, and deliberately unstructured — not a JWT, so there is no parser
 *  for a verifier and a mint to disagree about. */
export function newSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return b64urlEncode(bytes)
}

/** AES-256-GCM envelope: `v1:<iv b64url>:<ciphertext b64url>`. GCM authenticates,
 *  so a tampered row fails to decrypt rather than yielding garbage. The version
 *  prefix is what lets a future key rotation still read old rows while writing
 *  new ones under `v2`. */
export async function encryptSecret(plaintext: string, keyB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b64urlDecode(keyB64), { name: 'AES-GCM' }, false, [
    'encrypt',
  ])
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(plaintext))
  return `v1:${b64urlEncode(iv)}:${b64urlEncode(ct)}`
}

export async function decryptSecret(bundle: string, keyB64: string): Promise<string> {
  const [version, ivB64, ctB64] = bundle.split(':')
  if (version !== 'v1' || !ivB64 || !ctB64) throw new Error('unsupported secret envelope')
  const key = await crypto.subtle.importKey('raw', b64urlDecode(keyB64), { name: 'AES-GCM' }, false, [
    'decrypt',
  ])
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlDecode(ivB64) },
    key,
    b64urlDecode(ctB64),
  )
  return td.decode(pt)
}

/** Null, not a default key: a missing encryption key means we cannot write the
 *  credential the session stands for, so minting would produce a session that
 *  Phase 2 cannot proxy with. Fail closed and let the route 503. */
// `| undefined` is load-bearing, not ceremony: every reader here uses `env?.`,
// and the guard has to hold when a deploy arrives with no env binding at all.
// A stricter signature would only make the fail-closed path unrepresentable.
export function encKey(env: SessionEnv | undefined): string | null {
  const k = env?.SESSION_ENC_KEY
  return typeof k === 'string' && k.length >= 43 ? k : null
}

// ---------------------------------------------------------------------------
// cookie
// ---------------------------------------------------------------------------

/** `Domain=.threatbase.qzz.io` is what shares the session with
 *  hunt.threatbase.qzz.io. It is invalid on a localhost cookie, so dev omits it
 *  — and omitting it is strictly safer there, binding the cookie to one host.
 *
 *  Deliberately NOT `__Host-tb_session`: that prefix forbids a Domain attribute,
 *  which is exactly the cross-subdomain property we need. Logged here so nobody
 *  "hardens" it into a non-shared cookie later. */
function cookieAttributes(request: Request): string[] {
  const host = hostnameOf(request)
  const isOurs = host === PROD_HOST_SUFFIX || host.endsWith(`.${PROD_HOST_SUFFIX}`)
  const attrs = ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']
  if (isOurs) attrs.splice(1, 0, `Domain=${PROD_COOKIE_DOMAIN}`)
  return attrs
}

export function hostnameOf(request: Request): string {
  try {
    return new URL(request.url).hostname
  } catch {
    return ''
  }
}

export function buildSessionCookie(request: Request, sessionId: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${sessionId}`,
    ...cookieAttributes(request),
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ')
}

/** Same attribute set as the write, or the clear misses the stored cookie.
 *  Max-Age=0 and an empty value are both required — some engines ignore a
 *  zero-length value without the explicit expiry. */
export function clearedSessionCookie(request: Request): string {
  return [`${SESSION_COOKIE}=`, ...cookieAttributes(request), 'Max-Age=0'].join('; ')
}

export function readSessionId(request: Request): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    // Shape gate before the value reaches a query, an error message, or a log.
    return SESSION_ID_PATTERN.test(value) ? value : null
  }
  return null
}

/**
 * CSRF gate for every state-changing route. `SameSite=Lax` already stops a
 * cross-site POST from carrying the cookie; this is the second layer and the
 * only one that catches a *same-site* attacker page (a subdomain we do not
 * control, or an XSS on an origin we do).
 *
 * A missing Origin is untrusted: browsers always send it on same-origin fetch
 * POSTs, so requiring it costs nothing and closes "no header means no check".
 */
export function isTrustedOrigin(request: Request): boolean {
  const raw = request.headers.get('Origin') || request.headers.get('Referer') || ''
  if (!raw) return false
  let host: string
  try {
    host = new URL(raw).hostname
  } catch {
    return false
  }
  if (!host) return false
  // Exact, then dot-prefixed. A bare endsWith(suffix) would accept
  // `threatbase.qzz.io.attacker.tld`, and that is the whole attack.
  if (host === PROD_HOST_SUFFIX || host.endsWith(`.${PROD_HOST_SUFFIX}`)) return true
  return host === 'localhost' || host === '127.0.0.1'
}

// ---------------------------------------------------------------------------
// verification (hot path)
// ---------------------------------------------------------------------------

export type SessionState =
  | 'ok'
  | 'anonymous'
  | 'invalid'
  | 'not-found'
  | 'expired'
  | 'revoked'
  | 'reused'
  | 'unavailable'

export interface ResolvedSession {
  state: SessionState
  /** Row id (uuid) — NOT the cookie value. Safe to echo, log and list. */
  id?: string
  userId?: string
  familyId?: string
  aal?: string
  expiresAt?: number
  idleExpiresAt?: number
  accessToken?: string
  refreshToken?: string
}

const STATUS_TO_STATE: Record<string, SessionState> = {
  ok: 'ok',
  invalid: 'invalid',
  'not-found': 'not-found',
  expired: 'expired',
  revoked: 'revoked',
  reused: 'reused',
}

/**
 * Cookie -> identity, in one RPC round-trip. Liveness judgement and the
 * throttled sliding bump happen in SQL (db/sessions.sql).
 *
 * FAILS CLOSED. Missing service key, RPC error, or an undecryptable credential
 * payload all resolve to a session that cannot be used. An auth path that
 * guesses "probably signed in" is worse than one that 503s.
 */
export async function resolveSession(
  request: Request,
  env: SessionEnv,
  admin: AdminClient,
): Promise<ResolvedSession> {
  const sessionId = readSessionId(request)
  if (!sessionId) return { state: 'anonymous' }
  if (!admin) return { state: 'unavailable' }

  const now = Math.floor(Date.now() / 1000)
  const tokenHash = await sha256hex(sessionId)
  const { data, error } = await admin.rpc('authenticate_session', {
    p_token_hash: tokenHash,
    p_now: now,
    p_idle_seconds: IDLE_TTL_SECONDS,
    p_touch_seconds: TOUCH_INTERVAL_SECONDS,
  })
  if (error) {
    console.error('authenticate_session failed:', error.message)
    return { state: 'unavailable' }
  }
  const row = Array.isArray(data) ? data[0] : null
  if (!row) return { state: 'invalid' }

  const state = STATUS_TO_STATE[row.status] ?? 'invalid'
  if (state !== 'ok') return { state }

  const key = encKey(env)
  if (!key) {
    console.error('SESSION_ENC_KEY missing — session credentials unreadable.')
    return { state: 'unavailable' }
  }
  try {
    return {
      state: 'ok',
      id: row.session_id,
      userId: row.user_id,
      familyId: row.family_id,
      aal: row.aal,
      expiresAt: Number(row.expires_at),
      idleExpiresAt: Number(row.idle_expires_at),
      accessToken: row.access_token_enc ? await decryptSecret(row.access_token_enc, key) : undefined,
      refreshToken: row.refresh_token_enc ? await decryptSecret(row.refresh_token_enc, key) : undefined,
    }
  } catch {
    // Hash matched a live row but the payload will not decrypt: a rewritten row
    // or a rotated key. Not authenticated, and not something a retry fixes.
    console.error('session credential decrypt failed')
    return { state: 'invalid' }
  }
}

/**
 * Route guard. Returns either `{ session, admin }` or a ready-to-return
 * `{ response }`, so callers early-return without try/catch and without
 * inventing their own status codes.
 *
 * `reused` is reported as 401, not 403: from the browser's point of view the
 * answer to "my session was revoked because it leaked" is still "sign in".
 *
 * `allowAnonymous` is opt-in and exists for the data proxy only. "No cookie" is
 * not a failed sign-in there — it is PostgREST's `anon` role, and RLS decides
 * what that role may read (db/00_bootstrap.sql grants SELECT on two views to
 * anon). Without the opt-in, every logged-out visitor's public page became a
 * 401 the moment data access moved behind this proxy: the contributors
 * leaderboard broke in production while working perfectly for any signed-in
 * tester. A cookie that IS present but invalid, expired, reused or revoked still
 * gets 401 — only the genuine absence of one downgrades, and downgrading is
 * strictly less privilege, never more.
 */
export async function requireSession(
  context: any,
  opts?: { allowAnonymous?: boolean },
): Promise<
  | { session: ResolvedSession; admin: AdminClient; response?: undefined }
  | { session?: undefined; admin: AdminClient; response: Response }
> {
  const { request, env } = context
  const admin = adminFor(env)
  const session = await resolveSession(request, env, admin)
  if (session.state === 'ok') return { session, admin }
  if (session.state === 'anonymous' && opts?.allowAnonymous) return { session, admin }
  if (session.state === 'unavailable') {
    return { admin, response: json({ error: 'session backend unavailable' }, 503, request) }
  }
  return { admin, response: json({ error: 'sign in required' }, 401, request) }
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

/** Service-role client, required to touch the sessions table at all (RLS has no
 *  policies). Null when the key is missing — callers fail closed rather than
 *  falling back to anon, which would read as "nobody is signed in". */
export function adminFor(env: SessionEnv | undefined) {
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing — sessions unavailable.')
    return null
  }
  return createClient(env?.SUPABASE_URL || SUPABASE_URL, serviceKey)
}

export interface MintInput {
  userId: string
  aal: string
  accessToken?: string
  refreshToken?: string
  userAgent?: string
  ip?: string
  /** Continue an existing sign-in (rotation) instead of starting a new family. */
  familyId?: string
}

export interface Minted {
  /** The plaintext cookie value. Exists in this return value and in the cookie
   *  header only; the row keeps the hash. */
  cookie: string
  expiresAt: number
}

/**
 * Insert a live session row and return its cookie value.
 *
 * Over-cap sessions are pruned oldest-first rather than rejected: an 11th device
 * is a person with a phone, a laptop and a work machine, and the alternative to
 * pruning is locking them out of the account they just authenticated to.
 */
export async function mintSession(admin: AdminClient, env: SessionEnv, input: MintInput): Promise<Minted | null> {
  const key = encKey(env)
  if (!key) {
    console.error('SESSION_ENC_KEY missing — refusing to mint.')
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  const cookie = newSessionId()
  const tokenHash = await sha256hex(cookie)
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) {
    // Unreachable unless WebCrypto is broken; cheaper to assert than to ship a
    // row that CHECK-constrains at the database and silently fails here.
    console.error('session token hash failed shape check')
    return null
  }

  const access_token_enc = input.accessToken ? await encryptSecret(input.accessToken, key) : null
  const refresh_token_enc = input.refreshToken ? await encryptSecret(input.refreshToken, key) : null

  const { error } = await admin.from('sessions').insert({
    token_hash: tokenHash,
    user_id: input.userId,
    ...(input.familyId ? { family_id: input.familyId } : {}),
    aal: input.aal === 'aal2' ? 'aal2' : 'aal1',
    access_token_enc,
    refresh_token_enc,
    expires_at: now + ABSOLUTE_TTL_SECONDS,
    idle_expires_at: now + IDLE_TTL_SECONDS,
    touched_at: now,
    user_agent: (input.userAgent || '').slice(0, UA_MAX_LEN) || null,
    last_seen_ip: (input.ip || '').slice(0, 45) || null,
  })
  if (error) {
    console.error('session insert failed:', error.message)
    return null
  }
  await pruneToActiveCap(admin, input.userId)
  return { cookie, expiresAt: now + ABSOLUTE_TTL_SECONDS }
}

/**
 * Hand the caller's current sign-in to a fresh session id, retiring the old row
 * as *rotated* (not merely revoked — that distinction is what makes replay
 * detectable). Called on sign-in and on any assurance change, because the
 * anti-fixation requirement is that an id issued before authentication must not
 * survive it.
 */
export async function rotateSession(
  admin: AdminClient,
  env: SessionEnv,
  current: ResolvedSession,
  input: Omit<MintInput, 'userId' | 'familyId'> & { userId: string },
): Promise<Minted | null> {
  const minted = await mintSession(admin, env, {
    ...input,
    familyId: current.familyId,
  })
  if (!minted || !current.id) return minted
  const stamp = new Date().toISOString()
  const { error } = await admin
    .from('sessions')
    .update({ revoked_at: stamp, rotated_at: stamp })
    .eq('id', current.id)
    .is('revoked_at', null)
  if (error) console.error('rotation could not retire the previous row:', error.message)
  return minted
}

/**
 * Update the stored GoTrue credentials on the caller's existing row, keeping the
 * session id — and therefore the cookie — unchanged.
 *
 * Why this exists. Rotating on a *re*-handoff is what makes an ordinary
 * concurrent request dangerous. `AuthContext` fires the handoff and the first
 * data read in the same tick, so that read carries the pre-rotation cookie. If
 * the edge processes it after the rotation commits, `authenticate_session` finds
 * a retired row with `rotated_at` set, classifies it as `reused`, and revokes
 * every row sharing the `family_id` — including the brand-new one the browser
 * has just been handed. One request losing that race kills the session it was
 * sent to protect. Re-handoffs happen on every `TOKEN_REFRESHED`, so the window
 * reopens hourly in every open tab; serialising the client would close the boot
 * case and leave the rest.
 *
 * Anti-fixation is not weakened by this. The requirement is that an id issued
 * *before* authentication must not survive *authentication*. A re-handoff that
 * presents the same user's still-valid JWT to the session that already represents
 * them is not an authentication event, so there is no new id to hand out. Sign-in,
 * account switch, and any assurance change still rotate.
 *
 * Returns the row's existing absolute expiry, or null when the session cannot be
 * kept in place — the caller then falls back to `rotateSession`, which is always
 * correct and merely racy.
 */
export async function refreshSessionCredentials(
  admin: AdminClient,
  env: SessionEnv,
  current: ResolvedSession,
  input: { accessToken?: string; refreshToken?: string; aal: MintInput['aal'] },
): Promise<{ expiresAt: number } | null> {
  const key = encKey(env)
  // Every field on ResolvedSession is optional, so the live-session shape has to
  // be established field by field here rather than assumed from the caller's
  // branch: a session with no row id or no known expiry cannot be kept in place.
  const expiresAt = current.state === 'ok' ? current.expiresAt : undefined
  if (!key || !current.id || expiresAt === undefined) return null
  // An assurance change IS an authentication event: it has to rotate so the id
  // that only reached aal1 cannot survive into an aal2 session.
  if (current.aal !== input.aal) return null

  const patch: Record<string, unknown> = {}
  if (input.accessToken) patch.access_token_enc = await encryptSecret(input.accessToken, key)
  if (input.refreshToken) patch.refresh_token_enc = await encryptSecret(input.refreshToken, key)
  if (!Object.keys(patch).length) return { expiresAt }

  // expires_at is deliberately not extended. A re-handoff arrives on every token
  // refresh, so renewing the absolute window here would make ABSOLUTE_TTL_SECONDS
  // unmeasurable and turn a 30-day backstop into a sliding one.
  const { error } = await admin
    .from('sessions')
    .update(patch)
    .eq('id', current.id)
    .is('revoked_at', null)
  if (error) {
    console.error('in-place credential refresh failed:', error.message)
    return null
  }
  return { expiresAt }
}

/** How long a refresh worker holds the lease. Must exceed the GoTrue timeout
 *  (10s) so a slow-but-successful refresh is not double-run, and stay short
 *  enough that a crashed worker unlocks the session in seconds. */
export const REFRESH_LEASE_SECONDS = 20

export interface RefreshOutcome {
  status:
    | 'refreshed'
    | 'busy'
    | 'dead'
    | 'invalid'
    | 'invalid-grant'
    | 'upstream'
    | 'unavailable'
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
}

/**
 * Renew the stored GoTrue pair under the refresh lease (db/sessions_refresh.sql).
 *
 * Why a lease rather than just doing it: with the cookie in every tab, two tabs
 * can notice the same expiring access token in the same second. If both call
 * GoTrue, the second replays a refresh token GoTrue has already rotated, reuse
 * detection fires, and the whole token family is revoked — every tab logged out.
 * `claim_session_refresh` makes the refresh exactly-once per session by making
 * one caller hold the credentials and the right to swap them.
 *
 * The owner uuid is the second half of the protection: `release` refuses a write
 * from anyone but the current holder, so a worker that stalls past its lease and
 * finishes late cannot overwrite a newer token with its stale one.
 *
 * Nothing here mutates the session row's expiry or id — the cookie stays valid,
 * only the credentials behind it change.
 */
export async function refreshSessionWithLease(
  admin: AdminClient,
  env: SessionEnv,
  current: ResolvedSession,
): Promise<RefreshOutcome> {
  const key = encKey(env)
  if (!key || !current.id || current.state !== 'ok') return { status: 'unavailable' }
  const sessionId = current.id
  const now = () => Math.floor(Date.now() / 1000)

  const { data: claimRow, error: claimError } = await admin.rpc('claim_session_refresh', {
    p_session_id: sessionId,
    p_now: now(),
    p_lease_seconds: REFRESH_LEASE_SECONDS,
  })
  if (claimError) {
    console.error('claim_session_refresh failed:', claimError.message)
    return { status: 'unavailable' }
  }
  const lease = (Array.isArray(claimRow) ? claimRow[0] : null) as {
    status?: string
    lease_owner?: string | null
    access_token_enc?: string | null
    refresh_token_enc?: string | null
  } | null
  if (!lease?.status) return { status: 'unavailable' }
  if (lease.status === 'busy') return { status: 'busy' }
  if (lease.status === 'gone') return { status: 'dead' }
  if (lease.status !== 'claimed' || !lease.lease_owner) return { status: 'invalid' }

  const owner = lease.lease_owner

  // Hand the lease back without writing credentials. Every exit that is not a
  // committed refresh takes this path, so a failure unlocks immediately instead
  // of making the next request wait out the lease.
  const abandon = async () => {
    const { error } = await admin.rpc('release_session_refresh', {
      p_session_id: sessionId,
      p_lease_owner: owner,
      p_now: now(),
      p_access_token_enc: null,
      p_refresh_token_enc: null,
    })
    if (error) console.error('could not release refresh lease:', error.message)
  }

  if (!lease.refresh_token_enc) {
    await abandon()
    return { status: 'dead' }
  }

  let staleRefreshToken: string
  try {
    staleRefreshToken = await decryptSecret(lease.refresh_token_enc, key)
  } catch {
    // Undecryptable: wrong SESSION_ENC_KEY or a corrupted row. Neither is the
    // user's fault and neither is retryable, so keep the session and 503.
    await abandon()
    return { status: 'unavailable' }
  }

  let grant: Response
  try {
    grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: staleRefreshToken }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Timeout / DNS: the token may or may not have rotated upstream. Abandoning
    // is the safe move — if GoTrue did rotate, the row now holds a spent token
    // and the next attempt reads the family state from GoTrue, not from us.
    await abandon()
    return { status: 'upstream' }
  }

  if (!grant.ok) {
    await abandon()
    return { status: grant.status === 400 || grant.status === 403 ? 'invalid-grant' : 'upstream' }
  }

  const tokens = (await grant.json().catch(() => null)) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  } | null
  if (!tokens?.access_token) {
    await abandon()
    return { status: 'upstream' }
  }

  const nextAccess = await encryptSecret(tokens.access_token, key)
  // GoTrue omits refresh_token when it is not rotating. Keep the stored
  // ciphertext rather than writing NULL, which would disarm the session.
  const nextRefresh = tokens.refresh_token
    ? await encryptSecret(tokens.refresh_token, key)
    : lease.refresh_token_enc

  const { data: releasedRow, error: releaseError } = await admin.rpc('release_session_refresh', {
    p_session_id: sessionId,
    p_lease_owner: owner,
    p_now: now(),
    p_access_token_enc: nextAccess,
    p_refresh_token_enc: nextRefresh,
  })
  if (releaseError) {
    console.error('release_session_refresh failed:', releaseError.message)
    return { status: 'unavailable' }
  }
  const released = (Array.isArray(releasedRow) ? releasedRow[0] : null) as {
    status?: string
  } | null
  if (released?.status !== 'committed') {
    // This worker outlived its lease. Discard its tokens — a later holder already
    // committed, and writing now is the exact stale-token overwrite that the
    // owner check exists to prevent.
    return { status: 'busy' }
  }

  return {
    status: 'refreshed',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  }
}

export async function revokeSession(admin: AdminClient, sessionId: string): Promise<boolean> {
  const { error } = await admin
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('revoked_at', null)
  return !error
}

/**
 * Revoke one of the caller's own sessions.
 *
 * The ownership check is explicit and not inherited from RLS: every write here
 * runs with the service role, which bypasses row policies entirely, so a
 * `.eq('id', ...)` alone would let any signed-in user revoke any other user's
 * session by uuid. The id is a uuid rather than the credential, so it is not a
 * secret and enumeration is not the risk — cross-tenant revocation is.
 *
 * 'not-owned' and 'not-found' collapse to the same answer on purpose: confirming
 * which session ids exist under other accounts is an oracle we do not need to
 * give a stranger.
 */
export async function revokeOwnedSession(
  admin: AdminClient,
  sessionId: string,
  userId: string,
): Promise<'revoked' | 'not-owned'> {
  const { data, error } = await admin
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('session ownership check failed:', error.message)
    return 'not-owned'
  }
  if (!data) return 'not-owned'
  const ok = await revokeSession(admin, sessionId)
  return ok ? 'revoked' : 'not-owned'
}

export async function revokeAllForUser(admin: AdminClient, userId: string): Promise<boolean> {
  const { error } = await admin
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null)
  return !error
}

export interface SessionSummary {
  id: string
  createdAt: string
  lastSeenAt: number
  userAgent: string | null
  lastSeenIp: string | null
}

export async function listSessions(admin: AdminClient, userId: string): Promise<SessionSummary[]> {
  const { data, error } = await admin
    .from('sessions')
    .select('id, created_at, touched_at, user_agent, last_seen_ip')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_ACTIVE_SESSIONS + 5)
  if (error) {
    console.error('session list failed:', error.message)
    return []
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    lastSeenAt: Number(r.touched_at),
    userAgent: r.user_agent ?? null,
    lastSeenIp: r.last_seen_ip ?? null,
  }))
}

async function pruneToActiveCap(admin: AdminClient, userId: string): Promise<void> {
  const { data, error } = await admin
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: true })
  if (error || !data) return
  const excess = data.length - MAX_ACTIVE_SESSIONS
  if (excess <= 0) return
  const ids = data.slice(0, excess).map((r: any) => r.id)
  const { error: revErr } = await admin
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .in('id', ids)
  if (revErr) console.error('session cap prune failed:', revErr.message)
}

// ---------------------------------------------------------------------------
// request/response helpers
// ---------------------------------------------------------------------------

/** JSON plus N Set-Cookie headers. `Headers.append` is mandatory: an object
 *  literal cannot express a repeated header, and collapsing them is how a cookie
 *  silently stops being set. */
export function jsonResponse(
  body: unknown,
  status: number,
  request: Request,
  setCookies: string[] = [],
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...corsHeaders(request, 'GET, POST, DELETE, OPTIONS'),
  })
  for (const c of setCookies) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}

/** Bounded JSON body. Pages Functions ship no size guard and the mint endpoint is
 *  unauthenticated, so the attacker would otherwise pick the payload size. */
export async function readJson(request: Request, maxBytes = 8192): Promise<Record<string, any> | null> {
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (!text || text.length > maxBytes) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null
  } catch {
    return null
  }
}

/** Count one event against a KV bucket, day-scoped. Read-modify-write with no
 *  atomicity, same as every other limiter here: a fast flood overshoots a limit
 *  by a handful, not by a thousand. Returns null when KV is unavailable, which
 *  callers treat as "no gate", never as "block". */
export async function bumpKv(kv: KvStringStore | undefined, key: string): Promise<number | null> {
  if (!kv) return null
  try {
    const cur = await kv.get(key)
    const count = cur ? parseInt(cur, 10) + 1 : 1
    await kv.put(key, String(count), { expirationTtl: 86400 })
    return count
  } catch (err) {
    console.error('session rate counter unavailable:', err)
    return null
  }
}

export async function peekKv(kv: KvStringStore | undefined, key: string): Promise<number> {
  if (!kv) return 0
  try {
    const cur = await kv.get(key)
    return cur ? parseInt(cur, 10) : 0
  } catch {
    return 0
  }
}

/** Today's date suffix for a day-scoped KV key, in UTC. */
export function dayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}
