import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fmt, DATA_RAMP } from '../utils'
import AnimatedHighlightedAreaChart from './blocks/animated-area-chart'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'

export default function Analytics({ statsData, feedVersion }: any) {
  return (
    <Section id="analytics" className="overflow-hidden" containerClassName="relative z-10">
        <SectionHeading
          title="Threat landscape"
          subtitle="How the database has grown, day by day, since we started keeping history. Rebuilt on every feed refresh."
          className="mb-14"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <AnimatedHighlightedAreaChart feedVersion={feedVersion} />
          </div>

          {/* Donut Chart Card */}
          <div className="glass-card p-6 relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-px w-full bg-gradient-to-r from-transparent via-red-500/40 to-transparent"></div>

            <div className="relative z-10 h-full flex flex-col">
              <h3 className="text-xl font-bold mb-8 text-white tracking-tight">Threat classes by volume</h3>
              <div className="flex-1 w-full relative flex items-center justify-center min-h-[300px]">
                {statsData?.category_counts ? (
                  <CategoryChart categories={statsData.category_counts} />
                ) : (
                  <p className="max-w-[16rem] text-center text-sm font-medium text-slate-500">
                    Category breakdown appears once the live feed has loaded.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
    </Section>
  )
}


function CategoryChart({ categories }: any) {
  const sorted = Object.entries(categories)
    .filter(([k]) => k !== 'Mixed' && k !== 'Unknown')
    .sort((a: any, b: any) => b[1] - a[1])

  const chartData = sorted.map(([name, value], i) => ({
    name,
    value: value as number,
    color: DATA_RAMP[i % DATA_RAMP.length],
  }))

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="80%"
          paddingAngle={3}
          dataKey="value"
          isAnimationActive={!reducedMotion}
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
