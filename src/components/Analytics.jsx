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

function handleSpotlight(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
  e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
}

export default function Analytics({ statsData, feedVersion }) {
  return (
    <section className="section" id="analytics">
      <div className="section-head">
        <div className="section-label">Insights</div>
        <h2 className="section-title"><TrendingUp size={22} /> Threat Landscape</h2>
        <p className="section-desc">
          90-day volume trend of tracked malicious IPv4 addresses across our sensor network.
        </p>
      </div>

      <div className="analytics-grid">
        <div className="glass-panel" onMouseMove={handleSpotlight}>
          <h3 className="panel-title">Volume Trend</h3>
          <div className="chart-wrap">
            <HistoryChart feedVersion={feedVersion} />
          </div>
        </div>

        <div className="glass-panel" onMouseMove={handleSpotlight}>
          <h3 className="panel-title">Specialized Threat Categories</h3>
          <div className="chart-wrap donut-wrap">
            {statsData?.category_counts && (
              <CategoryChart categories={statsData.category_counts} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function HistoryChart({ feedVersion }) {
  const chartRef = useRef(null)
  const [history, setHistory] = useState([])

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
          const updateTrend = (id, cur, prev) => {
            const el = document.getElementById(id)
            if (!el || typeof cur !== 'number' || typeof prev !== 'number') return
            const diff = cur - prev
            if (diff > 0) {
              el.textContent = `↑ +${fmt(diff)}`
              el.className = 'trend up'
            } else if (diff < 0) {
              el.textContent = `↓ ${fmt(diff)}`
              el.className = 'trend down'
            } else {
              el.textContent = '— 0'
              el.className = 'trend neutral'
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

  const accentColor = '#22C55E' // Neon Green
  const gridColor = 'rgba(34, 197, 94, 0.05)'
  const textColor = '#94a3b8'

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
        borderColor: accentColor,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx
          const gradient = ctx.createLinearGradient(0, 0, 0, 350)
          gradient.addColorStop(0, 'rgba(34, 197, 94, 0.22)')
          gradient.addColorStop(1, 'rgba(34, 197, 94, 0)')
          return gradient
        },
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: accentColor,
        fill: true,
        tension: 0.35,
      },
    ],
  }

  const options = {
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
        backgroundColor: 'rgba(10, 10, 11, 0.95)',
        titleColor: '#fafafa',
        bodyColor: accentColor,
        borderColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: { label: (c) => fmt(c.parsed.y) + ' IPs' },
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
          callback: (v) =>
            v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v,
        },
      },
    },
    interaction: { mode: 'index', intersect: false },
  }

  return <Line ref={chartRef} data={data} options={options} />
}

function CategoryChart({ categories }) {
  const textColor = '#94a3b8'
  const bgColors = ['#EF4444', '#10b981', '#a855f7', '#3b82f6', '#f59e0b', '#ec4899']

  const sorted = Object.entries(categories)
    .filter(([k]) => k !== 'Mixed' && k !== 'Unknown')
    .sort((a, b) => b[1] - a[1])
  const labels = sorted.map(([k]) => k)
  const vals = sorted.map(([, v]) => v)

  const data = {
    labels,
    datasets: [
      {
        data: vals,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#090a10',
        hoverOffset: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'right',
        labels: { color: textColor, font: { size: 11 }, boxWidth: 12, padding: 16 },
      },
      tooltip: {
        backgroundColor: 'rgba(10, 10, 11, 0.95)',
        titleColor: '#fafafa',
        bodyColor: '#d4d4d8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => ' ' + context.label + ': ' + fmt(context.parsed),
        },
      },
    },
  }

  return <Doughnut data={data} options={options} />
}
