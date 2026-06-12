import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HeroSection } from './components/blocks/hero-section-5'
import ReportScanner from './components/ReportScanner'
import AboutPage from './components/AboutPage'
import Stats from './components/Stats'
import Feeds from './components/Feeds'
import Analytics from './components/Analytics'
import ReportIP from './components/ReportIP'
import ThanksPage from './components/ThanksPage'
import Footer from './components/Footer'
import ToastContainer from './components/ToastContainer'
import Navbar from './components/Navbar'
import Profile from './components/Profile'
import { AuthProvider } from './AuthContext'
import { getBaseUrl, formatSyncTime, animateValue } from './utils'
import { scanIndicatorLogic } from './scanner'

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

  const addToast = useCallback((message: string, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev: any) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev: any) => prev.filter((t: any) => t.id !== id))
    }, 4000)
  }, [])

  const handleScan = useCallback(async () => {
    const raw = scanInput.trim()
    if (!raw) return

    setIsScanning(true)
    setShowReport(true)
    setScanResult(null)

    const result = await scanIndicatorLogic(raw, feedVersion)
    await new Promise((r) => setTimeout(r, 1600))

    setScanResult(result)
    setIsScanning(false)

    const section = document.getElementById('report-section')
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [scanInput, feedVersion])


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
      setTimeout(() => {
        document.getElementById('scan-btn')?.click()
      }, 300)
    }
  }, [])

  // Scroll to hash on page load or navigation
  const location = useLocation()
  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.substring(1))
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    } else {
      window.scrollTo(0, 0)
    }
  }, [location])

  return (
    <AuthProvider>
      <Navbar />

      <Routes>
        <Route path="/" element={
          <main id="main-content">
            <HeroSection scanInput={scanInput} setScanInput={setScanInput} handleScan={handleScan} statsData={statsData} />

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
              <ReportScanner
                scanResult={scanResult}
                isScanning={isScanning}
                showReport={showReport}
                scanInput={scanInput}
              />
            </motion.div>

            <motion.div 
              className="flex flex-col"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, staggerChildren: 0.2 }}
            >
              <Stats statsData={statsData} />
              <Feeds />
              <Analytics statsData={statsData} feedVersion={feedVersion} />
            </motion.div>
          </main>
        } />
        
        <Route path="/about" element={<AboutPage />} />
        <Route path="/report" element={<ReportIP addToast={addToast} />} />
        <Route path="/profile/:username?" element={<Profile addToast={addToast} />} />
        <Route path="/thanks" element={<ThanksPage />} />
      </Routes>

      <ToastContainer toasts={toasts} />
      <Footer />
    </AuthProvider>
  )
}
