import { useState, useEffect, useCallback } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import ReportScanner from './components/ReportScanner'
import Stats from './components/Stats'
import Feeds from './components/Feeds'
import Analytics from './components/Analytics'
import ReportIP from './components/ReportIP'
import Footer from './components/Footer'
import ToastContainer from './components/ToastContainer'
import { getBaseUrl, formatSyncTime, animateValue } from './utils'

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('himalaya-theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  const [statsData, setStatsData] = useState(null)
  const [feedVersion, setFeedVersion] = useState(Date.now())
  const [syncTime, setSyncTime] = useState('Live Mode')

  // Scan state (shared between Hero and ReportScanner)
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showReport, setShowReport] = useState(false)

  // Toast state
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  // Apply theme to document
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    localStorage.setItem('himalaya-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  // Boot: fetch stats.json
  useEffect(() => {
    const RAW = getBaseUrl()
    fetch(RAW + 'stats.json?_=' + Date.now())
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then((d) => {
        setStatsData(d)
        setFeedVersion(d.last_updated || Date.now())
        setSyncTime(formatSyncTime(d.last_updated))

        // Animate stat counters
        animateValue(document.getElementById('n-total'), d.total_unique_ips)
        animateValue(document.getElementById('n-domains'), d.total_unique_domains || 0)
        animateValue(document.getElementById('n-hashes'), d.total_unique_hashes || 0)
        animateValue(document.getElementById('n-urls'), d.total_unique_urls || 0)
        animateValue(document.getElementById('n-ipv6'), d.total_unique_ipv6 || 0)
        animateValue(document.getElementById('n-cidrs'), d.total_unique_cidrs || 0)
      })
      .catch((err) => {
        console.warn('stats.json unavailable:', err.message)
        setSyncTime('Live Mode')
      })
  }, [])

  // Auto-scan from URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const searchParam = urlParams.get('search') || urlParams.get('q')
    if (searchParam) {
      setScanInput(searchParam)
      // Trigger scan after a short delay for UI readiness
      setTimeout(() => {
        document.getElementById('scan-btn')?.click()
      }, 300)
    }
  }, [])

  return (
    <>
      {/* Backdrop Blobs */}
      <div className="blob-container" aria-hidden="true">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Skip Link */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <Navbar theme={theme} toggleTheme={toggleTheme} syncTime={syncTime} />

      <main id="main-content">
        <Hero
          scanInput={scanInput}
          setScanInput={setScanInput}
          setScanResult={setScanResult}
          setIsScanning={setIsScanning}
          setShowReport={setShowReport}
          feedVersion={feedVersion}
        />

        <ReportScanner
          scanResult={scanResult}
          isScanning={isScanning}
          showReport={showReport}
          scanInput={scanInput}
        />

        <div className="container">
          <Stats statsData={statsData} />
          <Feeds />
          <Analytics statsData={statsData} feedVersion={feedVersion} theme={theme} />
          <ReportIP addToast={addToast} />
        </div>
      </main>

      <ToastContainer toasts={toasts} />
      <Footer />
    </>
  )
}
