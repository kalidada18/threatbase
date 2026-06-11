import { useEffect, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend, SubTitle)

export default function Analytics({ statsData, feedVersion }: any) {
  return (
    <section className="py-12 md:py-20 bg-muted/30" id="analytics">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-12 text-center md:text-left">
          <div className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Insights</div>
          <h2 className="text-3xl md:text-4xl font-bold flex items-center justify-center md:justify-start gap-3"><TrendingUp className="text-primary" /> Threat Landscape</h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl">
            90-day volume trend of tracked malicious IPv4 addresses across our sensor network.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold mb-6">Volume Trend</h3>
            <div className="h-80 w-full relative">
              <HistoryChart feedVersion={feedVersion} />
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold mb-6">Specialized Threat Categories</h3>
            <div className="h-80 w-full relative flex items-center justify-center">
              {statsData?.category_counts && (
                <CategoryChart categories={statsData.category_counts} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HistoryChart({ feedVersion }: any) {
  const chartRef = useRef(null)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    const RAW = getBaseUrl()
    fetch(RAW + 'history.json?v=' + feedVersion)
      .then((r) => {
        if (!r.ok) return null
        return r.json()
      })
      .then((data) => {
        if (!data || data.length === 0) return
        setHistory(data)

        // Update trends
        if (data.length >= 2) {
          const today = data[data.length - 1]
          const yday = data[data.length - 2]
          const updateTrend = (id: string, cur: number, prev: number) => {
            const el = document.getElementById(id)
            if (!el || typeof cur !== 'number' || typeof prev !== 'number') return
            const diff = cur - prev
            if (diff > 0) {
              el.textContent = `↑ +${fmt(diff)}`
              el.className = 'text-xs font-medium text-destructive ml-2'
            } else if (diff < 0) {
              el.textContent = `↓ ${fmt(diff)}`
              el.className = 'text-xs font-medium text-green-500 ml-2'
            } else {
              el.textContent = '— 0'
              el.className = 'text-xs font-medium text-muted-foreground ml-2'
            }
          }
          updateTrend('trend-ips', today.total_unique_ips, yday.total_unique_ips)
          updateTrend('trend-domains', today.total_unique_domains, yday.total_unique_domains)
          updateTrend('trend-hashes', today.total_unique_hashes, yday.total_unique_hashes)
          updateTrend('trend-urls', today.total_unique_urls, yday.total_unique_urls)
          updateTrend('trend-ipv6', today.total_unique_ipv6, yday.total_unique_ipv6)
          updateTrend('trend-cidrs', today.total_unique_cidrs, yday.total_unique_cidrs)
        }
      })
      .catch((e) => console.warn('history.json unavailable', e))
  }, [feedVersion])

  const accentColor = '#22C55E' // Neon Green for Cyberpunk, but let's make it standard Primary Blue
  const gridColor = 'rgba(148, 163, 184, 0.1)'
  const textColor = '#64748b'

  const labels = history.map((h) => {
    const d = new Date(h.date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  })
  const vals = history.map((h) => h.total_unique_ips)

  const data = {
    labels,
    datasets: [
      {
        label: 'Tracked Malicious IPs',
        data: vals,
        borderColor: '#0f172a',
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx
          const gradient = ctx.createLinearGradient(0, 0, 0, 350)
          gradient.addColorStop(0, 'rgba(15, 23, 42, 0.2)')
          gradient.addColorStop(1, 'rgba(15, 23, 42, 0)')
          return gradient
        },
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: '#0f172a',
        fill: true,
        tension: 0.35,
      },
    ],
  }

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      subtitle: {
        display: labels.length > 0,
        text: labels.length > 0 ? '* Feed started ' + labels[0] + ' (Baseline aggregation)' : '',
        color: textColor,
        font: { size: 12, weight: 'normal', style: 'italic' },
        padding: { bottom: 16 },
        align: 'start',
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#0f172a',
        bodyColor: '#0f172a',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: { label: (c: any) => fmt(c.parsed.y) + ' IPs' },
      },
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { maxTicksLimit: 8, color: textColor },
      },
      y: {
        grid: { color: gridColor, drawBorder: false },
        ticks: {
          color: textColor,
          callback: (v: number) =>
            v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v,
        },
      },
    },
    interaction: { mode: 'index', intersect: false },
  }

  return <Line ref={chartRef} data={data} options={options} />
}

function CategoryChart({ categories }: any) {
  const textColor = '#64748b'
  const bgColors = ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1']

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
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 4,
      },
    ],
  }

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: textColor, font: { size: 12 }, boxWidth: 12, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#0f172a',
        bodyColor: '#0f172a',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => ' ' + context.label + ': ' + fmt(context.parsed),
        },
      },
    },
  }

  return <Doughnut data={data} options={options} />
}
