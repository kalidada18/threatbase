import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Turnstile } from '@marsidev/react-turnstile'
import { X } from 'lucide-react'

interface TurnstileModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (token: string) => void
  siteKey?: string
}

export default function TurnstileModal({ isOpen, onClose, onSuccess, siteKey = '1x00000000000000000000AA' }: TurnstileModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
              
              <div className="mb-6 mt-2 text-center">
                <h3 className="text-lg font-semibold text-white">Security Check</h3>
                <p className="mt-1 text-sm text-slate-400">Please verify you are human to proceed with the scan.</p>
              </div>

              <div className="flex justify-center">
                <Turnstile
                  siteKey={siteKey}
                  onSuccess={(token) => {
                    // Small delay for better UX
                    setTimeout(() => onSuccess(token), 500)
                  }}
                  options={{
                    theme: 'dark',
                    size: 'normal'
                  }}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
