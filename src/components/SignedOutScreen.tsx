import React from 'react'
import { motion } from 'framer-motion'
import { LogOut, ArrowRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '../AuthContext'
import { useSEO } from '../useSEO'

/**
 * The signed-out landing state.
 *
 * A deliberate sign-out (Navbar) and an account deletion (Profile) both route
 * here instead of the home page, so leaving the app reads like a real SSO
 * session ending: a clear "you are signed out" confirmation with the same
 * identity providers you came back through. Signing in again is a fresh OAuth
 * redirect — for a deleted account that resolves to a brand-new user (the
 * delete cascaded auth.identities), for a plain logout it returns the same one.
 *
 * The session is already gone by the time this renders: signOut() revoked the
 * server session row and cleared auth-js before navigating here. This component
 * is presentation only and never calls signOut itself.
 */
export default function SignedOutScreen() {
  const { signInWithGoogle, signInWithGithub } = useAuth()

  useSEO({
    title: 'Signed out | Threatbase',
    description: 'You have been signed out of Threatbase. Sign in again to return to your threat intelligence console.',
    path: '/signed-out',
    noindex: true,
  })

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-app px-6 py-24 text-center">
      {/* Ambient ruby bloom behind the card, matching the MFA gate's mood. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-[130px]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-app p-8 shadow-glass-lux sm:p-10"
      >
        {/* Ruby hairline across the top edge. */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />

        {/* Logo lockup with a sign-out badge. */}
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 rounded-full bg-red-500/25 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-red-500/25 shadow-[0_0_22px_rgba(207,23,51,0.28)]">
            <img
              src={`${import.meta.env.BASE_URL}img/logo.png`}
              alt="Threatbase logo"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="icon-chip absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-red-500/30 bg-[#0a0a0c]">
            <LogOut size={13} strokeWidth={2.25} />
          </span>
        </div>

        <div className="eyebrow mt-6">Session ended</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-[1.7rem]">
          You're all signed out
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
          See you later 👋 Your session has been closed on this device. Sign in again whenever you're ready.
        </p>

        <div className="mt-8">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-platinum-400">
            Sign in again
          </span>
          <div className="mt-3 flex flex-col gap-3">
            <Button
              onClick={() => signInWithGoogle()}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-white text-sm font-bold text-slate-800 shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-300 hover:bg-slate-100 hover:text-black active:scale-[0.99]"
              title="Sign in again with Google"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
              <ArrowRight size={16} className="opacity-60" />
            </Button>
            <Button
              onClick={() => signInWithGithub()}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-white/5 bg-[#181a1f]/80 text-sm font-bold text-white backdrop-blur-md transition-all duration-300 hover:bg-[#24292e] active:scale-[0.99]"
              title="Sign in again with GitHub"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              Continue with GitHub
              <ArrowRight size={16} className="opacity-60" />
            </Button>
          </div>
        </div>

        <div className="mt-8 border-t border-white/[0.06] pt-5">
          <Link
            to="/"
            className="mx-auto flex items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <Home size={13} />
            Back to Threatbase
          </Link>
        </div>
      </motion.div>
    </main>
  )
}
