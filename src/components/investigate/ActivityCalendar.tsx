import type { TimelinePoint } from '@/investigationTypes'

const DAYS = 90
// GitHub-style: 13 week-columns x 7 day-rows, day-major down each column
const COLS = 13
// intensity steps keyed by distinct sources sighted that day (1..4+)
const STEPS = ['', '0.18', '0.35', '0.6', '0.9']

/** 90-day activity heatmap: one row per source lane, red-alpha steps of --chart-1. */
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
        <span className="eyebrow">90-day activity</span>
        <span className="font-mono text-[9px] text-slate-600">none → 4+ sources same day</span>
      </div>
      <div className="font-mono text-[9px] uppercase text-slate-500 mb-1 grid gap-1 items-center" style={{ gridTemplateColumns: '64px 1fr' }}>
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
          <span className="truncate uppercase tracking-wide text-[9px] font-mono text-slate-500" title={lane}>{lane}</span>
          <span className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(7, 1fr)`, gridAutoFlow: 'column' }}>
            {Array.from({ length: DAYS }, (_, i) => {
              const d = days[i]
              const t = d ? byDay.get(d) : undefined
              const on = t?.sources.includes(lane)
              return (
                <span key={i} role="img"
                  title={d ? (t ? `${d} · ${t.sources.join(', ')}` : `${d} · no sightings`) : ''}
                  className="w-full aspect-square rounded-[2px]"
                  style={{ background: on ? `hsl(351 80% 45% / ${STEPS[Math.min(4, t!.count)]})` : 'rgba(255,255,255,0.04)' }} />
              )
            })}
          </span>
        </div>
      ))}
    </section>
  )
}
