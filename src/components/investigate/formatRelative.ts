/** "in 23 min" · "in 4 h" · "in 2 d" · "expired" — '' on bad/missing input.
 *  Custom instead of date-fns: global constraint, no new deps. */
export function formatRelative(iso: string | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.round((t - Date.now()) / 60000)
  if (mins <= 0) return 'expired'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours} h`
  return `in ${Math.round(hours / 24)} d`
}

/** Absolute, human day: "2026-09-02T14:05:00" -> "2 Sep 2026". UTC-pinned so
 *  the dossier reads the same in every browser. '' on bad/missing input. */
const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  return DAY_FMT.format(t)
}

/** Past-clamped relative time: "2026-09-02T14:05:00" -> "2d ago". Never shows
 *  a future date as "0m ago"; clamps to "just now". '' on bad/missing input. */
export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins <= 0) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / (24 * 60))}d ago`
}
