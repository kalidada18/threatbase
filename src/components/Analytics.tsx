import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { fmt, DATA_RAMP } from '../utils'
import AnimatedHighlightedAreaChart from './blocks/animated-area-chart'
import Section from './layout/Section'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function Analytics({ statsData, feedVersion }: any) {
  return (
    <Section id="analytics" className="overflow-hidden" containerClassName="relative z-10">
        <div className="mb-14 max-w-2xl">
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            Threat landscape
          </h2>
          <p className="mt-4 text-slate-400 text-lg font-medium leading-relaxed">
            How the database has grown, day by day, since we started keeping history. Rebuilt on every feed refresh.
          </p>
        </div>

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
  const textColor = '#cbd5e1'

  const sorted = Object.entries(categories)
    .filter(([k]) => k !== 'Mixed' && k !== 'Unknown')
    .sort((a: any, b: any) => b[1] - a[1])
  const labels = sorted.map(([k]) => k)
  const vals = sorted.map(([, v]) => v)

  const data = {
    labels,
    datasets: [
      {
        data: vals,
        // Segments are sorted by volume, so ramp position reads as rank:
        // hottest ruby at the top, cooling to platinum down the tail.
        backgroundColor: labels.map((_, i) => DATA_RAMP[i % DATA_RAMP.length]),
        borderWidth: 0, // Remove stroke for sleek modern look
        borderRadius: 8, // Rounded segments
        hoverOffset: 8,
      },
    ],
  }

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '80%', // Thinner sleek ring
    // MotionConfig governs framer-motion only; chart.js runs its own animation
    // engine, so honor prefers-reduced-motion here explicitly.
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: textColor,
          font: { size: 12, family: "'Manrope', sans-serif", weight: '500' },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20 
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 16,
        usePointStyle: true,
        boxPadding: 6,
        bodyFont: { size: 14, family: "'Manrope', sans-serif", weight: '600' },
        callbacks: {
          label: (context: any) => ' ' + context.label + ': ' + fmt(context.parsed),
        },
      },
    },
  }

  return <Doughnut data={data} options={options} />
}
