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
import { SUPABASE_URL } from '../../src/lib/supabaseConfig'

export const SESSION_COOKIE = 'tb_session'

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
export function encKey(env: any): string | null {
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
  env: any,
  admin: any,
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
  | { session: ResolvedSession; admin: any; response?: undefined }
  | { session?: undefined; admin: any; response: Response }
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
export function adminFor(env: any) {
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
export async function mintSession(admin: any, env: any, input: MintInput): Promise<Minted | null> {
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
  admin: any,
  env: any,
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

export async function revokeSession(admin: any, sessionId: string): Promise<boolean> {
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
  admin: any,
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

export async function revokeAllForUser(admin: any, userId: string): Promise<boolean> {
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

export async function listSessions(admin: any, userId: string): Promise<SessionSummary[]> {
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

async function pruneToActiveCap(admin: any, userId: string): Promise<void> {
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
export async function bumpKv(kv: any, key: string): Promise<number | null> {
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

export async function peekKv(kv: any, key: string): Promise<number> {
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
