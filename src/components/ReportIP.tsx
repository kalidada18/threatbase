import { useState, useEffect, useCallback, useRef } from 'react'
import { Flag, Globe, Tag, MessageSquare, Send, List, Inbox, ChevronLeft, ChevronRight } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo, getCategoryBadge } from '../utils'
import { Button } from '@/components/ui/button'

const REPORT_PAGE_SIZE = 10
const SUBMIT_COOLDOWN = 15000

export default function ReportIP({ addToast }: any) {
  const [ipValue, setIpValue] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const lastSubmitRef = useRef(0)

  // Reported IPs table state
  const [reports, setReports] = useState<any[]>([])
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
        setReportCount(count || 0)
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
    } catch (err: any) {
      console.error('Submit error:', err)
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [ipValue, category, comment, addToast, loadReportedIPs])

  return (
    <section className="py-12 md:py-20" id="report-ip">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-12 text-center md:text-left">
          <div className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Community</div>
          <h2 className="text-3xl md:text-4xl font-bold flex items-center justify-center md:justify-start gap-3"><Flag className="text-primary" /> Report Malicious IP</h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl">
            Help strengthen our threat intelligence by reporting suspicious IPs, selecting a category,
            and leaving notes for our analysts.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Submit Form */}
          <div className="lg:col-span-4 rounded-2xl border bg-card shadow-sm p-6">
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground" htmlFor="rip-ip-input">
                  <Globe size={14} /> IP Address
                </label>
                <input
                  type="text"
                  id="rip-ip-input"
                  className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="e.g. 192.168.1.1"
                  autoComplete="off"
                  spellCheck="false"
                  value={ipValue}
                  onChange={(e) => setIpValue(e.target.value)}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground" htmlFor="rip-category">
                  <Tag size={14} /> Category
                </label>
                <select
                  id="rip-category"
                  className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground" htmlFor="rip-comment">
                  <MessageSquare size={14} /> Comment
                </label>
                <textarea
                  id="rip-comment"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  rows={4}
                  placeholder="Describe the suspicious activity..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                ></textarea>
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send size={16} /> Submit Report
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Reported IPs Table */}
          <div className="lg:col-span-8 rounded-2xl border bg-card shadow-sm flex flex-col">
            <div className="p-6 border-b flex items-center justify-between bg-muted/20">
              <h3 className="font-semibold flex items-center gap-2 text-foreground"><List size={18} /> Community Reported IPs</h3>
              <span className="text-sm text-muted-foreground font-medium bg-muted px-3 py-1 rounded-full">
                {reportCount > 0 ? `${fmt(reportCount)} reports` : ''}
              </span>
            </div>

            <div className="flex-1 overflow-x-auto">
              {loading ? (
                <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary mb-4" />
                  <p>Loading reports...</p>
                </div>
              ) : isEmpty ? (
                <div className="p-16 flex flex-col items-center justify-center text-muted-foreground text-center">
                  <Inbox size={48} className="mb-4 opacity-20" />
                  <p className="text-lg">No reports yet.</p>
                  <p className="text-sm">Be the first to report a malicious IP!</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 font-semibold">IP Address</th>
                      <th className="px-6 py-4 font-semibold">Category</th>
                      <th className="px-6 py-4 font-semibold">Comment</th>
                      <th className="px-6 py-4 font-semibold">Reported</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reports.map((row) => (
                      <tr key={row.id || row.created_at} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium">{row.ip}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border">
                            {row.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground truncate max-w-xs" title={row.comment || ''}>
                          {row.comment || '—'}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{timeAgo(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {totalPages > 1 && !loading && !isEmpty && (
              <div className="p-4 border-t flex items-center justify-between bg-muted/10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadReportedIPs(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft size={16} className="mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground font-medium">Page {page + 1} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadReportedIPs(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
