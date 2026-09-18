import { useState, useEffect, useCallback, useRef, lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { MotionConfig, AnimatePresence } from 'framer-motion'
import { HeroSection, RECENT_EVENT } from './components/blocks/hero-section-5'
import ReportScanner from './components/ReportScanner'
import Footer from './components/Footer'
import ToastContainer from './components/ToastContainer'
import Navbar from './components/Navbar'
import { PageTransition } from './components/motion/PageTransition'

// Route-level code splitting: each non-home page (and its heavy deps — e.g.
// three.js + tsparticles on /thanks) loads in its own chunk on demand instead
// of bloating the initial bundle every visitor downloads.
const AboutPage = lazy(() => import('./components/AboutPage'))
const ReportIP = lazy(() => import('./components/ReportIP'))
const ThanksPage = lazy(() => import('./components/ThanksPage'))
const NotFound = lazy(() => import('./components/ui/not-found'))
const FaqPage = lazy(() => import('./components/FaqPage'))
const Profile = lazy(() => import('./components/Profile'))
const TermsPage = lazy(() => import('./components/TermsPage'))
const PrivacyPage = lazy(() => import('./components/PrivacyPage'))
const PolicyPage = lazy(() => import('./components/PolicyPage'))
const ContributorsPage = lazy(() => import('./components/ContributorsPage'))
const ImprovementsPage = lazy(() => import('./components/ImprovementsPage'))
const HallOfShamePage = lazy(() => import('./components/HallOfShamePage'))
const ApiDocsPage = lazy(() => import('./components/ApiDocsPage'))
const PricingPage = lazy(() => import('./components/PricingPage'))
const ThreatFeedPage = lazy(() => import('./components/ThreatFeedPage'))
// Bulk CSV hunt — lazy: only visitors who open it download the bulk code.
const BulkScanner = lazy(() => import('./components/BulkScanner'))
// Home's below-the-fold band (feed destinations, Pro). Split out so the hero
// console is not held up by it.
const HomeSections = lazy(() => import('./components/blocks/LandingSections'))
import { AuthProvider } from './AuthContext'
import { getBaseUrl, formatSyncTime, feedPath } from './utils'
import { scanIndicatorLogic, classifyIndicator } from './scanner'
import { useSEO } from './useSEO'

/**
 * Programmatic smooth scroll that survives Lenis.
 *
 * Lenis rewrites the window scroll position from its own RAF loop, so a native
 * `scrollIntoView({behavior:'smooth'})` gets overwritten every frame and the
 * page barely moves. Offer the scroll to Lenis first (SmoothScroll claims the
 * event with preventDefault) and only do it ourselves when nothing answers,
 * which is the reduced-motion case where Lenis is never installed.
 */
function smoothScrollTo(el: Element, offset = -96) {
  const claimed = !window.dispatchEvent(
    new CustomEvent('tb:route-scroll', { detail: { scrollTo: el, offset }, cancelable: true })
  )
  if (!claimed) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Homepage-only SEO. Scoped to the index route so it never overrides subpage meta. */
function HomeSeo() {
  useSEO({
    title: 'Threatbase | Cyber Threat Intelligence Platform',
    description: 'Threatbase is a cyber threat intelligence platform for defenders. Hunt any IP, domain, URL or file hash in real time and deploy curated IOC feeds to your firewall, IDS and SIEM — free to start, Pro for precision at scale.',
    path: '/',
    keywords: 'threat intelligence, free IOC feed, IP blocklist, check malicious IP, domain reputation, malware hash lookup, open source threat intelligence, abuse IP database, IOC blocklist, SIEM threat feed',
  })
  return null
}

/**
 * 404-route SEO. Lives at the route, NOT inside NotFound: that component is
 * reused as Profile's 403 view (Profile.tsx ~640) which carries its own
 * useSEO — a hook inside the shared component would double-fire and clobber it.
 */
function NotFoundSeo() {
  useSEO({
    title: '404 — Page Not Found | Threatbase',
    description: 'This page isn’t in our index. Scan IPs, domains, URLs and hashes against live threat intelligence, or grab free IOC blocklists instead.',
    path: '/404',
    noindex: true,
  })
  return null
}

/**
 * Per-route loading boundary, INSIDE PageTransition: the exiting page animates
 * out while the lazy chunk downloads, instead of a blank full-screen gap
 * replacing AnimatePresence (which killed the exit transition). Skeleton is
 * page-shaped (tasteskill §4.5), not an empty min-h box.
 */
const pageSkeleton = (
  <div className="min-h-[100dvh] pt-28 pb-20" aria-hidden>
    <div className="mx-auto max-w-7xl px-6 space-y-6">
      <div className="h-10 w-64 rounded-lg bg-white/[0.05] animate-pulse" />
      <div className="h-4 w-full max-w-xl rounded bg-white/[0.04] animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
        {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl bg-white/[0.04] animate-pulse" />)}
      </div>
    </div>
  </div>
)
const page = (el: ReactNode) => (
  <PageTransition><Suspense fallback={pageSkeleton}>{el}</Suspense></PageTransition>
)

export default function App() {
  const [statsData, setStatsData] = useState(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [feedVersion, setFeedVersion] = useState(Date.now())
  const [, setSyncTime] = useState('Live Mode')

  const location = useLocation()

  // Scan state (shared between Hero and ReportScanner)
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showReport, setShowReport] = useState(false)
  // Bulk hunt lives in its own state: results NEVER flow through scanResult,
  // which drives the single-result card, the arrival pulse, and ReportScanner.
  const [bulkOpen, setBulkOpen] = useState(false)
  const prevPathRef = useRef<string>(location.pathname)

  // Toast state
  const [toasts, setToasts] = useState<any[]>([])

  const addToast = useCallback((message: string, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev: any) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev: any) => prev.filter((t: any) => t.id !== id))
    }, 4000)
  }, [])

  // inputOverride lets example chips scan immediately: setState + call in the
  // same tick would otherwise read the stale scanInput closure.
  const handleScan = useCallback(async (inputOverride?: string) => {
    const raw = (inputOverride ?? scanInput).trim()
    if (!raw) return
    // In-flight double-submit is a no-op, not an error: the Hunt button shows
    // the scan state, so there is nothing to "wait" the user from.
    if (isScanning) return

    if (raw.length > 255) {
      addToast('Input is too long. Please enter a valid indicator.', 'error')
      return
    }

    // One source of truth for format validation — the scanner's own parser,
    // refang-aware (App used to carry a third hand-rolled copy of these
    // regexes; drift between them is how pasted hxxp IOCs started failing).
    if (classifyIndicator(raw).type === 'invalid') {
      addToast('Invalid indicator format. Please enter a valid IPv4, IPv6, Domain, URL, or Hash.', 'error')
      return
    }

    // Perform scan directly without Turnstile
    performScan(raw)
  }, [scanInput, addToast, isScanning])

  const performScan = useCallback(async (inputOverride?: string) => {
    const raw = (inputOverride ?? scanInput).trim().replace(/[<>"'&]/g, '')

    setIsScanning(true)
    setShowReport(true)
    setScanResult(null)

    // Every scan brings the report into view, clean or malicious: the visitor
    // hit Hunt to SEE a verdict. Fires on the ghost loader rather than when the
    // result lands, so there is no second jump under the reader. `block:start`
    // (not center) because the finished report is taller than the viewport, and
    // centering it puts the verdict itself above the fold.
    setTimeout(() => {
      const section = document.getElementById('report-section')
      if (section) smoothScrollTo(section)
    }, 50)

    // Server-side verdict via /api/lookup: a domain/URL hunt used to download
    // a whole 36 MB feed chunk into the browser just to binary-search one
    // line. The verdict is ~200 bytes and KV-cached at the edge. Falls back to
    // the local scanner when the function is unreachable (dev server without
    // functions, network blip) — slower there, never dead.
    let result: any = null
    try {
      try {
        const r = await fetch(`/api/lookup?value=${encodeURIComponent(raw)}`, { signal: AbortSignal.timeout(20_000) })
        if (r.ok) {
          const j = await r.json()
          if (j?.data) result = j.data
        }
      } catch { /* fall through to local scan */ }
      if (!result) {
        // statsData is passed through so the scanner can resolve the chunk layout of
        // the large domain/hash feeds without re-fetching stats.json.
        result = await scanIndicatorLogic(raw, feedVersion, statsData)
      }
      setScanResult(result)
    } catch (err) {
      // scanIndicatorLogic can throw (e.g. a feed chunk fetch fails). Without
      // this, setIsScanning(false) was unreachable and the caller —
      // fire-and-forget from handleScan and the ?search= effect — never saw
      // the rejection: the hero spinner spun forever.
      console.error('Scan failed:', err)
      setShowReport(false)
      addToast('Scan failed. Please try again.', 'error')
    } finally {
      setIsScanning(false)
    }

    // Recent-hunts memory for the hero's keyboard console (cap 5, dedupe).
    if (result) {
      try {
        const item = { value: raw, type: result.type, malicious: !!result.isMalicious }
        const prev: any[] = JSON.parse(localStorage.getItem('tb:recent') || '[]')
        localStorage.setItem('tb:recent', JSON.stringify([item, ...prev.filter((r) => r.value !== raw)].slice(0, 5)))
        window.dispatchEvent(new Event(RECENT_EVENT))
      } catch { /* private mode / quota: recent row is an enhancement, not a feature */ }
    }
  }, [scanInput, feedVersion, statsData, addToast])


  // Boot & Poll: fetch stats.json. Hoisted (not just inside the effect) so the
  // /threatfeed retry button can re-trigger the same load after a failure.
  const loadStats = useCallback(async () => {
    const GITHUB_RAW = getBaseUrl()
    try {
      // Bounded: a hung GitHub Raw fetch neither resolves nor rejects, so
      // statsFailed was never set and /threatfeed sat in its loading state
      // forever.
      const r = await fetch(GITHUB_RAW + feedPath('stats.json') + '?_=' + Date.now(), {
        signal: AbortSignal.timeout(20_000),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      setStatsData(d)
      setFeedVersion(d.last_updated || Date.now())
      setSyncTime(formatSyncTime(d.last_updated))
      setStatsFailed(false)
    } catch (err: any) {
      console.error('stats.json unavailable on GitHub Raw:', err.message)
      setSyncTime('Live Mode')
      setStatsFailed(true)
    }
  }, [])

  useEffect(() => {
    loadStats()
    const intervalId = setInterval(loadStats, 5 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadStats() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadStats])

  // Auto-scan from ?search= / ?q=. Runs whenever the query or the route
  // changes — not just on first mount — so Hall-of-Shame and other deep links
  // work both on fresh page loads and in-app navigation. No verification gate:
  // searching is public. performScan is called directly instead of faking a
  // scan-btn click, since the button may not be mounted yet when this fires.
  const lastAutoScan = useRef<string | null>(null)
  useEffect(() => {
    if (location.pathname !== '/') return
    const urlParams = new URLSearchParams(location.search)
    const searchParam = urlParams.get('search') || urlParams.get('q')
    if (!searchParam || searchParam === lastAutoScan.current) return
    lastAutoScan.current = searchParam
    setScanInput(searchParam)
    performScan(searchParam)
  }, [location, performScan])

  // Bring the bulk panel into view when opened. It is a lazy chunk, so the
  // section usually isn't mounted yet on the toggle click — retry like the
  // hash-scroll effect below rather than silently no-oping.
  useEffect(() => {
    if (!bulkOpen) return
    const deadline = Date.now() + 3000
    const timer = setInterval(() => {
      if (Date.now() > deadline) return clearInterval(timer)
      const el = document.getElementById('bulk-section')
      if (el) { clearInterval(timer); smoothScrollTo(el) }
    }, 100)
    return () => clearInterval(timer)
  }, [bulkOpen])

  // Scroll to hash on page load or navigation. Routes are lazy chunks behind
  // AnimatePresence transitions, so the target element usually does NOT exist
  // yet when location changes (e.g. /threatfeed#feeds from the hero). Retry
  // until the section mounts instead of silently no-oping.
  useEffect(() => {
    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1))
      const deadline = Date.now() + 3000
      const timer = setInterval(() => {
        const element = document.getElementById(id)
        if (Date.now() > deadline) return clearInterval(timer)
        if (element) {
          clearInterval(timer)
          smoothScrollTo(element)
        }
      }, 100)
      return () => clearInterval(timer)
    } else if (location.pathname !== prevPathRef.current) {
      // Route change (not initial load): reset scroll to the top. The custom
      // event lets Lenis (when active) fast-forward its internal scroll
      // position instead of fighting the native jump.
      window.dispatchEvent(new CustomEvent('tb:route-scroll', { detail: { scrollTo: 'top' } }))
      window.scrollTo(0, 0)
      prevPathRef.current = location.pathname
    }
  }, [location])

  // The fake CF interstitial is gone: bot protection is the real Turnstile
  // widget on the login path (ensureTurnstileLogin, server-redeemed at
  // /api/turnstile-verify) plus the zone's own Cloudflare challenge rules.
  return (
    <MotionConfig reducedMotion="user">
    <AuthProvider>

      <Navbar />

      <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={
          <PageTransition>
          <main id="main-content">
            <HomeSeo />
            <HeroSection scanInput={scanInput} setScanInput={setScanInput} handleScan={handleScan} isScanning={isScanning} scanResult={scanResult} openBulk={() => setBulkOpen(true)} />

            <ReportScanner
              isScanning={isScanning}
              showReport={showReport}
              scanInput={scanInput}
              scanResult={scanResult}
              addToast={addToast}
            />

            {bulkOpen && (
              <Suspense fallback={null}>
                <BulkScanner
                  addToast={addToast}
                  onClose={() => setBulkOpen(false)}
                />
              </Suspense>
            )}

            {/* Below the console: feed destinations, then Pro. Stat counters
                stay on /threatfeed, the explainer loop on /about. */}
            <Suspense fallback={null}>
              <HomeSections />
            </Suspense>
          </main>
          </PageTransition>
        } />

        <Route path="/threatfeed" element={page(<ThreatFeedPage statsData={statsData} feedVersion={feedVersion} statsFailed={statsFailed} onRetryStats={loadStats} />)} />
        <Route path="/about" element={page(<AboutPage />)} />
        <Route path="/terms" element={page(<TermsPage />)} />
        <Route path="/privacy" element={page(<PrivacyPage />)} />
        <Route path="/policy" element={page(<PolicyPage />)} />
        <Route path="/report" element={page(<ReportIP addToast={addToast} />)} />
        <Route path="/contributors" element={page(<ContributorsPage />)} />
        <Route path="/improvements" element={page(<ImprovementsPage />)} />
        <Route path="/hall-of-shame" element={page(<HallOfShamePage />)} />
        <Route path="/api" element={page(<ApiDocsPage />)} />
        <Route path="/pricing" element={page(<PricingPage />)} />
        {/* Profiles are private to their owner — there is no public/by-username
            view. Only the owner's own profile is reachable, at /profile. Any
            username-bearing URL (/u/:username, /profile/:username) is gone so the
            GUI never advertises a browsable profile path. */}
        <Route path="/profile" element={page(<Profile addToast={addToast} />)} />
        <Route path="/thanks" element={page(<ThanksPage />)} />
        <Route path="/faq" element={page(<FaqPage />)} />
        <Route path="*" element={page(<><NotFoundSeo /><NotFound /></>)} />
      </Routes>
      </AnimatePresence>

      <ToastContainer toasts={toasts} />
      <Footer />
    </AuthProvider>
    </MotionConfig>
  )
}
