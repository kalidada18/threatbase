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
