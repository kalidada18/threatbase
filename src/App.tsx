import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { HeroSection } from './components/blocks/hero-section-5'
import ReportScanner from './components/ReportScanner'
import Stats from './components/Stats'
import Feeds from './components/Feeds'
import HowItWorks from './components/HowItWorks'
import Analytics from './components/Analytics'
import Footer from './components/Footer'
import ToastContainer from './components/ToastContainer'
import Navbar from './components/Navbar'

// Route-level code splitting: each non-home page (and its heavy deps — e.g.
// three.js + tsparticles on /thanks) loads in its own chunk on demand instead
// of bloating the initial bundle every visitor downloads.
const AboutPage = lazy(() => import('./components/AboutPage'))
const ReportIP = lazy(() => import('./components/ReportIP'))
const ThanksPage = lazy(() => import('./components/ThanksPage'))
const NotFound = lazy(() => import('./components/ui/not-found'))
const Profile = lazy(() => import('./components/Profile'))
const TermsPage = lazy(() => import('./components/TermsPage'))
const PrivacyPage = lazy(() => import('./components/PrivacyPage'))
const PolicyPage = lazy(() => import('./components/PolicyPage'))
const ContributorsPage = lazy(() => import('./components/ContributorsPage'))
const ApiDocsPage = lazy(() => import('./components/ApiDocsPage'))
import { AuthProvider } from './AuthContext'
import { getBaseUrl, formatSyncTime } from './utils'
import { scanIndicatorLogic } from './scanner'
import { useSEO } from './useSEO'
import InitialVerification from './components/InitialVerification'

/** Homepage-only SEO. Scoped to the index route so it never overrides subpage meta. */
function HomeSeo() {
  useSEO({
    title: 'Threatbase: Real-Time Threat Intelligence & Free IOC Blocklists',
    description: 'Free, community-driven threat intelligence. Scan any IP, domain, URL, or file hash for malicious activity and download real-time IOC blocklists for your firewall, IDS/IPS, and SIEM.',
    path: '/',
    keywords: 'threat intelligence, free IOC feed, IP blocklist, check malicious IP, domain reputation, malware hash lookup, open source threat intelligence, abuse IP database, IOC blocklist, SIEM threat feed',
  })
  return null
}

export default function App() {
  const [statsData, setStatsData] = useState(null)
  const [feedVersion, setFeedVersion] = useState(Date.now())
  const [syncTime, setSyncTime] = useState('Live Mode')

  const location = useLocation()

  // Scan state (shared between Hero and ReportScanner)
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const lastScanTime = useRef<number>(0)
  const SCAN_COOLDOWN = 300 // 300ms

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

    // Validate format before starting scan
    const isURL = /^https?:\/\/.+/.test(raw)
    const isHash = /^[a-fA-F0-9]{32}(?:[a-fA-F0-9]{8})?(?:[a-fA-F0-9]{24})?$/.test(raw)
    const ip = isURL && !isHash ? raw : raw.toLowerCase()
    const isIP = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)
    const isIPv6 = ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip) && !ip.includes('/')
    const isCIDR = ip.includes('/') && /^[a-fA-F0-9:.]+\/\d{1,3}$/.test(ip)
    const isDomain = !isIP && !isIPv6 && !isCIDR && !isURL && !isHash && /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.[A-Za-z]{2,}$/.test(ip)

    if (!isIP && !isIPv6 && !isCIDR && !isDomain && !isHash && !isURL) {
      addToast('Invalid indicator format. Please enter a valid IPv4, IPv6, Domain, URL, or Hash.', 'error')
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

    // statsData is passed through so the scanner can resolve the chunk layout of
    // the large domain/hash feeds without re-fetching stats.json.
    const result = await scanIndicatorLogic(raw, feedVersion, statsData)
    setScanResult(result)
    setIsScanning(false)
  }, [scanInput, feedVersion, statsData])


  // Boot & Poll: fetch stats.json
  useEffect(() => {
    const GITHUB_RAW = getBaseUrl()
    let cancelled = false

    const loadStats = async () => {
      try {
        const r = await fetch(GITHUB_RAW + 'stats.json?_=' + Date.now())
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json()
        if (cancelled) return
        setStatsData(d)
        setFeedVersion(d.last_updated || Date.now())
        setSyncTime(formatSyncTime(d.last_updated))
      } catch (err: any) {
        if (!cancelled) {
          console.error('stats.json unavailable on GitHub Raw:', err.message)
          setSyncTime('Live Mode')
        }
      }
    }

    loadStats()
    const intervalId = setInterval(loadStats, 5 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadStats() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
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
    <MotionConfig reducedMotion="user">
    <AuthProvider>
      <Navbar />

      <Suspense fallback={<div className="min-h-[100dvh]" aria-hidden />}>
      <Routes>
        <Route path="/" element={
          <main id="main-content">
            <HomeSeo />
            <HeroSection scanInput={scanInput} setScanInput={setScanInput} handleScan={handleScan} />

            <ReportScanner
              isScanning={isScanning}
              showReport={showReport}
              scanInput={scanInput}
              scanResult={scanResult}
              addToast={addToast}
            />

            {/* Section order: Hero → HowItWorks → Stats → Feeds → Analytics.
                Source credits live on the dedicated /thanks Intel Sources page.
                Each section animates itself on scroll, so no wrapper here. */}
            <HowItWorks />
            <Stats statsData={statsData} />
            <Feeds statsData={statsData} />
            <Analytics statsData={statsData} feedVersion={feedVersion} />
          </main>
        } />
        
        <Route path="/about" element={<AboutPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/policy" element={<PolicyPage />} />
        <Route path="/report" element={<ReportIP addToast={addToast} />} />
        <Route path="/contributors" element={<ContributorsPage />} />
        <Route path="/api" element={<ApiDocsPage />} />
        {/* Profiles are private to their owner — there is no public/by-username
            view. Only the owner's own profile is reachable, at /profile. Any
            username-bearing URL (/u/:username, /profile/:username) is gone so the
            GUI never advertises a browsable profile path. */}
        <Route path="/profile" element={<Profile addToast={addToast} />} />
        <Route path="/thanks" element={<ThanksPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>

      <ToastContainer toasts={toasts} />
      <Footer />
    </AuthProvider>
    </MotionConfig>
  )
}
