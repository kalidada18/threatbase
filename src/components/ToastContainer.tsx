import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ToastContainer({ toasts }: any) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t: any) => (
          <Toast key={t.id} message={t.message} type={t.type} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function Toast({ message, type }: any) {
  const Icon = type === 'success' ? CheckCircle : AlertCircle

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${
        type === 'success' 
          ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400' 
          : 'bg-destructive/10 border-destructive/20 text-destructive'
      }`}
    >
      <Icon size={18} />
      <span className="text-sm font-medium">{message}</span>
    </motion.div>
  )
}
