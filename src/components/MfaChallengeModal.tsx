import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, AlertCircle, LogOut, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuth } from '../AuthContext'
import supabaseClient from '../supabaseClient'
import { pickVerifiedTotpFactor } from '../lib/mfaFactor'
import { withTimeout } from '../lib/withTimeout'

const CODE_LEN = 6

export default function MfaChallengeModal() {
  const { requiresMfa, mfaVerified, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''))
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const cellsRef = useRef<Array<HTMLInputElement | null>>(Array(CODE_LEN).fill(null))
  const panelRef = useRef<HTMLDivElement>(null)

  const otp = digits.join('')

  const focusCell = (i: number) => {
    const el = cellsRef.current[Math.max(0, Math.min(CODE_LEN - 1, i))]
    if (el) {
      el.focus()
      el.select()
    }
  }

  // This dialog is a required gate: it cannot be dismissed, so keep Tab
  // cycling through its focusable nodes instead of leaking into the app.
  useEffect(() => {
    if (!requiresMfa) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = panelRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [requiresMfa])

  useEffect(() => {
    if (requiresMfa) {
      setDigits(Array(CODE_LEN).fill(''))
      setError(null)
      initiateChallenge()
      const t = setTimeout(() => focusCell(0), 300)
      return () => clearTimeout(t)
    }
  }, [requiresMfa])

  const initiateChallenge = async () => {
    if (!supabaseClient) return
    setLoading(true)
    setError(null)
    try {
      const { data: factors, error: factorsError } = await withTimeout(
        supabaseClient.auth.mfa.listFactors(),
        15_000,
        'Loading your two-factor methods',
      )
      if (factorsError) throw factorsError

      // The verified factor, not totp[0]: an abandoned setup leaves an
      // unverified row behind, and challenging that one fails every code the
      // user types — a permanent lockout from 2FA-protected sign-in.
      const totpFactor = pickVerifiedTotpFactor(factors?.totp)
      if (!totpFactor) {
        throw new Error('No verified two-factor method found on this account.')
      }

      setFactorId(totpFactor.id)

      const { data: challenge, error: challengeError } = await withTimeout(
        supabaseClient.auth.mfa.challenge({ factorId: totpFactor.id }),
        15_000,
        'Preparing the verification challenge',
      )
      if (challengeError) throw challengeError

      setChallengeId(challenge.id)
    } catch (err: any) {
      console.error('MFA Challenge initialization error:', err)
      setError(err.message || 'Failed to initialize MFA challenge.')
    } finally {
      setLoading(false)
    }
  }

  const runVerify = async (code: string) => {
    if (!supabaseClient || !factorId || !challengeId || loading) return
    if (code.replace(/\D/g, '').length < CODE_LEN) {
      setError('Enter all six digits of your code.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { error } = await withTimeout(
        supabaseClient.auth.mfa.verify({ factorId, challengeId, code }),
        20_000,
        'Verifying the code',
      )
      if (error) throw error

      // Successfully verified
      mfaVerified()
    } catch (err: any) {
      console.error('MFA Verification error:', err)
      setError(err.message || 'Invalid verification code.')
      setDigits(Array(CODE_LEN).fill(''))
      setTimeout(() => focusCell(0), 50)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    runVerify(otp)
  }

  const handleChange = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = d
    setDigits(next)
    if (d && i < CODE_LEN - 1) focusCell(i + 1)
    // A complete code submits itself — no need to hunt for the button.
    if (next.every(Boolean)) runVerify(next.join(''))
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      focusCell(i - 1)
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      focusCell(i - 1)
    } else if (e.key === 'ArrowRight' && i < CODE_LEN - 1) {
      e.preventDefault()
      focusCell(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LEN)
    if (!text) return
    const next = Array(CODE_LEN).fill('')
    text.split('').forEach((c, idx) => (next[idx] = c))
    setDigits(next)
    focusCell(Math.min(text.length, CODE_LEN - 1))
    if (text.length === CODE_LEN) runVerify(next.join(''))
  }

  if (!requiresMfa) return null

  const filled = digits.filter(Boolean).length

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Ambient: near-black wash with a single ruby bloom behind the card. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-[#050505]/95 backdrop-blur-md"
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-[120px]" />

        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mfa-title"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-app p-8 text-center shadow-glass-lux sm:p-10"
        >
          {/* Ruby hairline across the top edge. */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-red-500/15 blur-3xl" />

          {/* Logo lockup with a verified-shield badge. */}
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-red-500/25 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-red-500/25 shadow-[0_0_22px_rgba(207,23,51,0.28)]">
              <img
                src={`${import.meta.env.BASE_URL}img/logo.png`}
                alt="Threatbase logo"
                className="h-full w-full object-cover"
              />
            </div>
            <span className="icon-chip absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-red-500/30 bg-[#0a0a0c]">
              <ShieldCheck size={13} strokeWidth={2.25} />
            </span>
          </div>

          <div className="eyebrow mt-6">Secure sign-in</div>
          <h2 id="mfa-title" className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-[1.7rem]">
            Two-factor authentication
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
            Enter the 6-digit code from your authenticator app to finish signing in.
          </p>

          <form onSubmit={handleVerify} className="mt-7 text-left">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-platinum-400">
                Authenticator code
              </span>
              <span className="font-mono text-[11px] tabular-nums text-slate-500">{filled}/{CODE_LEN}</span>
            </div>

            <div role="group" aria-label="6-digit authenticator code" aria-describedby={error ? 'mfa-error' : undefined} className="flex gap-2 sm:gap-2.5">
              {Array.from({ length: CODE_LEN }).map((_, i) => {
                const active = digits[i] !== ''
                return (
                  <input
                    key={i}
                    ref={(el) => {
                      cellsRef.current[i] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digits[i]}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    aria-label={`Digit ${i + 1} of ${CODE_LEN}`}
                    disabled={loading || !challengeId}
                    className={`h-14 flex-1 rounded-xl border bg-black/40 text-center font-mono text-xl text-white transition-all duration-200 focus:outline-none disabled:opacity-50 ${
                      active
                        ? 'border-red-500/40 bg-red-500/[0.06] shadow-[inset_0_0_0_1px_rgba(207,23,51,0.15)]'
                        : 'border-white/10'
                    } focus:border-red-500/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-red-500/25`}
                  />
                )
              })}
            </div>

            {/* The challenge fetch can time out while the user is ready to type.
                Without this the input stays disabled forever and the only way
                out is Sign Out — a login dead-end. */}
            {(error || (!challengeId && !loading)) && (
              <button
                type="button"
                onClick={initiateChallenge}
                disabled={loading}
                className="mt-3 text-xs font-semibold text-slate-300 underline underline-offset-4 transition-colors hover:text-white disabled:opacity-50"
              >
                Retry verification challenge
              </button>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  id="mfa-error"
                  role="alert"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0, x: [0, -9, 8, -6, 5, -2, 0] }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.42, ease: 'easeOut' }}
                  className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-sm text-red-300"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading || !challengeId || otp.length < CODE_LEN}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold tracking-wide text-white shadow-glow-ruby transition-all duration-200 hover:bg-red-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  Verify code
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-white/[0.06] pt-5">
            <button
              onClick={async () => {
                if (signingOut) return
                setSigningOut(true)
                try {
                  // Local only: dismissing the prompt must not revoke the
                  // user's sessions on every other device (global was the
                  // re-login loop).
                  await signOut({ scope: 'local' })
                } catch {
                  setSigningOut(false)
                }
              }}
              disabled={signingOut}
              className="mx-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-red-300 disabled:opacity-50"
            >
              <LogOut size={13} />
              {signingOut ? 'Signing out…' : 'Sign out instead'}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              One-time codes refresh every 30 seconds. Threatbase never sees your authenticator secret.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
