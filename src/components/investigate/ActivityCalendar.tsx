import type { TimelinePoint } from '@/investigationTypes'
import { StageLabel } from './StageLabel'

const DAYS = 90
// GitHub-style: 13 week-columns x 7 day-rows, day-major down each column
const COLS = 13
// intensity steps keyed by distinct sources sighted that day (1..4+) —
// iron-slip glaze on raw clay; severity never wears ember.
const STEPS = ['', '0.22', '0.42', '0.68', '0.95']

/** 90-day activity heatmap: one row per source lane, iron-alpha glaze steps. */
export default function ActivityCalendar({ timeline }: { timeline: TimelinePoint[] }) {
  const lanes = [...new Set(timeline.flatMap((t) => t.sources))].sort()
  // window ends at the newest sighting (or today when timeline is empty)
  const end = timeline.length
    ? timeline.reduce((a, b) => (a.date >= b.date ? a : b)).date.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  const start = new Date(end + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - (DAYS - 1))
  const days: string[] = []
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  const byDay = new Map(timeline.map((t) => [t.date, t]))
  return (
    <section aria-label="Activity calendar">
      <div className="flex items-baseline justify-between mb-2">
        <StageLabel n="06" name="ACTIVITY" />
        <span className="metric text-[11px] text-[#584f42]">none → 4+ sources same day</span>
      </div>
      <div className="metric text-[10px] uppercase text-[#584f42] mb-1 grid gap-1 items-center" style={{ gridTemplateColumns: '64px 1fr' }}>
        <span />
        <span className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridAutoRows: '10px' }}>
          {Array.from({ length: COLS }, (_, c) => {
            const d = days[c * 7] // first day of each week column
            const prev = days[(c - 1) * 7]
            const show = d && (!prev || d.slice(0, 7) !== prev.slice(0, 7))
            return <span key={c}>{show ? new Date(d + 'T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }) : ''}</span>
          })}
        </span>
      </div>
      {lanes.map((lane) => (
        <div key={lane} className="grid gap-1 items-center mb-1" style={{ gridTemplateColumns: '64px 1fr' }}>
          <span className="truncate uppercase tracking-wide text-[10px] metric text-[#584f42]" title={lane}>{lane}</span>
          <span className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(7, 1fr)`, gridAutoFlow: 'column' }}>
            {Array.from({ length: DAYS }, (_, i) => {
              const d = days[i]
              const t = d ? byDay.get(d) : undefined
              const on = t?.sources.includes(lane)
              return (
                <span key={i} role="img"
                  title={d ? (t ? `${d} · ${t.sources.join(', ')}` : `${d} · no sightings`) : ''}
                  className="w-full aspect-square rounded-[1px]"
                  style={{ background: on ? `rgba(164, 67, 44, ${STEPS[Math.min(4, t!.count)]})` : 'rgba(110, 103, 92, 0.16)' }} />
              )
            })}
          </span>
        </div>
      ))}
    </section>
  )
}
