"use client"

import * as React from "react"
import { ShieldCheck } from "lucide-react"
import { useAuth } from "../../AuthContext"

const SignIn1 = () => {
  const { signInWithGoogle } = useAuth()

  return (
    <div className="flex flex-col items-center justify-center w-full relative overflow-hidden py-10">
      {/* Centered glass card */}
      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 backdrop-blur-md shadow-2xl p-8 flex flex-col items-center">
        {/* Logo */}
        <div className="flex items-center justify-center w-24 h-24 rounded-full mb-6 shadow-2xl border-2 border-white/10 bg-black overflow-hidden">
          <img src={`${import.meta.env.BASE_URL}img/threatbase.png`} alt="ThreatBase Logo" className="w-full h-full object-cover scale-110" />
        </div>
        
        {/* Title */}
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2 text-center">
          ThreatBase Intel
        </h2>
        <p className="text-sm text-slate-400 text-center mb-8">
          Join the intel network to report and track malicious indicators.
        </p>

        {/* Form */}
        <div className="flex flex-col w-full gap-4">
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white text-black rounded-xl px-5 py-3.5 font-bold shadow-lg hover:bg-slate-200 transition-all text-sm group"
          >
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
          
          <div className="w-full text-center mt-4">
            <span className="text-xs text-slate-500 font-medium">
              By joining, you agree to our Community Policy.
            </span>
          </div>
        </div>
      </div>

      {/* User count and avatars */}
      <div className="relative z-10 mt-12 flex flex-col items-center text-center">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Join <span className="text-white">thousands</span> of elite defenders
        </p>
        <div className="flex -space-x-3">
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80"
            alt="Defender"
            className="w-9 h-9 rounded-full border-2 border-[#0B0F19] object-cover"
          />
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80"
            alt="Defender"
            className="w-9 h-9 rounded-full border-2 border-[#0B0F19] object-cover"
          />
          <img
            src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&q=80"
            alt="Defender"
            className="w-9 h-9 rounded-full border-2 border-[#0B0F19] object-cover"
          />
          <img
            src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&q=80"
            alt="Defender"
            className="w-9 h-9 rounded-full border-2 border-[#0B0F19] object-cover"
          />
        </div>
      </div>
    </div>
  )
}

export { SignIn1 }
