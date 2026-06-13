import React from 'react'
import { motion } from 'framer-motion'
import { Turnstile } from '@marsidev/react-turnstile'
import { ShieldBan } from 'lucide-react'

interface InitialVerificationProps {
  onSuccess: (token: string) => void
  siteKey?: string
}

export default function InitialVerification({ onSuccess, siteKey = '0x4AAAAAADj2T6kY9_5dXRhs' }: InitialVerificationProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black font-sans">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-3xl px-6 md:px-12 flex flex-col items-start"
      >
        <div className="flex items-center gap-3 mb-4">
          <img src={`${import.meta.env.BASE_URL}img/threatbase.png`} alt="Threatbase Logo" className="w-8 h-8 object-contain shrink-0" />
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Threatbase Intel</h1>
        </div>
        
        <h2 className="text-lg md:text-xl font-medium text-slate-100 mb-2">Performing security verification</h2>
        
        <p className="text-sm md:text-base text-slate-400 max-w-2xl mb-8 leading-relaxed">
          This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.
        </p>

        <div className="w-full max-w-sm">
          <div className="overflow-hidden rounded-sm border border-[#333] bg-[#222] inline-block shadow-lg">
            <Turnstile
              siteKey={siteKey}
              onSuccess={(token) => {
                setTimeout(() => onSuccess(token), 300)
              }}
              options={{
                theme: 'dark',
                size: 'normal'
              }}
            />
          </div>
        </div>

        <div className="mt-32 w-full border-t border-[#333] pt-6 text-center">
          <p className="text-[#888] text-xs">
            Ray ID: {Math.random().toString(36).substring(2, 15)}<br />
            Performance and Security by <span className="text-slate-300">Cloudflare</span> | Privacy
          </p>
        </div>
      </motion.div>
    </div>
  )
}
