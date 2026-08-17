import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Loader2, AlertCircle, LogOut } from 'lucide-react'
import { useAuth } from '../AuthContext'
import supabaseClient from '../supabaseClient'

export default function MfaChallengeModal() {
  const { requiresMfa, mfaVerified, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  
  // Reference to auto-focus the input
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (requiresMfa) {
      setOtp('')
      setError(null)
      initiateChallenge()
      setTimeout(() => {
        inputRef.current?.focus()
      }, 300)
    }
  }, [requiresMfa])

  const initiateChallenge = async () => {
    if (!supabaseClient) return
    setLoading(true)
    setError(null)
    try {
      const { data: factors, error: factorsError } = await supabaseClient.auth.mfa.listFactors()
      if (factorsError) throw factorsError
      
      const totpFactor = factors?.totp?.[0]
      if (!totpFactor) {
        throw new Error('No TOTP factor found.')
      }
      
      setFactorId(totpFactor.id)
      
      const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({ 
        factorId: totpFactor.id 
      })
      if (challengeError) throw challengeError
      
      setChallengeId(challenge.id)
    } catch (err: any) {
      console.error('MFA Challenge initialization error:', err)
      setError(err.message || 'Failed to initialize MFA challenge.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseClient || !factorId || !challengeId) return
    
    if (otp.length < 6) {
      setError('Code must be at least 6 characters.')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const { data, error } = await supabaseClient.auth.mfa.verify({
        factorId,
        challengeId,
        code: otp
      })
      
      if (error) throw error
      
      // Successfully verified
      mfaVerified()
    } catch (err: any) {
      console.error('MFA Verification error:', err)
      setError(err.message || 'Invalid verification code.')
    } finally {
      setLoading(false)
    }
  }

  if (!requiresMfa) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md rounded-2xl border border-white/10 bg-app p-8 shadow-2xl overflow-hidden"
        >
          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full border border-red-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(207,23,51,0.18)] overflow-hidden">
              <img 
                src={`${import.meta.env.BASE_URL}img/logo.png`} 
                alt="Threatbase Logo" 
                className="w-full h-full object-cover"
              />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white tracking-tight">Two-Factor Authentication</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your account is protected with 2FA. Please enter the 6-digit code from your authenticator app to continue.
              </p>
            </div>
            
            {error && (
              <div className="w-full flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-left">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <form onSubmit={handleVerify} className="w-full space-y-4">
              <input
                ref={inputRef}
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                className="w-full h-14 rounded-xl border border-white/10 bg-black/50 px-4 text-center text-2xl tracking-[0.5em] text-white placeholder:text-slate-700 focus:outline-none focus:border-red-500/50 focus:bg-white/5 transition-all font-mono"
                disabled={loading || !challengeId}
              />
              
              <button
                type="submit"
                disabled={loading || !challengeId || otp.length < 6}
                className="w-full h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Verify Code'}
              </button>
            </form>
            
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rose-400 transition-colors pt-2"
            >
              <LogOut size={14} />
              Sign Out Instead
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
