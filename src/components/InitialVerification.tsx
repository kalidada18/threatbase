import React from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

interface InitialVerificationProps {
  onSuccess: (token: string) => void
  siteKey?: string
}

/** Cloudflare "Performing security verification" interstitial, recreated as the
 *  site's own Turnstile gate: black page, hostname headline, centered widget,
 *  Ray-ID footer. One column, left-aligned text. */
export default function InitialVerification({ onSuccess, siteKey = '0x4AAAAAADj2T6kY9_5dXRhs' }: InitialVerificationProps) {
  // Stable Ray ID for the lifetime of the page (Cloudflare's are 16 hex chars).
  const rayId = React.useMemo(
    () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    []
  )
  const host = window.location.hostname || 'threatbase.qzz.io'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black font-sans text-white">
      <div className="flex w-full max-w-2xl flex-1 flex-col items-start justify-center px-6 md:px-12">
        {/* Site name, like the blocked-domain headline on the real interstitial. */}
        <div className="mb-3 flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 md:h-9 md:w-9" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="#e22" strokeWidth="2.6" />
            <line x1="5.7" y1="18.3" x2="18.3" y2="5.7" stroke="#e22" strokeWidth="2.6" />
          </svg>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{host}</h1>
        </div>

        <h2 className="mb-3 text-xl font-bold md:text-2xl">Performing security verification</h2>

        <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-gray-300 md:text-base">
          This website uses a security service to protect against malicious bots. This page is
          displayed while the website verifies you are not a bot.
        </p>

        <div className="w-[300px] overflow-hidden rounded border border-[#4d4d4d] bg-[#2a2a2a]">
          <Turnstile
            siteKey={siteKey}
            onSuccess={(token) => setTimeout(() => onSuccess(token), 1400)}
            options={{ theme: 'dark', size: 'normal' }}
          />
        </div>
      </div>

      {/* Ray ID footer, same three lines as the real page. */}
      <div className="w-full max-w-2xl border-t border-[#3a3a3a] px-6 pb-8 pt-5 text-center text-[13px] text-gray-300 md:px-12">
        <p className="mb-1">Ray ID: <span className="font-mono">{rayId}</span></p>
        <p>
          Performance and Security by{' '}
          <a
            href="https://www.cloudflare.com?utm_source=challenge&utm_campaign=m"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6bb0ff] underline underline-offset-2"
          >Cloudflare</a>{' '}
          {'| '}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6bb0ff] underline underline-offset-2"
          >Privacy</a>
        </p>
      </div>
    </div>
  )
}
