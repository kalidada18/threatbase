import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'

export default function ToastContainer({ toasts }) {
  return (
    <div id="toast-container" className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} />
      ))}
    </div>
  )
}

function Toast({ message, type }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 3650)
    return () => clearTimeout(timer)
  }, [])

  const Icon = type === 'success' ? CheckCircle : AlertCircle

  return (
    <div className={`toast toast-${type}${exiting ? ' toast-exit' : ''}`}>
      <Icon size={18} />
      <span>{message}</span>
    </div>
  )
}
