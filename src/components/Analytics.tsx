import { useEffect, useRef, useState } from 'react'
import { TrendingUp, Activity } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  SubTitle,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { getBaseUrl, fmt } from '../utils'
import AnimatedHighlightedAreaChart from './blocks/animated-area-chart'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend, SubTitle)

export default function Analytics({ statsData, feedVersion }: any) {
  return (
    <section className="py-12 md:py-24 relative overflow-hidden scroll-mt-24" id="analytics">
      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        <div className="mb-14 text-center md:text-left flex flex-col items-center md:items-start">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-white/10 backdrop-blur-xl shadow-2xl text-xs font-bold uppercase tracking-widest mb-6 text-slate-300">
            <span className="relative flex h-2.5 w-2.5 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            Live Telemetry
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold flex items-center justify-center md:justify-start gap-4 text-white drop-shadow-sm tracking-tight">
            Threat Landscape
          </h2>
          <p className="mt-5 text-slate-400 text-lg max-w-2xl font-medium leading-relaxed">
            90-day volume trend of tracked malicious indicators across our global sensor network, aggregated in real-time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <AnimatedHighlightedAreaChart feedVersion={feedVersion} />
          </div>

          {/* Donut Chart Card */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] p-8 relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-[2px] w-full bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>
            
            <div className="relative z-10 h-full flex flex-col">
              <h3 className="text-xl font-extrabold mb-8 text-white tracking-tight">Specialized Categories</h3>
              <div className="flex-1 w-full relative flex items-center justify-center min-h-[300px]">
                {statsData?.category_counts && (
                  <CategoryChart categories={statsData.category_counts} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


function CategoryChart({ categories }: any) {
  const textColor = '#cbd5e1'
  // Premium tech palette: Red, Orange, Amber, Emerald, Cyan, Purple
  const bgColors = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#06b6d4', '#a855f7'] 

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
        backgroundColor: bgColors,
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
    plugins: {
      legend: {
        position: 'bottom',
        labels: { 
          color: textColor, 
          font: { size: 12, family: "'Inter', sans-serif", weight: '500' }, 
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
        bodyFont: { size: 14, family: "'Inter', sans-serif", weight: '600' },
        callbacks: {
          label: (context: any) => ' ' + context.label + ': ' + fmt(context.parsed),
        },
      },
    },
  }

  return <Doughnut data={data} options={options} />
}
