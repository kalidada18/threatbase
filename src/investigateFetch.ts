/** Single authenticated call-site for /api/investigate. Shared by the page's
 *  query hook and in-graph pivot expansion so pivots carry the same Pro JWT
 *  (they previously fetched bare and 401'd as 'no-auth'). Parses the JSON error
 *  body on !ok so callers map codes to human copy. */
import type { Dossier } from '@/investigationTypes'

export type DossierResponse = {
  ok: boolean
  status: number
  /** Parsed body on any non-throwing response; null when the body wasn't JSON. */
  body: Dossier | { error?: string } | null
}

export async function fetchDossier(
  q: string,
  opts: { refresh?: boolean; token?: string; signal?: AbortSignal } = {},
): Promise<DossierResponse> {
  const { refresh = false, token, signal } = opts
  const url = `${import.meta.env.BASE_URL}api/investigate?q=${encodeURIComponent(q)}${refresh ? '&refresh=1' : ''}`
  const res = await fetch(url, {
    signal,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  })
  const body = (await res.json().catch(() => null)) as DossierResponse['body']
  return { ok: res.ok, status: res.status, body }
}

/** Server error codes → analyst-readable copy (the audit bans surfacing raw
 *  'unrecognized indicator' style strings). Unknown codes fall through. */
export function humanizeError(code: string | undefined, status: number): string {
  switch (code) {
    case 'unrecognized indicator': return "That is not an IP, domain, URL or hash."
    case 'pro_required': return 'Deep Investigation is a Pro feature.'
    case 'sign_in_required': return 'Sign in to investigate.'
    case 'pro_check_unavailable': return "Couldn't verify your access. Check your connection and retry."
    case 'all sources failed': return 'Every intel source failed for this indicator. Try again in a moment.'
    default:
      if (status === 429) return 'Rate limited. Wait a minute and retry.'
      return `Investigation failed (HTTP ${status}).`
  }
}
