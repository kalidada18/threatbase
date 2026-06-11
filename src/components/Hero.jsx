import { useCallback, useRef } from 'react'
import { Search, Database, Github } from 'lucide-react'
import { scanIndicatorLogic } from '../scanner'

export default function Hero({
  scanInput,
  setScanInput,
  setScanResult,
  setIsScanning,
  setShowReport,
  feedVersion,
}) {
  const btnRef = useRef(null)

  const handleScan = useCallback(async () => {
    const raw = scanInput.trim()
    if (!raw) return

    setIsScanning(true)
    setShowReport(true)
    setScanResult(null)

    // Artificial delay for the scanning UI effect
    const result = await scanIndicatorLogic(raw, feedVersion)
    await new Promise((r) => setTimeout(r, 1600))

    setScanResult(result)
    setIsScanning(false)

    // Smooth scroll to the report section
    const section = document.getElementById('report-section')
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [scanInput, feedVersion, setScanResult, setIsScanning, setShowReport])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') handleScan()
    },
    [handleScan]
  )

  return (
    <header className="hero" id="dashboard">
      <div className="hero-glow hero-glow-1"></div>
      <div className="hero-glow hero-glow-2"></div>

      <div className="hero-inner">
        <h1>
          Tracking threats <br />
          <span className="hero-highlight">so you don't have to.</span>
        </h1>
        <p className="hero-sub">
          HimalayaFeed aggregates and sanitizes global threat data into a lightweight,
          high-performance blocklist ready for immediate deployment.
        </p>

        {/* Search / Scan Module */}
        <div className="hero-search-wrapper">
          <div className="hero-search" id="lookup">
            <div className="hero-search-row">
              <Search className="hero-search-icon" size={16} aria-hidden="true" />
              <label htmlFor="ip-input" className="sr-only">Search indicator</label>
              <input
                type="text"
                className="hero-search-input"
                id="ip-input"
                placeholder="Scan IP, Domain, Hash, or URL..."
                autoComplete="off"
                spellCheck="false"
                aria-label="Search threat indicator"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="hero-search-btn"
                id="scan-btn"
                onClick={handleScan}
                ref={btnRef}
              >
                <span>Scan</span>
              </button>
            </div>
          </div>
        </div>

        <div className="hero-actions">
          <a href="#feeds" className="btn btn-primary">
            <Database size={16} /> Access Database
          </a>
          <a href="https://github.com/kalidada18/himalayafeed" className="btn btn-outline" target="_blank" rel="noopener">
            <Github size={16} /> GitHub
          </a>
        </div>
      </div>
    </header>
  )
}
