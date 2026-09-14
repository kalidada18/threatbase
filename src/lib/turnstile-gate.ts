/** Invisible Cloudflare Turnstile gate for the sign-in flow.
 *
 *  Loads the official script (https://challenges.cloudflare.com/turnstile/v0/api.js),
 *  renders a compact managed-challenge widget with data-action "login", and
 *  resolves only after the backend (/api/turnstile-verify) has redeemed the
 *  single-use token at Cloudflare's siteverify. The browser never talks to
 *  siteverify and never sees the secret key.
 *
 *  Managed mode with appearance:'interaction-only' means most visitors flash
 *  through it without lifting a finger; only suspicious traffic sees a visible
 *  checkbox, which they can actually click. Tokens are single-use, so every
 *  attempt re-mints one via turnstile.reset(). */

import { TURNSTILE_SITE_KEY } from './turnstile'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
// action strings are 1-32 chars of [A-Za-z0-9_-]. The verify endpoint binds
// to this exact string; the boot interstitial reuses it (both mean "browser
// passed a challenge on our surface" — the label exists to keep /report
// tokens from being redeemable here).
export const LOGIN_ACTION = 'login'

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

// One screen-edge container reused across attempts. With
// appearance:'interaction-only' it stays blank for easy traffic and shows a
// real, clickable checkbox bottom-right exactly when Cloudflare escalates —
// an off-screen widget would make that escalation an uncompletable deadlock.
let mountId = 0
function mountEl(): HTMLElement {
  let el = document.getElementById('tb-turnstile-mount')
  if (!el) {
    el = document.createElement('div')
    el.id = 'tb-turnstile-mount'
    // Not display:none — Turnstile skips invisible widgets.
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647'
    document.body.appendChild(el)
  }
  return el
}

let pending: Promise<void> | null = null
let pendingResolve: (() => void) | null = null
let widgetId: string | null = null
// Generation counter: every callback captures the seq of its own attempt and
// bails if a newer one superseded it, so stale fetch continuations or expired
// iframes can never null out (or resolve) the current attempt's state.
let seq = 0

/** Resolves when the visitor has passed the managed challenge for a login
 *  attempt. Throws on failure — the sign-in path treats that as "not human". */
export function ensureTurnstileLogin(): Promise<void> {
  if (pending) return pending
  const my = ++seq
  pending = new Promise<void>((resolve, reject) => {
    pendingResolve = resolve
    const fail = (msg: string) => {
      if (my !== seq) return
      pending = null
      pendingResolve = null
      reject(new Error(msg))
    }
    loadTurnstile()
      .then((turnstile) => {
        if (my !== seq) return
        const el = mountEl()
        // Turnstile requires remove() before destroying a widget's DOM,
        // otherwise the old iframe keeps firing callbacks at stale state.
        if (widgetId != null) turnstile.remove(widgetId)
        el.innerHTML = ''
        widgetId = turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          action: LOGIN_ACTION,
          appearance: 'interaction-only',
          callback: async (token: string) => {
            // Redeem server-side; anything but 200 = fail closed.
            try {
              const res = await fetch(`${import.meta.env.BASE_URL}api/turnstile-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turnstileToken: token }),
              })
              if (!res.ok) throw new Error()
              if (my !== seq) return
              pendingResolve?.()
              pending = null
              pendingResolve = null
            } catch {
              // Expired/used tokens must never linger: re-mint on the next attempt.
              if (my === seq && widgetId != null) (window as any).turnstile?.reset(widgetId)
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

// ponytail: no timeout on the challenge — with interaction-only the escalated
// checkbox is visible and clickable, so a pending promise means the visitor
// abandoned the widget, which callers already surface as "loading". Add a
// 60s bail if abandoned attempts ever cause a visible stuck state.
