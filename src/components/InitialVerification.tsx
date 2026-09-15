import React from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile'

interface InitialVerificationProps {
  onSuccess: () => void
}

/** Cloudflare's real challenge-page layout, pixel-faithful: icon + hostname,
 *  bold verification line, grey explanation, a status line that flips from a
 *  spinner ("Verifying you are human…") to "Verification successful. Waiting
 *  for <host> to respond.", and the Ray ID footer.
 *
 *  The managed widget runs interaction-only, so humans never see a box — only
 *  escalated traffic gets the checkbox, bottom-right. On solve we redeem the
 *  single-use token at /api/turnstile-verify (same action the login gate
 *  binds to, same server-side siteverify check). An expired or rejected
 *  token is reset and re-minted — the gate can't be walked around. */
export default function InitialVerification({ onSuccess }: InitialVerificationProps) {
  // Stable Ray ID for the lifetime of the page (Cloudflare's are 16 hex chars).
  const rayId = React.useMemo(
    () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    []
  )
  const host = window.location.hostname || 'threatbase.qzz.io'

  const widgetRef = React.useRef<TurnstileInstance>(null)
  const redeeming = React.useRef(false)
  const [phase, setPhase] = React.useState<'verifying' | 'success'>('verifying')
  const [error, setError] = React.useState('')

  const redeem = async (token: string) => {
    if (redeeming.current) return
    redeeming.current = true
    setError('')
    setPhase('success')
    const started = Date.now()
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/turnstile-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken: token }),
      })
      if (!res.ok) throw new Error()
      // Hold the "Waiting for <host> to respond" beat for ~5 s total — the
      // site is already painted behind the overlay, so this is theatre, not
      // load time, and it mirrors how long a real CF challenge lingers.
      await new Promise((r) => setTimeout(r, Math.max(0, 5000 - (Date.now() - started))))
      onSuccess()
    } catch {
      // Tokens are single-use and server-side checks fail closed: re-mint.
      redeeming.current = false
      setPhase('verifying')
      setError('Security check failed. Please try again.')
      widgetRef.current?.reset()
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black font-sans text-white">
      <div className="mx-auto flex w-full max-w-[700px] flex-1 flex-col items-center justify-center px-6 text-center md:px-8">
        {/* Site identity: red ban mark + hostname, as on the real page. */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-red-600"
          >
            <span className="block h-[3px] w-7 -rotate-45 rounded-full bg-red-600" />
          </span>
          <h1 className="text-4xl font-bold tracking-tight md:text-[2.6rem]">{host}</h1>
        </div>

        <h2 className="mb-4 text-2xl font-bold leading-snug">
          Verifying you are human. This may take a few seconds.
        </h2>

        <p className="text-[15px] leading-7 text-[#a3a3a3]">
          This website uses a security service to protect against malicious bots. This page is
          displayed while the website verifies you are not a bot.
        </p>

        {/* Status line: spinner while the challenge runs, then the CF
            "waiting to respond" beat while we redeem the token server-side. */}
        <div className="mt-10 flex min-h-9 items-center gap-3 text-xl font-bold" role="status" aria-live="polite">
          {phase === 'verifying' && (
            <>
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white"
              />
              <span>Verifying you are human…</span>
            </>
          )}
          {phase === 'success' && <span>Verification successful. Waiting for {host} to respond.</span>}
        </div>
        {error && <p className="mt-3 text-[13px] font-medium text-red-400">{error}</p>}

        {/* Real managed widget, interaction-only: invisible for humans, a
            clickable checkbox bottom-right exactly when CF escalates. */}
        <div className="fixed bottom-4 right-4">
          <Turnstile
            ref={widgetRef}
            siteKey={TURNSTILE_SITE_KEY}
            options={{ theme: 'dark', action: 'login', appearance: 'interaction-only' } as any}
            onSuccess={redeem}
            onExpire={() => widgetRef.current?.reset()}
            onError={() => {
              setError('Security check failed. Please try again.')
              widgetRef.current?.reset()
            }}
          />
        </div>
      </div>

      {/* Ray ID footer, same lines as the real page. */}
      <div className="w-full max-w-[1100px] self-center border-t border-[#3a3a3a] px-6 pb-8 pt-5 text-center text-[13px] leading-6 text-[#d4d4d4]">
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
