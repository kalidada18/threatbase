import React from 'react'

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

  // Widget lifecycle: idle checkbox → verifying spinner → success check → open.
  const [state, setState] = React.useState<'idle' | 'verifying' | 'done'>('idle')
  const verify = () => {
    if (state !== 'idle') return
    setState('verifying')
    setTimeout(() => setState('done'), 1700)
  }
  React.useEffect(() => {
    if (state !== 'done') return
    const t = setTimeout(() => onSuccess('interstitial'), 900)
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

        <h2 className="mb-3 text-2xl font-bold">Performing security verification</h2>

        <p className="mb-10 text-[15px] leading-7 text-[#a3a3a3]">
          This website uses a security service to protect against malicious bots. This page is
          displayed while the website verifies you are not a bot.
        </p>

        {/* Ghost challenge widget — Turnstile's exact box: checkbox + label on
            the left, provider mark on the right; states mirror the real one. */}
        <button
          type="button"
          onClick={verify}
          aria-label={state === 'idle' ? 'Verify you are human' : 'Verifying'}
          className="flex h-[65px] w-[300px] cursor-pointer select-none items-center justify-between rounded-md border border-[#525252] bg-[#262626] px-4 text-left"
        >
          <span className="flex items-center gap-3">
            {state === 'idle' && (
              <span className="h-[26px] w-[26px] rounded-[3px] border-2 border-[#d4d4d4] bg-black/40" />
            )}
            {state === 'verifying' && <SpinnerDots />}
            {state === 'done' && (
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] bg-[#3ecf8e]">
                <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                  <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="#0b0b0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            <span className="text-sm text-[#ededed]">
              {state === 'idle' && 'Verify you are human'}
              {state === 'verifying' && 'Verifying…'}
              {state === 'done' && 'Success!'}
            </span>
          </span>

          <span className="flex flex-col items-center gap-[3px]">
            <CloudMark />
            <span className="text-[8px] font-bold tracking-[0.14em] text-[#d4d4d4]">CLOUDFLARE</span>
            <span className="flex items-center gap-1 text-[8px] text-[#7aa2f7]">
              <span className="underline">Privacy</span>
              <span className="text-[#a3a3a3]">•</span>
              <span className="underline">Help</span>
            </span>
          </span>
        </button>
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

/** Turnstile's loading mark: eight green dots on a circle, chasing highlight. */
function SpinnerDots() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 animate-spin" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return (
          <circle
            key={i}
            cx={10 + 7 * Math.cos(a)}
            cy={10 + 7 * Math.sin(a)}
            r="1.5"
            fill="#3ecf8e"
            opacity={0.25 + (0.75 * i) / 7}
          />
        )
      })}
    </svg>
  )
}

/** Cloudflare's orange twin-cloud mark. */
function CloudMark() {
  return (
    <svg viewBox="0 0 24 16" className="h-[15px] w-6" aria-hidden="true">
      <path d="M6.8 12.6a3.4 3.4 0 0 1-.35-6.78A5 5 0 0 1 15.9 6.9a3 3 0 0 1 .4 5.68z" fill="#f6821f" />
      <path d="M2.7 14.6a2.3 2.3 0 0 1-.15-4.55A3.7 3.7 0 0 1 9.6 8.9a2.4 2.4 0 0 1 .45 4.7z" fill="#fbad41" />
    </svg>
  )
}
