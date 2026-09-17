// Centralized Supabase connection constants.
//
// These are the PUBLIC publishable (anon) values — safe to ship in the browser
// bundle. They live in one place so the browser client (src/supabaseClient.js)
// and the Cloudflare Functions can't drift out of sync. Build-time Vite env
// vars take precedence when present; otherwise we fall back to the literals.
//
// NOTE: the privileged service_role key must NEVER appear here — it is read
// server-side only, from env, inside the Cloudflare Functions.

/** Read a Vite build-time env var, tolerating runtimes where it is undefined. */
const viteEnv = (key: string): string | undefined => (import.meta as any).env?.[key]

export const SUPABASE_URL =
  viteEnv('VITE_SUPABASE_URL') || 'https://api.threatbase.qzz.io'

export const SUPABASE_ANON_KEY =
  viteEnv('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5NjQzMjkxLCJleHAiOjIxMDUwMDMyOTF9.YDg8hR6FBYcQHxR5mNWLNKnVuHDeCSRMfrbm16trmhM'
