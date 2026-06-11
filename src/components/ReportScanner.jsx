import { useEffect, useRef } from 'react'
import { Search, ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react'

export default function ReportScanner({ scanResult, isScanning, showReport, scanInput }) {
  const progressRef = useRef(null)

  // Animate progress bar when scanning starts
  useEffect(() => {
    if (isScanning && progressRef.current) {
      const el = progressRef.current
      el.style.width = '0%'
      el.style.transition = 'none'
      requestAnimationFrame(() => {
        el.style.transition = 'width 1.5s cubic-bezier(0.1, 0.8, 0.3, 1)'
        el.style.width = '100%'
      })
    }
  }, [isScanning])

  if (!showReport) return null

  const ip = scanResult?.ip || scanInput?.trim() || ''
  const isMalicious = scanResult?.isMalicious
  const type = scanResult
    ? isMalicious
      ? 'danger'
      : scanResult.type === 'invalid'
        ? 'warn'
        : 'safe'
    : null

  // Build external links
  let vtHref = '#'
  let abuseHref = '#'
  let showVt = false
  let showAbuse = false
  if (scanResult) {
    const { isIP, isIPv6, isHash, isURL, isDomain } = scanResult
    if (isIP || isIPv6) {
      vtHref = 'https://www.virustotal.com/gui/ip-address/' + encodeURIComponent(ip)
      abuseHref = 'https://www.abuseipdb.com/check/' + encodeURIComponent(ip)
      showVt = true
      showAbuse = true
    } else if (isHash) {
      vtHref = 'https://www.virustotal.com/gui/file/' + ip
      showVt = true
    } else if (isURL) {
      vtHref = 'https://www.virustotal.com/gui/search/' + encodeURIComponent(ip)
      showVt = true
    } else if (isDomain) {
      vtHref = 'https://www.virustotal.com/gui/domain/' + ip
      showVt = true
    }
  }

  // Icon mapping
  const StatusIcon = type === 'danger' ? ShieldAlert : type === 'safe' ? ShieldCheck : AlertTriangle

  return (
    <section className={`report-section${showReport ? ' show' : ''}`} id="report-section" aria-live="polite">
      <div className="report-container">
        {/* Loading / Scanning State */}
        <div className={`scan-overlay${isScanning ? ' active' : ''}`} id="scan-overlay">
          <div className="minimal-scanner">
            <Search size={24} />
          </div>
          <div className="scan-title" id="scan-title-text">
            {isScanning ? 'Checking blocklists...' : 'Initializing scan...'}
          </div>
          <div className="scan-ip" id="scan-ip">{ip}</div>
          <div className="scan-progress-bar">
            <div className="scan-progress-fill" ref={progressRef}></div>
          </div>
        </div>

        {/* Result Card */}
        {scanResult && !isScanning && (
          <div className="report-card show" id="report-card">
            <div className={`rc-glow rc-glow-${type}`} id="rc-glow"></div>
            <div className={`rc-header rc-header-${type}`} id="rc-header">
              <div className="rc-h-left">
                <div className={`rc-h-icon rc-icon-${type}`} id="rc-icon-bg">
                  <StatusIcon size={18} />
                </div>
                <div className="rc-h-text">
                  <div className="rc-h-sub" id="rc-sub">
                    {type === 'danger'
                      ? 'Malicious Indicator Confirmed'
                      : type === 'safe'
                        ? 'Not found in active blocklists'
                        : 'Invalid format'}
                  </div>
                  <div className="rc-h-ip" id="rc-ip">{ip}</div>
                </div>
              </div>
              <div
                className={`rc-h-badge ${type === 'danger' ? 'badge-danger' : type === 'safe' ? 'badge-safe' : 'badge-warn'}`}
                id="rc-badge"
              >
                {type === 'danger' ? 'THREAT DETECTED' : type === 'safe' ? 'NOT LISTED' : 'WARNING'}
              </div>
            </div>

            <div className="rc-body">
              <div className="rc-grid">
                <div className="rc-assessment-panel" id="rc-assessment">
                  {type === 'danger' ? (
                    <>
                      <div className="assessment-title text-red">Action Recommended</div>
                      <p>
                        The indicator <code>{ip}</code> has been positively identified as malicious by the
                        HimalayaFeed global sensor network. It is currently active in our threat intelligence
                        blocklists.
                      </p>
                    </>
                  ) : type === 'safe' ? (
                    <>
                      <div className="assessment-title text-green">Clean Result</div>
                      <p>
                        The indicator <code>{ip}</code> is <strong>not currently listed</strong> in the active
                        HimalayaFeed threat database.
                      </p>
                    </>
                  ) : (
                    <p>Please enter a valid IPv4 address, Domain, SHA-256 Hash, or URL.</p>
                  )}
                </div>

                <div className="rc-side">
                  <div className="rc-side-label">Intelligence Sources</div>
                  <div className="rc-ext" id="rc-ext">
                    {showVt && (
                      <a className="rc-ext-btn vt-btn" id="ext-vt" href={vtHref} target="_blank" rel="noopener">
                        <img
                          src="https://www.virustotal.com/gui/images/favicon.png"
                          alt=""
                          className="vt-icon"
                          aria-hidden="true"
                        />{' '}
                        VirusTotal
                      </a>
                    )}
                    {showAbuse && (
                      <a className="rc-ext-btn abuse-btn" id="ext-abuse" href={abuseHref} target="_blank" rel="noopener">
                        <AlertOctagon size={16} /> AbuseIPDB
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
