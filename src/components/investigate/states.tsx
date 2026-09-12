/** Shared presentational primitives for the dossier cockpit. Its own module
 *  (dependency-light, like IocLink) so BehaviorPanel and InvestigatePage both
 *  use ONE chip vocabulary instead of hand-rolled span soup. */
import type { ReactNode } from 'react'
import { Check, CircleAlert, CircleDashed, Minus, type LucideIcon } from 'lucide-react'
import type { Narrative } from '@/investigationTypes'

/** One ok/skipped/failed vocabulary for evidence chips + source strip. */
export const EV_ICON: Record<'ok' | 'skipped' | 'failed', LucideIcon> = {
  ok: Check, skipped: Minus, failed: CircleAlert,
}
export const QUEUED_ICON: LucideIcon = CircleDashed

/** Chip surface tones. 'red' = flagged/hard claim, 'emerald' = confirmed clean,
 *  everything else neutral chrome. Ruby stays reserved for interaction + flags. */
export const CHIP_TONE: Record<'neutral' | 'red' | 'emerald', string> = {
  neutral: 'text-slate-300 border-white/10 bg-white/[0.03]',
  red: 'text-red-200/90 border-red-500/30 bg-red-500/10',
  emerald: 'text-emerald-200/90 border-emerald-500/25 bg-emerald-500/5',
}

export const Chip = ({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: keyof typeof CHIP_TONE; className?: string }) => (
  <span className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-wider rounded-full px-2.5 py-1 border ${CHIP_TONE[tone]} ${className}`}>
    {children}
  </span>
)

/** The one confidence pill vocabulary (replaces 'conf HIGH' + 'confidence: high'). */
export function ConfidencePill({ level }: { level: Narrative['confidence'] }) {
  const tone = level === 'high' ? 'emerald' : level === 'medium' ? 'neutral' : 'neutral'
  return <Chip tone={tone}>{level} confidence</Chip>
}
