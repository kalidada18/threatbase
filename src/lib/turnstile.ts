/** Cloudflare Turnstile SITE key — the public half of the widget pair. Safe to
 *  ship in the browser bundle; the SECRET key is server-side only, read from
 *  env inside Pages Functions (TURNSTILE_SECRET) and must never appear in any
 *  file under src/.
 *
 *  Configure in .env (see .env.example):
 *    VITE_TURNSTILE_SITE_KEY=0x4AAAAAAEziW9iexwXDjZuu
 *  The literal below is the deployed widget's key so builds without .env work. */
const viteEnv = (key: string): string | undefined => (import.meta as any).env?.[key]

export const TURNSTILE_SITE_KEY =
  viteEnv('VITE_TURNSTILE_SITE_KEY') || '0x4AAAAAAEziW9iexwXDjZuu'
