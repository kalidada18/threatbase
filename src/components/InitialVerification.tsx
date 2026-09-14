import React from 'react'
import { VerifyGhost } from './ui/verify-ghost'

interface InitialVerificationProps {
  onSuccess: (token: string) => void
}

/** Cloudflare "Performing security verification" interstitial — the abuseipdb
 *  look, rebuilt 1:1 with Threatbase branding: no-entry spot swapped for the
 *  logo, hostname headline, ghost Turnstile checkbox (click → Verifying… →
 *  green check → site opens), Ray-ID footer. Visual gate only. */
export default function InitialVerification({ onSuccess }: InitialVerificationProps) {
  // Stable Ray ID for the lifetime of the page (Cloudflare's are 16 hex chars).
  const rayId = React.useMemo(
    () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    []
  )
  const host = window.location.hostname || 'threatbase.qzz.io'

  // Widget lifecycle: idle checkbox → verifying spinner → success check →
  // "waiting for host to respond" → open. The waiting beat is what sells it:
  // real Cloudflare interstitials pause there while the origin answers.
  const [state, setState] = React.useState<'idle' | 'verifying' | 'done' | 'waiting'>('idle')
  const verify = () => {
    if (state !== 'idle') return
    setState('verifying')
    setTimeout(() => setState('done'), 1700)
  }
  React.useEffect(() => {
    if (state === 'done') {
      const t = setTimeout(() => setState('waiting'), 900)
      return () => clearTimeout(t)
    }
    if (state !== 'waiting') return
    // 2.4s of "origin is responding" before the site opens.
    const t = setTimeout(() => onSuccess('interstitial'), 2400)
    return () => clearTimeout(t)
  }, [state, onSuccess])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black font-sans text-white">
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

        <h2 className="mb-3 text-2xl font-bold">
          {state === 'waiting' ? `Waiting for ${host} to respond…` : 'Performing security verification'}
        </h2>

        <p className="mb-10 text-[15px] leading-7 text-[#a3a3a3]">
          {state === 'waiting' ? (
            'The security check passed. This page is displayed while the website loads.'
          ) : (
            <>
              This website uses a security service to protect against malicious bots. This page is
              displayed while the website verifies you are not a bot.
            </>
          )}
        </p>

        {/* Ghost challenge widget — click it and the real challenge's state
            sequence plays out, then the site opens. */}
        <VerifyGhost state={state === 'waiting' ? 'done' : state} onVerify={verify} />
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
