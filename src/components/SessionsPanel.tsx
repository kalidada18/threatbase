import React, { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Monitor, Smartphone, RotateCw, LogOut, Loader2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchSessions,
  revokeSessionById,
  revokeOtherSessions,
  type SessionSummary,
} from '../lib/session'
import { describeUserAgent } from '../lib/userAgent'
import { timeAgo } from '../utils'

/**
 * SessionsPanel — a professional "where you're signed in" list.
 *
 * Sits in the Profile "Security & access" section between two-factor and API
 * keys. It reads the account's live server-side sessions (the tb_session rows
 * behind the HttpOnly cookie) and lets the owner revoke one, or sign out
 * everywhere else. The whole point of moving sessions server-side (Phase 3) was
 * to make this list real and revocable; this is the surface that spends that
 * work.
 *
 * Design notes (locked system): one ruby accent, only on the current device and
 * destructive affordances. Rows are divided by hairlines, not stacked cards.
 * JetBrains Mono carries the machine data (IP, timestamps); Manrope carries the
 * human labels. Motion is a restrained staggered entrance and a slide-collapse
 * exit on revoke — both disabled under prefers-reduced-motion.
 */

type Status = 'loading' | 'ready' | 'error'

const shortDate = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SessionsPanel({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const reduce = useReducedMotion()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAll, setBusyAll] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setStatus('loading')
    const res = await fetchSessions()
    if (isRefresh) setRefreshing(false)
    if (res === null) {
      // A refresh keeps whatever is already on screen and only warns; a cold
      // load failure is the one case that flips to the error state.
      if (isRefresh) addToast('Could not refresh your sessions', 'error')
      else setStatus('error')
      return
    }
    setSessions(res)
    setStatus('ready')
  }, [addToast])

  // Fetch once on mount. `load` is stable enough (its only dependency is the
  // addToast prop); keying the effect on it would refetch whenever the parent
  // re-renders with a new callback identity, so the effect is intentionally
  // given no dependencies.
  useEffect(() => {
    load()
  }, [])

  // Current device first, then most recently active. The server sorts by
  // created_at; we re-sort so the row you are reading sits at the top.
  const ordered = [...sessions].sort((a, b) => {
    if (!!b.current !== !!a.current) return b.current ? 1 : -1
    return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)
  })
  const otherCount = sessions.filter((s) => !s.current).length

  async function handleRevoke(id: string) {
    if (busyId) return
    setBusyId(id)
    const ok = await revokeSessionById(id)
    setBusyId(null)
    if (ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id))
      addToast('Session revoked', 'success')
    } else {
      addToast('Could not revoke that session', 'error')
    }
  }

  async function handleRevokeOthers() {
    if (busyAll) return
    setBusyAll(true)
    const ok = await revokeOtherSessions()
    setBusyAll(false)
    if (ok) {
      addToast('Signed out on every other device', 'success')
      // This device was re-minted with a fresh id, so refetch to show it.
      await load(true)
    } else {
      addToast('Could not sign out your other sessions', 'error')
    }
  }

  const enter = reduce
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }

  return (
    <div className="glass-card p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 tracking-tight">
            <span className="icon-chip h-7 w-7"><ShieldCheck size={14} /></span> Sign-in activity
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-lg">
            Devices with an active session on this account. Revoke anything you don't recognize.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          title="Refresh"
          aria-label="Refresh sessions"
          className="p-2 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> We couldn't load your active sessions.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            className="h-8 border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 text-xs"
          >
            <RotateCw size={12} className="mr-1.5" /> Try again
          </Button>
        </div>
      )}

      {/* Loading skeleton — matches the row shape, not a spinner */}
      {status === 'loading' && (
        <div className="divide-y divide-white/[0.06]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 py-4">
              <div className="h-9 w-9 rounded-xl bg-white/[0.04] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded bg-white/[0.05] animate-pulse" />
                <div className="h-2.5 w-56 rounded bg-white/[0.04] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ready */}
      {status === 'ready' && (
        <>
          <div className="flex items-center justify-between gap-4 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-platinum-400 tabular-nums">
              {sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}
            </p>
            {otherCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevokeOthers}
                disabled={busyAll}
                className="h-8 border-white/10 text-xs text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/5"
              >
                {busyAll ? (
                  <Loader2 size={12} className="mr-1.5 animate-spin" />
                ) : (
                  <LogOut size={12} className="mr-1.5" />
                )}
                Sign out everywhere else
              </Button>
            )}
          </div>

          <div className="divide-y divide-white/[0.06]">
            <AnimatePresence initial={false}>
              {ordered.map((s, i) => {
                const info = describeUserAgent(s.userAgent)
                const isBusy = busyId === s.id
                return (
                  <motion.div
                    key={s.id}
                    layout={!reduce}
                    {...enter}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16, height: 0, marginTop: 0, marginBottom: 0 }}
                    transition={{ duration: reduce ? 0 : 0.28, delay: reduce ? 0 : i * 0.04, ease: 'easeOut' }}
                    className="relative flex items-center gap-4 py-4 overflow-hidden"
                  >
                    {s.current && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[2px] rounded-full bg-red-500/70 shadow-[0_0_12px_-1px_rgba(207,23,51,0.7)]" />
                    )}
                    <span
                      className={`icon-chip h-9 w-9 shrink-0 ${s.current ? 'border-red-500/25 bg-red-500/10 text-red-400' : ''}`}
                      aria-hidden
                    >
                      {info.device === 'mobile' || info.device === 'tablet' ? (
                        <Smartphone size={16} />
                      ) : (
                        <Monitor size={16} />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-white truncate">{info.label}</span>
                        {s.current && (
                          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-red-300">
                            This device
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-slate-500">
                        <span className="text-slate-400 tabular-nums">{s.lastSeenIp || 'IP hidden'}</span>
                        <span aria-hidden>·</span>
                        <span>Active {timeAgo((s.lastSeenAt || 0) * 1000)}</span>
                        <span aria-hidden className="hidden sm:inline">·</span>
                        <span aria-hidden className="hidden sm:inline">Signed in {shortDate(s.createdAt)}</span>
                      </div>
                    </div>

                    {!s.current && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(s.id)}
                        disabled={isBusy || busyAll}
                        aria-label={`Revoke ${info.label} session`}
                        className="h-8 shrink-0 border-white/10 text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/25"
                      >
                        {isBusy ? (
                          <Loader2 size={12} className="mr-1.5 animate-spin" />
                        ) : (
                          <LogOut size={12} className="mr-1.5" />
                        )}
                        Revoke
                      </Button>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {ordered.length === 0 && (
              <p className="text-sm text-slate-500 bg-white/[0.02] border border-white/[0.05] rounded-lg p-6 text-center mt-2">
                No active sessions found.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
