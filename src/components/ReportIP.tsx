import { useState, useEffect, useCallback, useRef } from 'react'
import { Flag, Globe, Tag, MessageSquare, Send, Database, ShieldAlert, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo } from '../utils'

const REPORT_PAGE_SIZE = 15
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!supabaseClient) {
      addToast('Database connection unavailable', 'error')
      return
    }

    const now = Date.now()
    if (now - lastSubmitRef.current < SUBMIT_COOLDOWN) {
      const remaining = Math.ceil((SUBMIT_COOLDOWN - (now - lastSubmitRef.current)) / 1000)
      addToast(`Please wait ${remaining}s before submitting again`, 'error')
      return
    }

    if (!ipValue.trim()) {
      addToast('IP Address is required', 'error')
      return
    }

    const isValidIP =
      /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ipValue.trim()) ||
      (ipValue.includes(':') && /^[0-9a-fA-F:]+$/.test(ipValue.trim()))

    if (!isValidIP) {
      addToast('Invalid IPv4 or IPv6 format', 'error')
      return
    }

    if (!category) {
      addToast('Threat category is required', 'error')
      return
    }

    setSubmitting(true)

    try {
      const { error } = await supabaseClient
        .from('reported_ips')
        .insert([{ ip: ipValue.trim(), category, comment: comment.trim() }])

      if (error) throw error

      lastSubmitRef.current = Date.now()
      addToast('Report submitted successfully', 'success')
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
    <main className="min-h-screen pt-28 pb-20 bg-[#0A0A0A] text-slate-300 font-sans selection:bg-blue-500/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mb-10 border-b border-slate-800 pb-8">
          <h1 className="text-3xl font-semibold text-slate-100 flex items-center gap-3">
            <ShieldAlert className="text-blue-500" size={28} />
            Report an IP
          </h1>
          <p className="mt-3 text-slate-400 max-w-3xl text-sm leading-relaxed">
            Submit malicious IP addresses to the HimalayaFeed global database. Your reports help security teams and researchers identify and block active threats in real-time. Please provide accurate categories and context.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Form Section */}
          <div className="lg:col-span-4 bg-[#111111] border border-slate-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-100 mb-6 flex items-center gap-2">
              <Flag size={18} className="text-slate-500" /> Report Details
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rip-ip-input">
                  IP Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    id="rip-ip-input"
                    className="w-full h-10 bg-[#0A0A0A] border border-slate-700 rounded-md pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="e.g. 192.168.1.1"
                    autoComplete="off"
                    spellCheck="false"
                    value={ipValue}
                    onChange={(e) => setIpValue(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rip-category">
                  Categories <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <select
                    id="rip-category"
                    className="w-full h-10 bg-[#0A0A0A] border border-slate-700 rounded-md pl-10 pr-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="" disabled>Select primary category...</option>
                    <option value="Brute-Force">Brute-Force</option>
                    <option value="Port Scan">Port Scan</option>
                    <option value="Phishing">Phishing</option>
                    <option value="Malware">Malware</option>
                    <option value="C2 Server">C2 Server</option>
                    <option value="DDoS Attack">DDoS Attack</option>
                    <option value="Spam">Spam</option>
                    <option value="Exploit Attempt">Exploit Attempt</option>
                    <option value="Web Spam">Web Spam</option>
                    <option value="IoT Targeted">IoT Targeted</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rip-comment">
                  Comment
                </label>
                <div className="relative">
                  <MessageSquare size={16} className="absolute left-3 top-3 text-slate-500" />
                  <textarea
                    id="rip-comment"
                    className="w-full min-h-[100px] bg-[#0A0A0A] border border-slate-700 rounded-md pl-10 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y"
                    placeholder="Provide logs or context (scrub PII)..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  ></textarea>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">Do not include personal information in the comments.</p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Submit Report
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Table Section */}
          <div className="lg:col-span-8 bg-[#111111] border border-slate-800 rounded-lg shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-medium text-slate-100 flex items-center gap-2">
                <Database size={18} className="text-slate-400" /> 
                Recent Reports
              </h3>
              <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
                {reportCount > 0 ? `${fmt(reportCount)} Total` : 'Loading...'}
              </span>
            </div>

            <div className="flex-1 overflow-x-auto min-h-[400px]">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500 mb-4" />
                  <p className="text-sm">Fetching records...</p>
                </div>
              ) : isEmpty ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20 px-4 text-center">
                  <CheckCircle2 size={32} className="text-slate-600 mb-3" />
                  <p className="text-slate-300 font-medium mb-1">No Records Found</p>
                  <p className="text-sm">The database is currently empty.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 bg-[#0A0A0A] border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3 font-medium">IP Address</th>
                      <th className="px-5 py-3 font-medium">Category</th>
                      <th className="px-5 py-3 font-medium">Comment</th>
                      <th className="px-5 py-3 font-medium text-right flex justify-end items-center gap-1.5">
                        <Clock size={14} /> Reported
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {reports.map((row) => (
                      <tr key={row.id || row.created_at} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-blue-400 hover:text-blue-300 cursor-pointer">{row.ip}</span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                            {row.category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 text-xs">
                          <div className="truncate max-w-[250px] lg:max-w-sm" title={row.comment || ''}>
                            {row.comment || <span className="text-slate-600 italic">No comment provided</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap text-right">
                          {timeAgo(row.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && !loading && !isEmpty && (
              <div className="px-5 py-3 border-t border-slate-800 bg-[#0A0A0A] flex items-center justify-between rounded-b-lg">
                <button
                  className="text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors flex items-center text-sm"
                  onClick={() => loadReportedIPs(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft size={16} className="mr-0.5" /> Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page <span className="text-slate-300 font-medium">{page + 1}</span> of {totalPages}
                </span>
                <button
                  className="text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors flex items-center text-sm"
                  onClick={() => loadReportedIPs(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={16} className="ml-0.5" />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  )
}
