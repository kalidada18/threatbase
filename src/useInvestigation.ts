import { useEffect, useState } from 'react'
import type { Dossier } from './investigationTypes'

/** Fetches the /api/investigate dossier for q; re-fetches when q changes;
 *  cancels in-flight on unmount. Network/HTTP/parse errors surface as `error`. */
export function useInvestigation(q: string | null): { dossier: Dossier | null; loading: boolean; error: string | null } {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(!!q)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!q) { setDossier(null); setLoading(false); setError(null); return }
    const ac = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)
    // Site convention: relative api/ path works on the prod domain and pages.dev;
    // in `vite dev` this proxies through the Functions emulator (no /ioc/ base —
    // that helper is feed-only, see getBaseUrl).
    fetch(`${import.meta.env.BASE_URL}api/investigate?q=${encodeURIComponent(q)}`, { signal: ac.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error((body as { error?: string })?.error || `investigation failed (HTTP ${r.status})`)
        return body as Dossier
      })
      .then((d) => { if (!cancelled) { setDossier(d); setLoading(false) } })
      .catch((e) => {
        if (cancelled || (e as Error)?.name === 'AbortError') return
        setError(String((e as Error)?.message || e))
        setLoading(false)
      })
    return () => { cancelled = true; ac.abort() }
  }, [q])

  return { dossier, loading, error }
}
