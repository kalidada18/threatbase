import { useEffect } from 'react'

/**
 * Inertial smooth scrolling (the "weighted" feel on Linear/Vercel-tier sites).
 * - Honors prefers-reduced-motion: Lenis is never installed (or even loaded).
 * - `anchors: true` keeps /threatfeed#stats and /threatfeed#feeds hash links gliding.
 * - `tb:route-scroll` is how the rest of the app asks for a programmatic scroll:
 *   `{scrollTo: 'top'}` on route change, or `{scrollTo: element, offset}` to
 *   glide to a node. Dispatch it cancelable and fall back to native
 *   scrollIntoView if it is not claimed here (reduced motion, chunk unloaded).
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
        // 1.1s felt like input lag — the page trailed the wheel for over a
        // second. 0.7 keeps the weighted, inertial character while staying
        // responsive enough that scroll reads as instant.
        duration: 0.7,
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
      if (!lenis) return
      if (detail?.scrollTo === 'top') {
        lenis.scrollTo(0, { immediate: true })
        return
      }
      if (detail?.scrollTo instanceof Element) {
        // Claim the scroll. Lenis drives window.scrollTo from its own RAF loop,
        // so a native smooth scrollIntoView running at the same time gets
        // overwritten every frame and the page barely moves. The dispatcher
        // falls back to native only when nobody calls preventDefault.
        e.preventDefault()
        lenis.scrollTo(detail.scrollTo, { offset: detail.offset ?? 0 })
      }
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
