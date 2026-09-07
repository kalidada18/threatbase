import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '../../utils'

type Datum = { name: string; value: number; color: string }

/**
 * FeedHealth contribution chart, split into its own module so recharts stays
 * out of FeedHealth's chunk (and therefore out of the eager /threatfeed route
 * chunk): FeedHealth lazy-imports this, so the ~437kB recharts subgraph only
 * downloads after the route's tables paint.
 */
export default function FeedHealthChart({ data }: { data: Datum[] }) {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <ResponsiveContainer width="100%" height={288}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
          itemStyle={{ color: '#94a3b8' }}
          formatter={(value: any) => [fmt(Number(value)), 'New IOCs']}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={!reducedMotion}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
