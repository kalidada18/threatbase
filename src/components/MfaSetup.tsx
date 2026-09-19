import React, { useState, useEffect } from 'react'
import { Shield, ShieldAlert, Loader2, KeyRound, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pickVerifiedTotpFactor } from '@/lib/mfaFactor'
import { withTimeout } from '@/lib/withTimeout'
import {
  listTotpFactors,
  enrollTotp,
  challengeFactor,
  verifyFactor,
  unenrollFactor,
} from '@/lib/mfa'

/**
 * Normalize Supabase's `totp.qr_code` to an `<img src>` value.
 *
 * auth-js `_enroll` already prepends `data:image/svg+xml;utf-8,` to the raw
 * SVG, and the official docs render it via `<Image src={qr_code}>`. Older
 * payloads (or a future SDK that stops prepending) may still be raw `<svg>`
 * markup — encode those into a data URI instead of injecting HTML.
 */
export function toQrImgSrc(qrCode: string): string {
  if (qrCode.startsWith('data:image')) return qrCode
  if (qrCode.trimStart().startsWith('<')) return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`
  return `data:image/svg+xml;utf-8,${qrCode}`
}

export default function MfaSetup({ addToast }: { addToast: (msg: string, type: 'success'|'error') => void }) {
  const [loading, setLoading] = useState(true)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  
  // Setup flow state
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [otp, setOtp] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [unenrolling, setUnenrolling] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  // Disabling 2FA needs an aal2 session: GoTrue refuses to unenroll the last
  // verified factor from a password/OAuth-only (aal1) login and answers
  // `insufficient_aal`. When the first attempt comes back `aal_required` we
  // challenge the existing factor and ask for a current code inline; verifying
  // rotates the cookie session up to aal2 (the /verify endpoint re-mints the
  // server session row), and the retry then succeeds. Without this the button
  // dead-ends on "verify your two-factor code" with no way to actually verify.
  const [disableNeedsCode, setDisableNeedsCode] = useState(false)
  const [disableOtp, setDisableOtp] = useState('')
  const [disableChallengeId, setDisableChallengeId] = useState<string | null>(null)
  const [disableError, setDisableError] = useState<string | null>(null)
  const [disableVerifying, setDisableVerifying] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    setLoading(true)
    try {
      const factors = await withTimeout(
        listTotpFactors(),
        15_000,
        'Loading your authenticators',
      )
      
      // An account may carry several TOTP factors (e.g. stale unverified ones
      // from earlier setup attempts). Look for ANY verified factor rather than
      // just the first entry, otherwise a leftover unverified factor masks a
      // real, enabled one and the UI wrongly shows "Disabled".
      const verifiedFactor = pickVerifiedTotpFactor(factors)
      console.log('MFA factors check:', { factors, verifiedFactor })
      if (verifiedFactor) {
        setIsEnrolled(true)
        setFactorId(verifiedFactor.id)
        console.log('MFA is ENABLED, factorId:', verifiedFactor.id)
      } else {
        setIsEnrolled(false)
        setFactorId(null)
        console.log('MFA is DISABLED')
      }
    } catch (err) {
      console.error('Error fetching MFA factors:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStartSetup = async () => {
    setIsSettingUp(true)
    setLoading(true)
    // A challenge from a previous, cancelled attempt belongs to a factor the
    // cleanup below is about to delete — reusing it would fail verification.
    setChallengeId(null)
    setQrCodeSvg(null)
    setTotpSecret(null)
    setShowSecret(false)
    setCopiedSecret(false)
    // Tracked locally rather than read back from `qrCodeSvg` in the catch: that
    // state variable is captured from the render that created this handler, so
    // it is still null no matter what setQrCodeSvg was just called with.
    let enrolledFactorId: string | null = null
    try {
      // Clean up stale, unverified TOTP factors left behind by a previous
      // incomplete setup (QR shown but never verified). Otherwise enroll()
      // fails with: A factor with the friendly name "" for this user already
      // exists. Verified factors are left untouched.
      const existing = await withTimeout(
        listTotpFactors(),
        15_000,
        'Loading your existing authenticators',
      )
      const staleFactors = existing.filter((f) => f.status !== 'verified')
      for (const stale of staleFactors) {
        // The proxy client throws on failure (auth-js resolved with { error }
        // instead, and a swallowed failure here fell straight through to
        // enroll() — the baffling "A factor with the friendly name ... already
        // exists" (422 mfa_factor_name_conflict) this cleanup exists to prevent).
        await withTimeout(unenrollFactor(stale.id), 15_000, 'Removing an incomplete setup')
      }

      // 1. Enroll. The name is a human-readable label for the user's
      // authenticator app; uniqueness is guaranteed by the cleanup above, not
      // by this string (it is only accurate to the day). The issuer is fixed by
      // the proxy (and must not be a URL — slashes break the otpauth:// URI some
      // apps parse), so a compromised page cannot point the code at another
      // service.
      const enrollData = await withTimeout(
        enrollTotp(`Authenticator (${new Date().toISOString().slice(0, 10)})`),
        20_000,
        'Creating the authenticator',
      )

      enrolledFactorId = enrollData.id
      setFactorId(enrollData.id)
      setQrCodeSvg(enrollData.totp.qr_code)
      // Manual-entry fallback: Supabase's own guidance is to show the secret
      // when the QR can't be scanned (camera broken, SVG blocked, screen
      // reader). Never log this value.
      setTotpSecret(enrollData.totp.secret ?? null)

      // 2. Challenge. Best-effort on purpose: the QR is already on screen and
      // the user still has to open their app and type a code, so a challenge
      // that fails or stalls here must not take the panel down with it. It
      // used to — the throw below fell into the catch, which closed the setup
      // panel and discarded a perfectly good QR, showing the user nothing at
      // all. handleVerifySetup creates one on submit if this did not land.
      try {
        const challengeData = await withTimeout(
          challengeFactor(enrollData.id),
          15_000,
          'Preparing the verification challenge',
        )
        setChallengeId(challengeData.id)
      } catch (challengeErr: any) {
        console.warn('MFA challenge pre-fetch failed; retrying on submit:', challengeErr)
      }

    } catch (err: any) {
      console.error('MFA Setup initialization error:', err)
      addToast(err.message || 'Failed to initialize MFA setup.', 'error')
      // Unwind only when there is nothing to show: before enrollment succeeds
      // there is no QR, but after it there is, and it cannot be recovered.
      if (!enrolledFactorId) setIsSettingUp(false)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return

    if (otp.length < 6) {
      setVerifyError('Please enter a 6-digit code')
      return
    }

    setVerifying(true)
    setVerifyError(null)
    try {
      // The pre-fetch in handleStartSetup is an optimization, not a
      // prerequisite — it may have failed or timed out while the QR was
      // already on screen. Mint one here instead of leaving Verify dead.
      let activeChallengeId = challengeId
      if (!activeChallengeId) {
        const data = await withTimeout(
          challengeFactor(factorId),
          15_000,
          'Preparing the verification challenge',
        )
        activeChallengeId = data.id
        setChallengeId(activeChallengeId)
      }

      await withTimeout(
        verifyFactor(factorId, activeChallengeId, otp),
        20_000,
        'Verifying the code',
      )

      addToast('Two-Factor Authentication successfully enabled!', 'success')
      setIsEnrolled(true)
      setIsSettingUp(false)
      setOtp('')
      setQrCodeSvg(null)
      setTotpSecret(null)
      setShowSecret(false)
    } catch (err: any) {
      console.error('MFA Verification error:', err)
      setVerifyError(err.message || 'Invalid code.')
    } finally {
      setVerifying(false)
    }
  }

  const resetDisableVerify = () => {
    setDisableNeedsCode(false)
    setDisableOtp('')
    setDisableChallengeId(null)
    setDisableError(null)
  }

  // Mint a challenge for the already-verified factor so the user can authorize
  // the disable with a current code (mirrors the login MFA gate's challenge).
  const startDisableChallenge = async () => {
    if (!factorId) return
    setDisableNeedsCode(true)
    setDisableOtp('')
    setDisableError(null)
    setDisableChallengeId(null)
    try {
      const challenge = await withTimeout(
        challengeFactor(factorId),
        15_000,
        'Preparing the verification challenge',
      )
      setDisableChallengeId(challenge.id)
    } catch (err: any) {
      console.error('MFA disable challenge error:', err)
      setDisableError(err.message || 'Could not start verification. Try again.')
    }
  }

  const handleUnenroll = async () => {
    if (!factorId) return

    setUnenrolling(true)
    try {
      await withTimeout(
        unenrollFactor(factorId),
        15_000,
        'Disabling two-factor authentication',
      )

      addToast('Two-Factor Authentication disabled.', 'success')
      setIsEnrolled(false)
      setFactorId(null)
      setConfirmDisable(false)
      resetDisableVerify()
    } catch (err: any) {
      console.error('MFA Unenroll error:', err)
      if (err?.aal_required) {
        // Session is aal1. Ask for a code to clear a second factor, then the
        // retry in handleConfirmDisableWithCode passes GoTrue's AAL2 gate.
        await startDisableChallenge()
      } else {
        addToast(err.message || 'Failed to disable MFA.', 'error')
      }
    } finally {
      setUnenrolling(false)
    }
  }

  const handleConfirmDisableWithCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    if (disableOtp.length < 6) {
      setDisableError('Enter the 6-digit code from your app.')
      return
    }

    setDisableVerifying(true)
    setDisableError(null)
    try {
      // Re-mint if the earlier challenge failed or aged out.
      let activeChallengeId = disableChallengeId
      if (!activeChallengeId) {
        const data = await withTimeout(
          challengeFactor(factorId),
          15_000,
          'Preparing the verification challenge',
        )
        activeChallengeId = data.id
        setDisableChallengeId(activeChallengeId)
      }

      // Verify rotates the server session to aal2 (fresh Set-Cookie), which is
      // what unblocks the unenroll below.
      await withTimeout(
        verifyFactor(factorId, activeChallengeId, disableOtp),
        20_000,
        'Verifying the code',
      )

      await withTimeout(
        unenrollFactor(factorId),
        15_000,
        'Disabling two-factor authentication',
      )

      addToast('Two-Factor Authentication disabled.', 'success')
      setIsEnrolled(false)
      setFactorId(null)
      setConfirmDisable(false)
      resetDisableVerify()
    } catch (err: any) {
      console.error('MFA disable-with-code error:', err)
      setDisableError(err.message || 'Invalid code.')
      setDisableOtp('')
    } finally {
      setDisableVerifying(false)
    }
  }

  if (loading && !isSettingUp && !unenrolling) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500">
        <Loader2 className="animate-spin" size={20} />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/40 p-6 md:p-8 mt-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound size={16} className="text-red-400" />
            Two-Factor Authentication
          </h3>
          <p className="text-xs text-slate-400 max-w-md">
            Add an extra layer of security to your account by requiring an authentication code when you log in.
          </p>
        </div>
        
        {!isSettingUp && (
          <div>
            <span className="hidden text-xs">MFA Enrolled State: {isEnrolled ? 'ENABLED' : 'DISABLED'}</span>
            {isEnrolled ? (
              confirmDisable ? (
                disableNeedsCode ? (
                  <form onSubmit={handleConfirmDisableWithCode} className="flex flex-col items-end gap-2">
                    <span className="text-xs text-slate-300">Enter your current 2FA code to confirm disabling</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={disableOtp}
                        onChange={(e) => { setDisableOtp(e.target.value.replace(/[^0-9]/g, '')); setDisableError(null) }}
                        placeholder="000000"
                        aria-label="6-digit code to authorize disabling two-factor authentication"
                        aria-invalid={!!disableError}
                        className="h-9 w-32 rounded-lg border border-white/10 bg-black/50 px-3 text-center text-base tracking-[0.3em] text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500/50 transition-colors font-mono"
                        disabled={disableVerifying}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={disableVerifying || disableOtp.length < 6}
                        className="bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                      >
                        {disableVerifying ? 'Verifying...' : 'Confirm'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => { setConfirmDisable(false); resetDisableVerify() }}
                        disabled={disableVerifying}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </Button>
                    </div>
                    {disableError && (
                      <span className="text-[11px] font-medium text-red-400">{disableError}</span>
                    )}
                  </form>
                ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-300">Disable 2FA? Your account will be less secure.</span>
                  <Button
                    size="sm"
                    onClick={handleUnenroll}
                    disabled={unenrolling}
                    className="bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                  >
                    {unenrolling ? 'Disabling...' : 'Confirm'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setConfirmDisable(false); resetDisableVerify() }}
                    disabled={unenrolling}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </Button>
                </div>
                )
              ) : (
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                    <Shield size={14} /> Enabled
                  </span>
                  <Button
                    onClick={() => { resetDisableVerify(); setConfirmDisable(true) }}
                    variant="outline"
                    className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-red-300 rounded text-xs px-4"
                    disabled={unenrolling}
                  >
                    Disable
                  </Button>
                </div>
              )
            ) : (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-500/10 px-3 py-1 rounded-full border border-slate-500/20">
                  <ShieldAlert size={14} /> Disabled
                </span>
                <Button
                  onClick={handleStartSetup}
                  variant="outline"
                  className="border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded text-xs px-4"
                >
                  Set Up 2FA
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {isSettingUp && (
        <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center">
          <p className="text-sm text-slate-300 font-semibold mb-4 text-center">
            Scan this QR code with your authenticator app
          </p>
          
          {/* The QR is valid the moment enroll returns — even while the
              challenge pre-fetch is still in flight (up to 15s). Render from
              the SVG the instant it lands; never gate it on `loading`. */}
          {qrCodeSvg ? (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-4 rounded-xl border-4 border-red-500/20">
                <img
                  src={toQrImgSrc(qrCodeSvg)}
                  alt="Scan this QR code with your authenticator app to enable two-factor authentication"
                  className="w-48 h-48 block"
                />
              </div>
              {totpSecret && (
                <div className="w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="text-[11px] font-semibold text-slate-400 hover:text-white transition-colors"
                    aria-expanded={showSecret}
                  >
                    {showSecret ? 'Hide manual entry key' : "Can't scan the code?"}
                  </button>
                  {showSecret && (
                    <div className="mt-2 flex items-center gap-2 bg-black/50 border border-white/10 p-2 rounded-lg">
                      <code
                        className="text-xs text-slate-200 font-mono flex-1 select-all break-all"
                        aria-label="Manual entry key for your authenticator app"
                      >
                        {totpSecret}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(totpSecret)
                            setCopiedSecret(true)
                            setTimeout(() => setCopiedSecret(false), 2000)
                          } catch {
                            addToast('Copy failed — select the key manually.', 'error')
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors shrink-0"
                        title="Copy manual entry key"
                        aria-label="Copy manual entry key"
                      >
                        {copiedSecret ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-48 h-48 bg-white/5 rounded-xl flex items-center justify-center animate-pulse"
              role="status"
              aria-label="Generating your authenticator QR code"
            >
              <Loader2 className="animate-spin text-slate-500" size={24} />
            </div>
          )}

          <form onSubmit={handleVerifySetup} className="mt-8 w-full max-w-xs space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 text-center block">
                Enter the 6-digit code generated by the app
              </label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/[^0-9]/g, '')); setVerifyError(null) }}
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
                aria-invalid={!!verifyError}
                aria-describedby={verifyError ? 'mfa-setup-otp-error' : undefined}
                className="w-full h-12 rounded-xl border border-white/10 bg-black/50 px-4 text-center text-xl tracking-[0.5em] text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500/50 transition-colors font-mono"
                disabled={verifying}
              />
              {verifyError && (
                <p id="mfa-setup-otp-error" className="text-[11px] font-medium text-red-400 text-center">{verifyError}</p>
              )}
            </div>
            
            <div className="flex gap-3">
              <Button 
                type="submit"
                disabled={verifying || otp.length < 6 || !qrCodeSvg}
                title={!qrCodeSvg ? 'Wait for the QR code to appear first' : undefined}
                className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify & Enable'}
              </Button>
              <Button 
                type="button"
                onClick={() => {
                  setIsSettingUp(false)
                  setChallengeId(null)
                  setQrCodeSvg(null)
                  setTotpSecret(null)
                  setShowSecret(false)
                  setCopiedSecret(false)
                  setOtp('')
                  setVerifyError(null)
                }}
                disabled={verifying}
                className="flex-1 h-10 rounded-xl bg-transparent border border-white/10 hover:bg-white/5 text-white text-xs font-semibold transition-colors"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
