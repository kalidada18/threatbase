/** Invisible Cloudflare Turnstile gate for the sign-in flow.
 *
 *  Loads the official script (https://challenges.cloudflare.com/turnstile/v0/api.js),
 *  renders a compact managed-challenge widget with data-action "login", and
 *  resolves only after the backend (/api/turnstile-verify) has redeemed the
 *  single-use token at Cloudflare's siteverify. The browser never talks to
 *  siteverify and never sees the secret key.
 *
 *  Managed mode means most visitors flash through it without lifting a finger;
 *  only suspicious traffic sees the checkbox. Tokens are single-use, so every
 *  attempt re-mints one via turnstile.reset(). */

import { TURNSTILE_SITE_KEY } from './turnstile'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
// action strings are 1-32 chars of [A-Za-z0-9_-].
const LOGIN_ACTION = 'login'

let scriptPromise: Promise<any> | null = null

/** Load the official Turnstile script once, resolving with window.turnstile. */
function loadTurnstile(): Promise<any> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const w = window as any
    if (w.turnstile?.render) return resolve(w.turnstile)
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.defer = true
    el.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('Turnstile failed to load')))
    el.onerror = () => reject(new Error('Turnstile failed to load'))
    document.head.appendChild(el)
  })
  return scriptPromise
}

// One off-screen container reused across attempts.
let mountId = 0
function mountEl(): HTMLElement {
  let el = document.getElementById('tb-turnstile-mount')
  if (!el) {
    el = document.createElement('div')
    el.id = 'tb-turnstile-mount'
    // Not display:none — Turnstile skips invisible widgets; clip it instead.
    el.style.cssText = 'position:fixed;left:-1px;top:0;width:280px;opacity:0;z-index:-1;pointer-events:none'
    document.body.appendChild(el)
  }
  return el
}

let pending: Promise<void> | null = null
let pendingResolve: (() => void) | null = null
let widgetId: string | null = null

/** Resolves when the visitor has passed the managed challenge for a login
 *  attempt. Throws on failure — the sign-in path treats that as "not human". */
export function ensureTurnstileLogin(): Promise<void> {
  if (pending) return pending
  pending = new Promise<void>((resolve, reject) => {
    pendingResolve = resolve
    const fail = (msg: string) => {
      pending = null
      pendingResolve = null
      reject(new Error(msg))
    }
    loadTurnstile()
      .then((turnstile) => {
        const el = mountEl()
        el.innerHTML = ''
        widgetId = turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          action: LOGIN_ACTION,
          appearance: 'always',
          callback: async (token: string) => {
            // Redeem server-side; anything but 200 = fail closed.
            try {
              const res = await fetch(`${import.meta.env.BASE_URL}api/turnstile-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turnstileToken: token }),
              })
              if (!res.ok) throw new Error()
              pendingResolve?.()
              pending = null
              pendingResolve = null
            } catch {
              // Expired/used tokens must never linger: re-mint on the next attempt.
              if (widgetId != null) (window as any).turnstile?.reset(widgetId)
              fail('Security check failed. Please try again.')
            }
          },
          'error-callback': () => fail('Security check failed. Please try again.'),
          'expired-callback': () => fail('Security check expired. Please try again.'),
        })
      })
      .catch(() => fail('Security check unavailable. Please try again.'))
  })
  return pending
}

// ponytail: no timeout on the challenge — if a visitor abandons it, the sign-in
// promise stays pending, which callers already surface as "loading". Add a
// 60s bail if abandoned attempts ever cause a visible stuck state.
