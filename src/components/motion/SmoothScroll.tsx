import { useEffect } from 'react'

/**
 * Inertial smooth scrolling (the "weighted" feel on Linear/Vercel-tier sites).
 * - Honors prefers-reduced-motion: Lenis is never installed (or even loaded).
 * - `anchors: true` keeps /threatfeed#stats and /threatfeed#feeds hash links gliding.
 * - Existing scrollIntoView({behavior:'smooth'}) calls route through Lenis
 *   automatically because it drives the native scroll position.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let disposed = false
    let lenis: import('lenis').default | null = null
    let rafId = 0

    // Dynamic import keeps Lenis out of the eager main chunk.
    import('lenis').then(({ default: Lenis }) => {
      if (disposed) return
      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        anchors: true,
      })

      const raf = (time: number) => {
        lenis?.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)

      // Lazy route chunks + hash navigation reset scroll; route Lenis there too
      // so navigation doesn't land mid-scroll-position.
      window.addEventListener('tb:route-scroll', onRouteScroll)
    })

    const onRouteScroll = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.scrollTo === 'top') lenis?.scrollTo(0, { immediate: true })
    }

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('tb:route-scroll', onRouteScroll)
      lenis?.destroy()
    }
  }, [])

  return <>{children}</>
}
