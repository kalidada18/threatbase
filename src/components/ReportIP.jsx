import { useState, useEffect, useCallback, useRef } from 'react'
import { Flag, Globe, Tag, MessageSquare, Send, List, Inbox, ChevronLeft, ChevronRight } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo, getCategoryBadge, escapeHtml } from '../utils'

const REPORT_PAGE_SIZE = 10
const SUBMIT_COOLDOWN = 15000

function handleSpotlight(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
  e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
}

export default function ReportIP({ addToast }) {
  const [ipValue, setIpValue] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const lastSubmitRef = useRef(0)

  // Reported IPs table state
  const [reports, setReports] = useState([])
  const [reportCount, setReportCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)

  const totalPages = Math.ceil(reportCount / REPORT_PAGE_SIZE)

  const loadReportedIPs = useCallback(async (pg = 0) => {
    if (!supabaseClient) return
    const p = Math.max(0, pg)
    setPage(p)
    setLoading(true)
    setIsEmpty(false)

    const from = p * REPORT_PAGE_SIZE
    const to = from + REPORT_PAGE_SIZE - 1

    try {
      const { data, error, count } = await supabaseClient
        .from('reported_ips')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      if (!data || data.length === 0) {
        if (p === 0) {
          setIsEmpty(true)
          setReports([])
          setReportCount(0)
        } else {
          loadReportedIPs(p - 1)
          return
        }
      } else {
        setReports(data)
        setReportCount(count)
        setIsEmpty(false)
      }
    } catch (err) {
      console.error('Failed to load reports:', err)
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => loadReportedIPs(0), 500)
    return () => clearTimeout(timer)
  }, [loadReportedIPs])

  const handleSubmit = useCallback(async () => {
    if (!supabaseClient) {
      addToast('Supabase connection unavailable', 'error')
      return
    }

    const now = Date.now()
    if (now - lastSubmitRef.current < SUBMIT_COOLDOWN) {
      const remaining = Math.ceil((SUBMIT_COOLDOWN - (now - lastSubmitRef.current)) / 1000)
      addToast(`Please wait ${remaining}s before submitting again`, 'error')
      return
    }

    if (!ipValue.trim()) {
      addToast('Please enter an IP address', 'error')
      return
    }

    const isValidIP =
      /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ipValue.trim()) ||
      (ipValue.includes(':') && /^[0-9a-fA-F:]+$/.test(ipValue.trim()))

    if (!isValidIP) {
      addToast('Please enter a valid IPv4 or IPv6 address', 'error')
      return
    }

    if (!category) {
      addToast('Please select a threat category', 'error')
      return
    }

    setSubmitting(true)

    try {
      const { error } = await supabaseClient
        .from('reported_ips')
        .insert([{ ip: ipValue.trim(), category, comment: comment.trim() }])

      if (error) throw error

      lastSubmitRef.current = Date.now()
      addToast('Report submitted successfully!', 'success')
      setIpValue('')
      setCategory('')
      setComment('')
      loadReportedIPs(0)
    } catch (err) {
      console.error('Submit error:', err)
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [ipValue, category, comment, addToast, loadReportedIPs])

  return (
    <section className="section" id="report-ip">
      <div className="section-head">
        <div className="section-label">Community</div>
        <h2 className="section-title"><Flag size={22} /> Report Malicious IP</h2>
        <p className="section-desc">
          Help strengthen our threat intelligence by reporting suspicious IPs, selecting a category,
          and leaving notes for our analysts.
        </p>
      </div>

      {/* Submit Form Card */}
      <div className="report-ip-card" onMouseMove={handleSpotlight}>
        <div className="report-ip-form active" id="report-ip-form">
          <div className="rip-field">
            <label className="rip-label" htmlFor="rip-ip-input"><Globe size={14} /> IP Address</label>
            <input
              type="text"
              id="rip-ip-input"
              className="rip-input"
              placeholder="e.g. 192.168.1.1"
              autoComplete="off"
              spellCheck="false"
              value={ipValue}
              onChange={(e) => setIpValue(e.target.value)}
            />
          </div>

          <div className="rip-field">
            <label className="rip-label" htmlFor="rip-category"><Tag size={14} /> Category</label>
            <select
              id="rip-category"
              className="rip-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="" disabled>Select threat category...</option>
              <option value="Brute Force">Brute Force</option>
              <option value="Port Scan">Port Scan</option>
              <option value="Phishing">Phishing</option>
              <option value="Malware / C2">Malware / C2</option>
              <option value="DDoS">DDoS</option>
              <option value="Spam">Spam</option>
              <option value="Exploit Attempt">Exploit Attempt</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="rip-field">
            <label className="rip-label" htmlFor="rip-comment"><MessageSquare size={14} /> Comment</label>
            <textarea
              id="rip-comment"
              className="rip-textarea"
              rows="4"
              placeholder="Describe the suspicious activity..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            ></textarea>
          </div>

          <button
            className="btn btn-primary rip-submit"
            id="rip-submit-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span
                  className="spinner"
                  style={{
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    width: '14px',
                    height: '14px',
                    display: 'inline-block',
                    borderRadius: '50%',
                    borderWidth: '2px',
                    borderStyle: 'solid',
                    animation: 'spin 1s linear infinite',
                  }}
                ></span>{' '}
                Submitting...
              </>
            ) : (
              <>
                <Send size={16} /> Submit Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reported IPs Table */}
      <div className="reported-ips-wrap" id="reported-ips-wrap" onMouseMove={handleSpotlight}>
        <div className="reported-ips-header">
          <h3 className="reported-ips-title"><List size={18} /> Community Reported IPs</h3>
          <span className="reported-ips-count" id="reported-ips-count">
            {reportCount > 0 ? `${fmt(reportCount)} reports` : ''}
          </span>
        </div>

        {loading ? (
          <div className="reported-ips-table-container">
            <table className="rip-table">
              <thead>
                <tr>
                  <th>IP Address</th>
                  <th>Category</th>
                  <th>Comment</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                <tr className="rip-loading-row">
                  <td colSpan="4">
                    <div className="rip-loading">
                      <div className="rip-loading-spinner"></div> Loading reports...
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : isEmpty ? (
          <div className="rip-empty" id="rip-empty">
            <Inbox size={40} />
            <p>No reports yet. Be the first to report a malicious IP!</p>
          </div>
        ) : (
          <>
            <div className="reported-ips-table-container">
              <table className="rip-table" id="rip-table">
                <thead>
                  <tr>
                    <th>IP Address</th>
                    <th>Category</th>
                    <th>Comment</th>
                    <th>Reported</th>
                  </tr>
                </thead>
                <tbody id="reported-ips-tbody">
                  {reports.map((row) => (
                    <tr key={row.id || row.created_at}>
                      <td className="rip-cell-ip">{row.ip}</td>
                      <td>
                        <span className={`rip-cat-badge ${getCategoryBadge(row.category)}`}>
                          {row.category}
                        </span>
                      </td>
                      <td className="rip-cell-comment" title={row.comment || ''}>
                        {row.comment || '—'}
                      </td>
                      <td className="rip-cell-time">{timeAgo(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="rip-pagination" id="rip-pagination">
                <button
                  className="btn btn-outline rip-page-btn"
                  onClick={() => loadReportedIPs(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="rip-page-info">Page {page + 1} of {totalPages}</span>
                <button
                  className="btn btn-outline rip-page-btn"
                  onClick={() => loadReportedIPs(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
