import React from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile'

interface InitialVerificationProps {
  onSuccess: () => void
}

/** Cloudflare "Performing security verification" interstitial — real Turnstile.
 *
 *  A managed widget solves silently for humans and blocks scripted clients;
 *  on solve we redeem the single-use token at /api/turnstile-verify (same
 *  action the login gate binds to, same server-side siteverify check), and
 *  only then does the parent open the site. An expired or rejected token is
 *  reset and re-minted — the gate can't be walked around. */
export default function InitialVerification({ onSuccess }: InitialVerificationProps) {
  // Stable Ray ID for the lifetime of the page (Cloudflare's are 16 hex chars).
  const rayId = React.useMemo(
    () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    []
  )
  const host = window.location.hostname || 'threatbase.qzz.io'

  const widgetRef = React.useRef<TurnstileInstance>(null)
  const redeeming = React.useRef(false)
  const [error, setError] = React.useState('')

  const redeem = async (token: string) => {
    if (redeeming.current) return
    redeeming.current = true
    setError('')
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/turnstile-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken: token }),
      })
      if (!res.ok) throw new Error()
      onSuccess()
    } catch {
      // Tokens are single-use and server-side checks fail closed: re-mint.
      redeeming.current = false
      setError('Security check failed. Please try again.')
      widgetRef.current?.reset()
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center bg-black font-sans text-white">
      <div className="flex w-full max-w-[600px] flex-1 flex-col items-start justify-center px-6">
        {/* Site identity, where the real page shows its blocked-domain headline. */}
        <div className="mb-4 flex items-center gap-4">
          <img
            src={`${import.meta.env.BASE_URL}img/logo.png`}
            alt=""
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-full object-contain"
          />
          <h1 className="text-4xl font-bold tracking-tight md:text-[2.6rem]">{host}</h1>
        </div>

        <h2 className="mb-3 text-2xl font-bold">Performing security verification</h2>

        <p className="mb-10 text-[15px] leading-7 text-[#a3a3a3]">
          This website uses a security service to protect against malicious bots. This page is
          displayed while the website verifies you are not a bot.
        </p>

        {/* Real managed widget: auto-passes humans, stops scripts. */}
        <Turnstile
          ref={widgetRef}
          siteKey={TURNSTILE_SITE_KEY}
          options={{ theme: 'dark', action: 'login' }}
          onSuccess={redeem}
          onExpire={() => widgetRef.current?.reset()}
          onError={() => {
            setError('Security check failed. Please try again.')
            widgetRef.current?.reset()
          }}
        />
        {error && <p className="mt-3 text-[13px] font-medium text-red-400">{error}</p>}
      </div>

      {/* Ray ID footer, same lines as the real page. */}
      <div className="w-full max-w-[1100px] border-t border-[#3a3a3a] px-6 pb-8 pt-5 text-center text-[13px] leading-6 text-[#d4d4d4]">
        <p>
          Ray ID: <span className="font-mono">{rayId}</span>
        </p>
        <p>
          Performance and Security by{' '}
          <a
            href="https://www.cloudflare.com?utm_source=challenge&utm_campaign=m"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7aa2f7] underline underline-offset-2"
          >Cloudflare</a>{' '}
          {'| '}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7aa2f7] underline underline-offset-2"
          >Privacy</a>
        </p>
      </div>
    </div>
  )
}
