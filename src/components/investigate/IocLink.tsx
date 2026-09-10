import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/** Any IOC value becomes a pivot link into the investigation page.
 *  Lives in its own module so entry-point pages (Top APT, Hall of Shame,
 *  scanner) don't eagerly pull the dossier UI chunks into their bundles. */
export function IocLink({ type: _type, value, children, className = '' }: { type?: string; value: string; children?: ReactNode; className?: string }) {
  return (
    <Link
      to={`/investigate?q=${encodeURIComponent(value)}`}
      className={`font-mono text-[11px] text-slate-400 hover:text-red-200 transition-colors underline decoration-white/10 underline-offset-2 ${className}`}
    >
      {children ?? value}
    </Link>
  )
}
