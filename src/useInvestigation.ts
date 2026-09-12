import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchDossier, humanizeError } from './investigateFetch'
import type { Dossier } from './investigationTypes'

/** Fetches the /api/investigate dossier for q; re-fetches when q changes;
 *  refresh=true bypasses the server cache (?refresh=1, rate-limited per IP).
 *  nonce re-runs the fetch for the SAME q (re-submitting the current search).
 *  Cancels in-flight on unmount. Server error codes are mapped to human copy.
 *  The token is read at fetch time from a ref, so a mid-flight token refresh
 *  never re-runs the investigation (boolean presence is the dep). */
export function useInvestigation(q: string | null, refresh = false, nonce = 0): { dossier: Dossier | null; loading: boolean; error: string | null } {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(!!q)
  const [error, setError] = useState<string | null>(null)
  const { session } = useAuth()
  const token = session?.access_token
  const tokenRef = useRef(token)
  tokenRef.current = token
  const hasToken = !!token

  useEffect(() => {
    if (!q) { setDossier(null); setLoading(false); setError(null); return }
    const ac = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)
    // Site convention: relative api/ path works on the prod domain and pages.dev;
    // in `vite dev` this proxies through the Functions emulator (no /ioc/ base —
    // that helper is feed-only, see getBaseUrl).
    fetchDossier(q, { refresh, token: tokenRef.current, signal: ac.signal })
      .then((r) => {
        if (cancelled) return
        if (ac.signal.aborted) return
        if (!r.ok) { setError(humanizeError((r.body as { error?: string } | null)?.error, r.status)); setLoading(false); return }
        setDossier(r.body as Dossier)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled || (e as Error)?.name === 'AbortError') return
        setError((e as Error)?.name === 'TypeError' ? 'Connection lost. Check your network and retry.' : String((e as Error)?.message || e))
        setLoading(false)
      })
    return () => { cancelled = true; ac.abort() }
  }, [q, refresh, hasToken, nonce])

  return { dossier, loading, error }
}
