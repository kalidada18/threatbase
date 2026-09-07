import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useReducedMotion } from 'framer-motion'
import { fmt, DATA_RAMP } from '../../utils'

/**
 * Analytics donut, split into its own module so recharts stays out of
 * Analytics' chunk (and therefore out of the eager /threatfeed route chunk):
 * Analytics lazy-imports this. accessibilityLayer makes the slices
 * keyboard-focusable with screen-reader values (the mouse-only Tooltip is
 * otherwise the only place counts appear).
 */
export default function CategoryChart({ categories }: { categories: Record<string, number> }) {
  const sorted = Object.entries(categories)
    .filter(([k]) => k !== 'Mixed' && k !== 'Unknown')
    .sort((a: any, b: any) => b[1] - a[1])

  const chartData = sorted.map(([name, value], i) => ({
    name,
    value: value as number,
    color: DATA_RAMP[i % DATA_RAMP.length],
  }))

  const reduce = useReducedMotion()

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart accessibilityLayer>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="80%"
          paddingAngle={3}
          dataKey="value"
          isAnimationActive={!reduce}
          animationDuration={800}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
            fontFamily: "'Manrope', sans-serif",
            fontWeight: '600',
            padding: '12px 16px',
          }}
          formatter={(value, name) => [fmt(Number(value)), name]}
          labelStyle={{ display: 'none' }}
          cursor={false}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => (
            <span style={{ color: '#cbd5e1', fontSize: '12px', fontFamily: "'Manrope', sans-serif", fontWeight: '500' }}>
              {value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
