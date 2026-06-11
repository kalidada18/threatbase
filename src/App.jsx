import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
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

      <Navbar syncTime={syncTime} />

      <main id="main-content">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Hero
            scanInput={scanInput}
            setScanInput={setScanInput}
            setScanResult={setScanResult}
            setIsScanning={setIsScanning}
            setShowReport={setShowReport}
            feedVersion={feedVersion}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
          <ReportScanner
            scanResult={scanResult}
            isScanning={isScanning}
            showReport={showReport}
            scanInput={scanInput}
          />
        </motion.div>

        <motion.div 
          className="container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <Stats statsData={statsData} />
          <Feeds />
          <Analytics statsData={statsData} feedVersion={feedVersion} />
          <ReportIP addToast={addToast} />
        </motion.div>
      </main>

      <ToastContainer toasts={toasts} />
      <Footer />
    </>
  )
}
