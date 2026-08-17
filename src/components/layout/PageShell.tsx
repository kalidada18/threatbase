import { cn } from '@/lib/utils'

interface PageShellProps extends React.HTMLAttributes<HTMLElement> {
  /** Render the decorative grain overlay used by content subpages. */
  grain?: boolean
}

/**
 * Wrapper for routed subpages (not the homepage hero). Provides the base surface,
 * full viewport height, and the top offset that clears the fixed navbar.
 */
export default function PageShell({ grain = true, className, children, ...props }: PageShellProps) {
  return (
    <main className={cn('bg-app min-h-[100dvh]', className)} {...props}>
      <div className="relative overflow-hidden pt-28 pb-24 font-sans">
        {grain && (
          <div className="grain absolute inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none" />
        )}
        {children}
      </div>
    </main>
  )
}
