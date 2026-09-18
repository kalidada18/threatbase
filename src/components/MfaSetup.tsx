import React, { useState, useEffect } from 'react'
import supabaseClient from '../supabaseClient'
import { Shield, ShieldAlert, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pickVerifiedTotpFactor } from '@/lib/mfaFactor'
import { withTimeout } from '@/lib/withTimeout'

export default function MfaSetup({ addToast }: { addToast: (msg: string, type: 'success'|'error') => void }) {
  const [loading, setLoading] = useState(true)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  
  // Setup flow state
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [unenrolling, setUnenrolling] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await withTimeout(
        supabaseClient.auth.mfa.listFactors(),
        15_000,
        'Loading your authenticators',
      )
      if (error) throw error
      
      // An account may carry several TOTP factors (e.g. stale unverified ones
      // from earlier setup attempts). Look for ANY verified factor rather than
      // just the first entry, otherwise a leftover unverified factor masks a
      // real, enabled one and the UI wrongly shows "Disabled".
      const verifiedFactor = pickVerifiedTotpFactor(data?.totp)
      if (verifiedFactor) {
        setIsEnrolled(true)
        setFactorId(verifiedFactor.id)
      } else {
        setIsEnrolled(false)
        setFactorId(null)
      }
    } catch (err) {
      console.error('Error fetching MFA factors:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStartSetup = async () => {
    if (!supabaseClient) return
    setIsSettingUp(true)
    setLoading(true)
    // A challenge from a previous, cancelled attempt belongs to a factor the
    // cleanup below is about to delete — reusing it would fail verification.
    setChallengeId(null)
    setQrCodeSvg(null)
    // Tracked locally rather than read back from `qrCodeSvg` in the catch: that
    // state variable is captured from the render that created this handler, so
    // it is still null no matter what setQrCodeSvg was just called with.
    let enrolledFactorId: string | null = null
    try {
      // Clean up stale, unverified TOTP factors left behind by a previous
      // incomplete setup (QR shown but never verified). Otherwise enroll()
      // fails with: A factor with the friendly name "" for this user already
      // exists. Verified factors are left untouched.
      const { data: existing } = await withTimeout(
        supabaseClient.auth.mfa.listFactors(),
        15_000,
        'Loading your existing authenticators',
      )
      const staleFactors = (existing?.totp || []).filter((f) => f.status !== 'verified')
      for (const stale of staleFactors) {
        // auth-js resolves with { error } rather than throwing, so a bare
        // `await` here swallowed every failure and fell straight through to
        // enroll() — which then failed with the baffling "A factor with the
        // friendly name ... already exists" (422 mfa_factor_name_conflict)
        // that this cleanup exists to prevent.
        const { error: unenrollError } = await withTimeout(
          supabaseClient.auth.mfa.unenroll({ factorId: stale.id }),
          15_000,
          'Removing an incomplete setup',
        )
        if (unenrollError) throw unenrollError
      }

      // 1. Enroll. The name is a human-readable label for the user's
      // authenticator app; uniqueness is guaranteed by the cleanup above, not
      // by this string (it is only accurate to the day).
      const { data: enrollData, error: enrollError } = await withTimeout(
        supabaseClient.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `Authenticator (${new Date().toISOString().slice(0, 10)})`,
          issuer: 'https://threatbase.qzz.io/'
        }),
        20_000,
        'Creating the authenticator',
      )

      if (enrollError) throw enrollError

      enrolledFactorId = enrollData.id
      setFactorId(enrollData.id)
      setQrCodeSvg(enrollData.totp.qr_code)

      // 2. Challenge. Best-effort on purpose: the QR is already on screen and
      // the user still has to open their app and type a code, so a challenge
      // that fails or stalls here must not take the panel down with it. It
      // used to — the throw below fell into the catch, which closed the setup
      // panel and discarded a perfectly good QR, showing the user nothing at
      // all. handleVerifySetup creates one on submit if this did not land.
      try {
        const { data: challengeData, error: challengeError } = await withTimeout(
          supabaseClient.auth.mfa.challenge({ factorId: enrollData.id }),
          15_000,
          'Preparing the verification challenge',
        )
        if (challengeError) throw challengeError
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
    if (!supabaseClient || !factorId) return

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
        const { data, error } = await withTimeout(
          supabaseClient.auth.mfa.challenge({ factorId }),
          15_000,
          'Preparing the verification challenge',
        )
        if (error) throw error
        activeChallengeId = data.id
        setChallengeId(activeChallengeId)
      }

      const { error } = await withTimeout(
        supabaseClient.auth.mfa.verify({ factorId, challengeId: activeChallengeId, code: otp }),
        20_000,
        'Verifying the code',
      )

      if (error) throw error

      addToast('Two-Factor Authentication successfully enabled!', 'success')
      setIsEnrolled(true)
      setIsSettingUp(false)
      setOtp('')
    } catch (err: any) {
      console.error('MFA Verification error:', err)
      setVerifyError(err.message || 'Invalid code.')
    } finally {
      setVerifying(false)
    }
  }

  const handleUnenroll = async () => {
    if (!supabaseClient || !factorId) return

    setUnenrolling(true)
    try {
      const { error } = await withTimeout(
        supabaseClient.auth.mfa.unenroll({ factorId }),
        15_000,
        'Disabling two-factor authentication',
      )
      if (error) throw error

      addToast('Two-Factor Authentication disabled.', 'success')
      setIsEnrolled(false)
      setFactorId(null)
      setConfirmDisable(false)
    } catch (err: any) {
      console.error('MFA Unenroll error:', err)
      addToast(err.message || 'Failed to disable MFA.', 'error')
    } finally {
      setUnenrolling(false)
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
            {isEnrolled ? (
              confirmDisable ? (
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
                    onClick={() => setConfirmDisable(false)}
                    disabled={unenrolling}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                    <Shield size={14} /> Enabled
                  </span>
                  <Button
                    onClick={() => setConfirmDisable(true)}
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
          
          {/* Keyed on the QR, not on `loading`: the challenge pre-fetch can
              take up to 15s, and the QR is valid the moment enroll returns.
              Hiding a working QR behind that spinner is the whole bug. */}
          {qrCodeSvg ? (
            // Safe: qrCodeSvg is the TOTP QR returned by Supabase Auth's MFA
            // enroll API (first-party, trusted), never user-supplied input.
            <div
              className="bg-white p-4 rounded-xl border-4 border-red-500/20"
              dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
            />
          ) : (
            <div className="w-48 h-48 bg-white/5 rounded-xl flex items-center justify-center animate-pulse">
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
                disabled={verifying || otp.length < 6}
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
