/** Cloudflare Turnstile ghost widget — the "Verify you are human" box drawn
 *  from scratch (checkbox / green-dot spinner / success check, cloud mark,
 *  Privacy • Help). Shared by the verification interstitial and the live-scan
 *  loading state so the two never drift. Pure visuals: no challenge protocol,
 *  nothing is actually verified. */

export type GhostState = 'idle' | 'verifying' | 'done'

export function VerifyGhost({
  state,
  onVerify,
}: {
  state: GhostState
  onVerify?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onVerify}
      aria-label={state === 'idle' ? 'Verify you are human' : 'Verifying'}
      className={`flex h-[65px] w-[300px] select-none items-center justify-between rounded-md border border-[#525252] bg-[#262626] px-4 text-left ${
        state === 'idle' && onVerify ? 'cursor-pointer' : 'cursor-default'
      }`}
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
