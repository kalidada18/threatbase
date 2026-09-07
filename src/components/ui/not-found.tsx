import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { Radar, ArrowLeft, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

interface NotFoundProps {
  className?: string
  cta?: string
  description?: string
  href?: string
  title?: string
  /** Large brushed-metal status numeral. Defaults to "404"; pass "403" etc. */
  code?: string
}

/**
 * Flagship status screen in the house cold-luxury language: brushed-metal
 * numerals, a ruby radar medallion, and glass CTAs. Defaults to a 404 but the
 * `code`/`title`/`description` props let it render any status (e.g. a 403
 * access-denied page). Motion collapses under reduced-motion.
 */
export default function NotFound({
  title = "No trace on record.",
  description = "This page isn't in our index. It may have moved or been removed.",
  cta = "Return home",
  href = "/",
  code = "404",
  className,
}: NotFoundProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <main
      className={cn(
        "relative min-h-[100dvh] bg-app flex items-center justify-center px-6 py-28 font-sans overflow-hidden",
        className,
      )}
    >
      {/* Ambient ruby top-glow over the global grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(207,23,51,0.12), transparent 60%)",
        }}
      />

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex max-w-xl flex-col items-center text-center"
      >
        {/* Radar medallion with searching pulse rings */}
        <div className="relative mb-10 flex items-center justify-center">
          {!prefersReducedMotion && (
            <>
              <span className="absolute h-20 w-20 rounded-full border border-red-500/20 animate-pulse-ring" />
              <span className="absolute h-20 w-20 rounded-full border border-red-500/10 animate-pulse-ring [animation-delay:1.2s]" />
            </>
          )}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-red-500/25 bg-red-500/[0.08] shadow-glow-ruby">
            <Radar className="h-8 w-8 text-red-400" strokeWidth={1.6} />
          </div>
        </div>

        {/* Brushed-metal status code */}
        <div className="text-7xl md:text-8xl font-extralight tracking-tighter text-metal leading-none tabular-nums">
          {code}
        </div>

        <h1 className="mt-6 text-2xl md:text-3xl font-bold tracking-tight text-white">
          {title}
        </h1>

        <p className="mt-4 max-w-md text-sm md:text-base leading-relaxed text-slate-400">
          {description}
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            to={href}
            className="group inline-flex items-center gap-2 rounded-2xl bg-red-600 px-7 py-3 text-sm font-semibold text-white shadow-glow-ruby transition-all hover:bg-red-500"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            {cta}
          </Link>
          <Link
            to="/report"
            className="inline-flex items-center gap-2 rounded-2xl border border-platinum-400/20 bg-white/[0.03] px-7 py-3 text-sm font-semibold text-platinum-300 backdrop-blur-md transition-all hover:border-platinum-400/40 hover:bg-white/[0.06] hover:text-white"
          >
            <ShieldAlert className="h-4 w-4" />
            Report a Threat
          </Link>
        </div>
      </motion.div>
    </main>
  )
}
