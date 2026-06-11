import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flag, Globe, Tag, MessageSquare, Send, List, Inbox, ChevronLeft, ChevronRight, ShieldAlert, Activity, AlertTriangle } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo } from '../utils'
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

  const getCategoryColor = (cat: string) => {
    if (cat.includes('Brute')) return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    if (cat.includes('Malware')) return 'bg-red-500/10 text-red-400 border-red-500/20'
    if (cat.includes('DDoS')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    if (cat.includes('Phish')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    return 'bg-slate-500/10 text-slate-300 border-slate-500/20'
  }

  return (
    <main className="min-h-screen pt-32 pb-24 relative bg-slate-950 overflow-hidden font-sans">
      {/* Animated Abstract Background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.15, 0.1] }} 
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-red-900/40 via-red-950/0 to-transparent blur-[100px]"
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] }} 
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tl from-purple-900/30 via-slate-900/0 to-transparent blur-[120px]"
        />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-white/5 backdrop-blur-md shadow-xl text-xs font-bold uppercase tracking-widest mb-6 text-slate-300">
            <Activity size={14} className="text-red-500" />
            Active Threat Database
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold flex flex-col items-center justify-center gap-2 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 tracking-tight drop-shadow-sm pb-2">
            Community Intel
          </h1>
          <p className="mt-4 text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed drop-shadow">
            Help protect the global community. Report malicious IPs to our live feed and empower defenders worldwide.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Col: Submit Form */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="xl:col-span-4"
          >
            <div className="rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] p-8 relative overflow-hidden group">
              <div className="absolute top-0 inset-x-0 h-[2px] w-full bg-gradient-to-r from-transparent via-red-500/80 to-transparent"></div>
              <div className="absolute -inset-1 bg-gradient-to-r from-red-500/20 to-purple-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
              
              <div className="space-y-6 relative z-10">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Flag className="text-red-500" size={24} /> File a Report
                  </h2>
                  <p className="text-slate-400 text-sm mt-2">All submissions are verified against global honeypots.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1" htmlFor="rip-ip-input">
                    IP Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Globe size={18} className="text-slate-500" />
                    </div>
                    <input
                      type="text"
                      id="rip-ip-input"
                      className="w-full h-14 rounded-2xl border border-white/5 bg-black/40 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-red-500/50 focus-visible:ring-4 focus-visible:ring-red-500/10 transition-all shadow-inner"
                      placeholder="e.g. 192.168.1.1"
                      autoComplete="off"
                      spellCheck="false"
                      value={ipValue}
                      onChange={(e) => setIpValue(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1" htmlFor="rip-category">
                    Threat Category
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Tag size={18} className="text-slate-500" />
                    </div>
                    <select
                      id="rip-category"
                      className="w-full h-14 rounded-2xl border border-white/5 bg-black/40 pl-11 pr-4 text-sm text-white focus-visible:outline-none focus-visible:border-rose-500/50 focus-visible:ring-4 focus-visible:ring-rose-500/10 transition-all appearance-none shadow-inner"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="" disabled>Select category...</option>
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
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1" htmlFor="rip-comment">
                    Analyst Notes
                  </label>
                  <div className="relative">
                    <div className="absolute top-4 left-0 pl-4 pointer-events-none">
                      <MessageSquare size={18} className="text-slate-500" />
                    </div>
                    <textarea
                      id="rip-comment"
                      className="w-full min-h-[120px] rounded-2xl border border-white/5 bg-black/40 pl-11 pr-4 py-4 text-sm text-white placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-orange-500/50 focus-visible:ring-4 focus-visible:ring-orange-500/10 transition-all shadow-inner resize-none"
                      rows={3}
                      placeholder="Describe the activity..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    ></textarea>
                  </div>
                </div>

                <Button
                  className="w-full h-14 rounded-2xl bg-white text-slate-950 hover:bg-slate-200 font-bold text-base shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] transition-all mt-6"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                      Processing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send size={18} className="mr-1" /> Transmit Intel
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Right Col: Reported IPs Table */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="xl:col-span-8 flex flex-col"
          >
            <div className="rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative h-full">
              
              {/* Table Header Section */}
              <div className="p-6 md:px-8 flex items-center justify-between border-b border-white/5 bg-black/20">
                <h3 className="font-bold text-xl flex items-center gap-3 text-white">
                  <List className="text-slate-400" size={20} /> 
                  Global Intel Feed
                </h3>
                <div className="hidden sm:flex text-sm text-slate-300 font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/5 shadow-inner items-center gap-2">
                  <ShieldAlert size={16} className="text-red-400"/>
                  {reportCount > 0 ? `${fmt(reportCount)} Submissions` : 'Live'}
                </div>
              </div>

              <div className="flex-1 overflow-x-auto">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-24">
                    <div className="relative h-16 w-16 mb-6">
                      <div className="absolute inset-0 rounded-full border-t-2 border-red-500 animate-spin"></div>
                      <div className="absolute inset-2 rounded-full border-b-2 border-slate-500 animate-spin animation-delay-200"></div>
                      <ShieldAlert className="absolute inset-0 m-auto text-slate-600" size={20} />
                    </div>
                    <p className="font-medium tracking-wide">Syncing with global database...</p>
                  </div>
                ) : isEmpty ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-24 px-6">
                    <div className="bg-white/5 p-6 rounded-full mb-6 border border-white/5 shadow-inner">
                      <Inbox size={48} className="opacity-50" />
                    </div>
                    <p className="text-xl font-bold text-white mb-2">No Reports Found</p>
                    <p className="text-sm max-w-sm">The intel feed is currently clear. Submit the first malicious IP to start the database.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] uppercase bg-black/40 text-slate-500 font-bold border-b border-white/5">
                      <tr>
                        <th className="px-8 py-5 tracking-[0.2em] whitespace-nowrap">IP Address</th>
                        <th className="px-6 py-5 tracking-[0.2em] whitespace-nowrap">Category</th>
                        <th className="px-6 py-5 tracking-[0.2em]">Context</th>
                        <th className="px-8 py-5 tracking-[0.2em] whitespace-nowrap text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence>
                        {reports.map((row, idx) => (
                          <motion.tr 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            key={row.id || row.created_at} 
                            className="hover:bg-white/[0.02] transition-colors group"
                          >
                            <td className="px-8 py-6 font-mono font-semibold text-slate-200 whitespace-nowrap flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                              {row.ip}
                            </td>
                            <td className="px-6 py-6 whitespace-nowrap">
                              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold tracking-wider uppercase border shadow-sm ${getCategoryColor(row.category)}`}>
                                {row.category}
                              </span>
                            </td>
                            <td className="px-6 py-6 text-slate-400 truncate max-w-[200px] sm:max-w-xs font-medium" title={row.comment || ''}>
                              {row.comment ? (
                                <span className="flex items-center gap-2">
                                  <AlertTriangle size={14} className="text-slate-500 flex-shrink-0" />
                                  <span className="truncate">{row.comment}</span>
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-8 py-6 text-slate-500 whitespace-nowrap font-medium text-right group-hover:text-slate-300 transition-colors">
                              {timeAgo(row.created_at)}
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && !loading && !isEmpty && (
                <div className="p-4 md:px-8 border-t border-white/5 flex items-center justify-between bg-black/20">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:bg-white/5 hover:text-white rounded-xl transition-all font-semibold"
                    onClick={() => loadReportedIPs(page - 1)}
                    disabled={page === 0}
                  >
                    <ChevronLeft size={16} className="mr-1" /> Prev
                  </Button>
                  <div className="flex gap-1.5">
                    {[...Array(Math.min(totalPages, 5))].map((_, i) => (
                      <div key={i} className={`h-1.5 w-1.5 rounded-full ${i === page ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-slate-700'}`}></div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:bg-white/5 hover:text-white rounded-xl transition-all font-semibold"
                    onClick={() => loadReportedIPs(page + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    Next <ChevronRight size={16} className="ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  )
}
