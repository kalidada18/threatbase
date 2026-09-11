import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

export type ProStatus = 'checking' | 'pro' | 'not-pro' | 'signed-out' | 'unavailable'

/** Resolves the viewer's Pro status from GET /api/me/pro (JWT in Bearer header).
 *  'checking' while auth or the request is in flight; network/503 → 'unavailable'
 *  so the paywall can offer Retry instead of a wrong 'not-pro'. */
export function usePro(): { status: ProStatus; refetch: () => void } {
  const { user, session, loading } = useAuth()
  const [status, setStatus] = useState<ProStatus>('checking')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (loading) { setStatus('checking'); return }
    if (!user) { setStatus('signed-out'); return }
    if (!session?.access_token) { setStatus('unavailable'); return }
    const ac = new AbortController()
    let cancelled = false
    setStatus('checking')
    fetch(`${import.meta.env.BASE_URL}api/me/pro`, {
      signal: ac.signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (r) => {
        if (cancelled) return
        if (r.ok) {
          const body = await r.json().catch(() => null)
          setStatus(body?.is_pro ? 'pro' : 'not-pro')
        } else if (r.status === 401) {
          setStatus('signed-out')
        } else {
          setStatus('unavailable')
        }
      })
      .catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => { cancelled = true; ac.abort() }
  }, [loading, user, session?.access_token, tick])

  return { status, refetch: () => setTick((t) => t + 1) }
}
