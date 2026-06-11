import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flag, Globe, Tag, MessageSquare, Send, List, Inbox, ChevronLeft, ChevronRight, ShieldAlert, Activity, AlertTriangle, ShieldCheck, CheckCircle2, Trophy } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo } from '../utils'
import { Button } from '@/components/ui/button'
import Leaderboard from './Leaderboard'

const REPORT_PAGE_SIZE = 10
const SUBMIT_COOLDOWN = 15000

export default function ReportIP({ addToast }: any) {
  const [ipValue, setIpValue] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')
  const [alias, setAlias] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'feed' | 'leaderboard'>('feed')
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
        .insert([{ ip: ipValue.trim(), category, comment: comment.trim(), reporter_alias: alias.trim() || null }])

      if (error) throw error

      lastSubmitRef.current = Date.now()
      
      // Show success screen instead of just a toast
      setSubmitSuccess(true)
      
      setIpValue('')
      setCategory('')
      setComment('')
      // Don't clear alias so they don't have to re-type it every time
      loadReportedIPs(0)
    } catch (err: any) {
      console.error('Submit error:', err)
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [ipValue, category, comment, addToast, loadReportedIPs])

  const getCategoryColor = (cat: string) => {
    if (cat.includes('Brute')) return 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_8px_rgba(249,115,22,0.1)]'
    if (cat.includes('Malware')) return 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.1)]'
    if (cat.includes('DDoS')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_8px_rgba(168,85,247,0.1)]'
    if (cat.includes('Phish')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_8px_rgba(59,130,246,0.1)]'
    return 'bg-slate-500/10 text-slate-300 border-slate-500/20'
  }

  return (
    <main className="min-h-screen pt-28 pb-24 relative bg-[#0B0F19] overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center relative"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-xl shadow-2xl text-xs font-bold uppercase tracking-widest mb-6 text-slate-300">
            <span className="relative flex h-2.5 w-2.5 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            Active Threat Database
          </div>
          <h1 className="text-4xl md:text-6xl font-black flex flex-col items-center justify-center gap-2 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 tracking-tight drop-shadow-sm pb-2">
            Community Intel
          </h1>
          <p className="mt-4 text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed drop-shadow">
            Help protect the global community. Report malicious IPs to our live feed and empower defenders worldwide.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Col: Submit Form or Success Screen */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="xl:col-span-4"
          >
            <div className="rounded-xl border border-white/5 bg-[#10141D] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 inset-x-0 h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
              
              <div className="p-6 relative z-10 min-h-[500px] flex flex-col">
                <AnimatePresence mode="wait">
                  {!submitSuccess ? (
                    <motion.div 
                      key="form"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
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
                            <Globe size={16} className="text-slate-500 group-focus-within:text-red-400 transition-colors" />
                          </div>
                          <input
                            type="text"
                            id="rip-ip-input"
                            className="w-full h-11 rounded-lg border border-white/5 bg-black/40 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-red-500/50 focus-visible:ring-1 focus-visible:ring-red-500/50 transition-all shadow-inner"
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
                            <Tag size={16} className="text-slate-500 group-focus-within:text-rose-400 transition-colors" />
                          </div>
                          <select
                            id="rip-category"
                            className="w-full h-11 rounded-lg border border-white/5 bg-black/40 pl-10 pr-4 text-sm text-white focus-visible:outline-none focus-visible:border-rose-500/50 focus-visible:ring-1 focus-visible:ring-rose-500/50 transition-all appearance-none shadow-inner"
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
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1" htmlFor="rip-alias">
                          Agent Alias (Optional)
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span className="text-slate-500 font-mono font-bold group-focus-within:text-cyan-400 transition-colors">@</span>
                          </div>
                          <input
                            type="text"
                            id="rip-alias"
                            className="w-full h-11 rounded-lg border border-white/5 bg-black/40 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-cyan-500/50 focus-visible:ring-1 focus-visible:ring-cyan-500/50 transition-all shadow-inner"
                            placeholder="e.g. Neo"
                            autoComplete="off"
                            spellCheck="false"
                            maxLength={24}
                            value={alias}
                            onChange={(e) => setAlias(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1" htmlFor="rip-comment">
                          Analyst Notes
                        </label>
                        <div className="relative">
                          <div className="absolute top-4 left-0 pl-4 pointer-events-none">
                            <MessageSquare size={18} className="text-slate-500 group-focus-within:text-orange-400 transition-colors" />
                          </div>
                          <textarea
                            id="rip-comment"
                            className="w-full min-h-[100px] rounded-lg border border-white/5 bg-black/40 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-orange-500/50 focus-visible:ring-1 focus-visible:ring-orange-500/50 transition-all shadow-inner resize-none"
                            rows={3}
                            placeholder="Describe the activity..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          ></textarea>
                        </div>
                      </div>

                      <Button
                        className="w-full h-11 rounded-lg bg-[#1D2433] hover:bg-[#2A344A] text-white font-bold text-sm shadow-md transition-all duration-300 mt-4 border border-white/5"
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
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="success"
                      initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
                      className="flex flex-col items-center justify-center text-center py-8"
                    >
                      <div className="relative mb-8">
                        <div className="absolute inset-0 bg-green-500/20 rounded-full blur-2xl"></div>
                        <div className="bg-gradient-to-b from-green-400 to-green-600 text-white p-5 rounded-full shadow-[0_0_30px_rgba(34,197,94,0.4)] relative">
                          <ShieldCheck size={48} strokeWidth={2.5} />
                        </div>
                      </div>
                      <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-green-200 mb-4">
                        Thank You, Defender!
                      </h2>
                      <p className="text-slate-300 text-base leading-relaxed mb-8 px-4">
                        Your report has been successfully submitted and added to the live community feed. Thank you for actively helping to make the internet a safer place!
                      </p>
                      
                      <Button
                        className="h-12 px-8 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/10 transition-all backdrop-blur-md"
                        onClick={() => setSubmitSuccess(false)}
                      >
                        Report Another IP
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
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
            <div className="rounded-xl border border-white/5 bg-[#10141D] shadow-2xl flex flex-col overflow-hidden relative h-full group">
              
              {/* Table / Leaderboard Header Section */}
              <div className="p-4 md:px-6 flex items-center justify-between border-b border-white/5 bg-[#171C28] relative z-10">
                <div className="flex gap-6">
                  <button 
                    onClick={() => setActiveTab('feed')}
                    className={`font-semibold text-sm flex items-center gap-2 transition-colors ${activeTab === 'feed' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <List size={16} /> Global Intel Feed
                  </button>
                  <button 
                    onClick={() => setActiveTab('leaderboard')}
                    className={`font-semibold text-sm flex items-center gap-2 transition-colors ${activeTab === 'leaderboard' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Trophy size={16} className={activeTab === 'leaderboard' ? 'text-cyan-400' : ''} /> Top Contributors
                  </button>
                </div>
                {activeTab === 'feed' && (
                  <div className="hidden sm:flex text-sm text-slate-300 font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/5 shadow-inner items-center gap-2">
                    <ShieldAlert size={16} className="text-red-400"/>
                    {reportCount > 0 ? `${fmt(reportCount)} Submissions` : 'Live'}
                  </div>
                )}
              </div>

              {activeTab === 'leaderboard' ? (
                <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                  <Leaderboard />
                </div>
              ) : (
                <>
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
                        <thead className="text-[10px] uppercase bg-black/40 text-slate-400 font-extrabold border-b border-white/5">
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
                                className="hover:bg-white/[0.04] transition-colors group"
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <div className="font-mono font-bold text-slate-200 flex items-center gap-2">
                                      {row.ip}
                                    </div>
                                    {row.reporter_alias && (
                                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                                        By <span className="text-slate-300">@{row.reporter_alias}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-extrabold tracking-wider uppercase border ${getCategoryColor(row.category)} transition-all`}>
                                    {row.category}
                                  </span>
                                </td>
                                <td className="px-6 py-5 text-slate-400 max-w-[280px] sm:max-w-md">
                                  {row.comment ? (
                                    <span className="flex items-start gap-2.5 group-hover:text-slate-200 transition-colors">
                                      <AlertTriangle size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                                      <span className="whitespace-normal leading-relaxed text-sm font-medium">{row.comment}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 italic">No context provided</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium text-right group-hover:text-slate-300 transition-colors">
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
                        className="text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all font-bold"
                        onClick={() => loadReportedIPs(page - 1)}
                        disabled={page === 0}
                      >
                        <ChevronLeft size={16} className="mr-1" /> Prev
                      </Button>
                      <div className="flex gap-2">
                        {[...Array(Math.min(totalPages, 5))].map((_, i) => (
                          <div key={i} className={`transition-all duration-300 rounded-full ${i === page ? 'h-2 w-6 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'h-2 w-2 bg-slate-700 hover:bg-slate-500 cursor-pointer'}`}></div>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all font-bold"
                        onClick={() => loadReportedIPs(page + 1)}
                        disabled={page >= totalPages - 1}
                      >
                        Next <ChevronRight size={16} className="ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  )
}
