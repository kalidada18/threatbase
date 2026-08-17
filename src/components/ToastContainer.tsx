import { CheckCircle, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ToastContainer({ toasts }: any) {
  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col items-end gap-2"
      aria-live="polite"
    >
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
      className={`flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl sm:w-auto ${
        type === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-destructive/25 bg-destructive/10 text-red-300'
      }`}
    >
      <Icon size={18} className="mt-px shrink-0" />
      <span className="min-w-0 text-sm font-medium break-words">{message}</span>
    </motion.div>
  )
}
