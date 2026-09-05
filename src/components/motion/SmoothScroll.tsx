import { useEffect } from 'react'
import Lenis from 'lenis'

/**
 * Inertial smooth scrolling (the "weighted" feel on Linear/Vercel-tier sites).
 * - Honors prefers-reduced-motion: Lenis is never installed.
 * - `anchors: true` keeps /threatfeed#stats and /threatfeed#feeds hash links gliding.
 * - Existing scrollIntoView({behavior:'smooth'}) calls route through Lenis
 *   automatically because it drives the native scroll position.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      anchors: true,
    })

    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    // Lazy route chunks + hash navigation reset scroll; route Lenis there too
    // so navigation doesn't land mid-scroll-position.
    const onRouteScroll = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.scrollTo === 'top') lenis.scrollTo(0, { immediate: true })
    }
    window.addEventListener('tb:route-scroll', onRouteScroll)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('tb:route-scroll', onRouteScroll)
      lenis.destroy()
    }
  }, [])

  return <>{children}</>
}
