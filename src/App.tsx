import { useState, useEffect, useCallback, useRef } from 'react'
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
import NotFound1 from './components/ui/8bit-not-found1'
import Profile from './components/Profile'
import TermsPage from './components/TermsPage'
import PrivacyPage from './components/PrivacyPage'
import ContributorsPage from './components/ContributorsPage'
import { AuthProvider } from './AuthContext'
import { getBaseUrl, formatSyncTime, animateValue } from './utils'
import { scanIndicatorLogic } from './scanner'
import { useSEO } from './useSEO'
import TurnstileModal from './components/TurnstileModal'
import InitialVerification from './components/InitialVerification'

export default function App() {
  const [statsData, setStatsData] = useState(null)
  const [feedVersion, setFeedVersion] = useState(Date.now())
  const [syncTime, setSyncTime] = useState('Live Mode')

  // SEO for homepage
  const location = useLocation()
  useSEO({
    title: 'Threatbase — Real-Time Threat Intelligence & IOC Blocklists',
    description: 'Access real-time threat data, scan IPs and domains, and deploy high-performance blocklists. Community-driven threat intelligence platform for cybersecurity defenders.',
    path: location.pathname,
  })

  // Scan state (shared between Hero and ReportScanner)
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const lastScanTime = useRef<number>(0)
  const SCAN_COOLDOWN = 3000 // 3 seconds

  // Initial verification
  const [isHumanVerified, setIsHumanVerified] = useState(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    return isLocal || sessionStorage.getItem('human_verified') === 'true'
  })

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
    let raw = scanInput.trim()
    if (!raw) return

    const now = Date.now()
    if (now - lastScanTime.current < SCAN_COOLDOWN) {
      const remaining = Math.ceil((SCAN_COOLDOWN - (now - lastScanTime.current)) / 1000)
      addToast(`Please wait ${remaining}s before scanning again.`, 'error')
      return
    }

    if (raw.length > 255) {
      addToast('Input is too long. Please enter a valid indicator.', 'error')
      return
    }

    lastScanTime.current = now

    // Perform scan directly without Turnstile
    performScan()
  }, [scanInput, addToast])

  const performScan = useCallback(async () => {
    let raw = scanInput.trim().replace(/[<>"'&]/g, '')
    
    setIsScanning(true)
    setShowReport(true)
    setScanResult(null)

    setTimeout(() => {
      const section = document.getElementById('report-section')
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)

    const result = await scanIndicatorLogic(raw, feedVersion)
    await new Promise((r) => setTimeout(r, 1600))

    setScanResult(result)
    setIsScanning(false)
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
  }, [location.hash])

  if (!isHumanVerified) {
    return <InitialVerification onSuccess={(token) => {
      sessionStorage.setItem('human_verified', 'true')
      setIsHumanVerified(true)
    }} />
  }

  return (
    <AuthProvider>
      <Navbar />

      <Routes>
        <Route path="/" element={
          <main id="main-content">
            <HeroSection scanInput={scanInput} setScanInput={setScanInput} handleScan={handleScan} statsData={statsData} />

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
              <ReportScanner
                isScanning={isScanning}
                showReport={showReport}
                scanInput={scanInput}
                scanResult={scanResult}
                addToast={addToast}
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
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/report" element={<ReportIP addToast={addToast} />} />
        <Route path="/contributors" element={<ContributorsPage />} />
        <Route path="/profile/:username?" element={<Profile addToast={addToast} />} />
        <Route path="/thanks" element={<ThanksPage />} />
        <Route path="*" element={<NotFound1 />} />
      </Routes>

      <ToastContainer toasts={toasts} />
      <Footer />
    </AuthProvider>
  )
}
