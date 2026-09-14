import React from 'react'
import ScanPulse from './ui/scan-pulse'

interface InitialVerificationProps {
  onSuccess: (token: string) => void
}

/** Cloudflare "Performing security verification" interstitial (the abuseipdb
 *  one), recreated with our own branding: black page, logo + hostname
 *  headline, the radar ghost loader in place of the challenge widget, Ray-ID
 *  footer. Visual gate only — it resolves itself once the sweep completes. */
export default function InitialVerification({ onSuccess }: InitialVerificationProps) {
  // Stable Ray ID for the lifetime of the page (Cloudflare's are 16 hex chars).
  const rayId = React.useMemo(
    () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    []
  )
  const host = window.location.hostname || 'threatbase.qzz.io'

  // Hand control back after the sweep has run through a few phases. Ref keeps
  // the timer alive across parent re-renders (onSuccess is an inline arrow).
  const onSuccessRef = React.useRef(onSuccess)
  onSuccessRef.current = onSuccess
  React.useEffect(() => {
    const t = setTimeout(() => onSuccessRef.current('interstitial'), 3400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black font-sans text-white">
      <div className="flex w-full max-w-2xl flex-1 flex-col items-start justify-center px-6 md:px-12">
        {/* Site identity, like the blocked-domain headline on the real page. */}
        <div className="mb-3 flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}img/logo.png`}
            alt=""
            aria-hidden="true"
            className="h-9 w-9 shrink-0 rounded-full object-contain md:h-10 md:w-10"
          />
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{host}</h1>
        </div>

        <h2 className="mb-3 text-xl font-bold md:text-2xl">Performing security verification</h2>

        <p className="mb-10 max-w-xl text-[15px] leading-relaxed text-gray-300 md:text-base">
          This website uses a security service to protect against malicious bots. This page is
          displayed while the website verifies you are not a bot.
        </p>

        <ScanPulse ip={host} />
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
