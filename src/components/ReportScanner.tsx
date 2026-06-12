import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bug, ShieldCheck, AlertTriangle, AlertOctagon, ChevronRight, Search, Check } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { timeAgo } from '../utils'

const getCategoryColor = (cat: string) => {
  if (!cat) return 'bg-slate-500/10 text-slate-300 border border-slate-500/20'
  const c = cat.toLowerCase()
  if (c.includes('brute') || c.includes('force')) return 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
  if (c.includes('malware')) return 'bg-red-500/10 text-red-400 border border-red-500/20'
  if (c.includes('ddos')) return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
  if (c.includes('phish')) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
  if (c.includes('scan')) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
  if (c.includes('botnet')) return 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
  return 'bg-slate-500/10 text-slate-300 border border-slate-500/20'
}

export default function ReportScanner({ scanResult, isScanning, showReport, scanInput }: any) {
  const [reports, setReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(false)

  const ip = scanResult?.ip || scanInput?.trim() || ''
  const isMalicious = scanResult?.isMalicious
  const type = scanResult
    ? isMalicious
      ? 'danger'
      : scanResult.type === 'invalid'
        ? 'warn'
        : 'safe'
    : null

  useEffect(() => {
    if (scanResult && (scanResult.isIP || scanResult.isIPv6) && ip) {
      setLoadingReports(true)
      supabaseClient
        .from('reported_ips')
        .select('*')
        .eq('ip', ip)
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data }) => {
          if (data) setReports(data)
          setLoadingReports(false)
        })
        .catch(() => setLoadingReports(false))
    } else {
      setReports([])
    }
  }, [scanResult, ip])

  // Build external links
  let vtHref = '#'
  let abuseHref = '#'
  let showVt = false
  let showAbuse = false
  if (scanResult) {
    const { isIP, isIPv6, isHash, isURL, isDomain } = scanResult
    if (isIP || isIPv6) {
      vtHref = 'https://www.virustotal.com/gui/search/' + encodeURIComponent(ip)
      abuseHref = 'https://www.abuseipdb.com/check/' + encodeURIComponent(ip)
      showVt = true
      showAbuse = true
    } else if (isHash) {
      vtHref = 'https://www.virustotal.com/gui/file/' + ip
      showVt = true
    } else if (isURL) {
      // VirusTotal uses base64url without padding for URLs
      try {
        const b64 = btoa(unescape(encodeURIComponent(ip))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        vtHref = 'https://www.virustotal.com/gui/url/' + b64
      } catch(e) {
        vtHref = 'https://www.virustotal.com/gui/search/' + encodeURIComponent(ip)
      }
      showVt = true
    } else if (isDomain) {
      vtHref = 'https://www.virustotal.com/gui/domain/' + ip
      showVt = true
    }
  }

  const StatusIcon = type === 'danger' ? Bug : type === 'safe' ? ShieldCheck : AlertTriangle

  if (!showReport) return null;

  return (
    <section className="py-12" id="report-section" aria-live="polite">
      <div className="mx-auto max-w-5xl px-6 lg:px-12 relative">
        <AnimatePresence mode="wait">
          {isScanning && (
            <motion.div 
              key="scanning"
              className="w-full min-h-[300px] flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/5 p-8 shadow-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="relative flex items-center justify-center w-16 h-16 mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-slate-700/50"></div>
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"></div>
                <Search className="text-cyan-400" size={20} />
              </div>
              <div className="text-sm font-medium text-slate-400 tracking-wide uppercase">Scanning target</div>
              <div className="mt-3 text-xl font-mono text-white">{ip}</div>
            </motion.div>
          )}

          {scanResult && !isScanning && (
            <motion.div 
              key="result"
              className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-2xl mb-12"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
            >
              {/* Header */}
              <div className="p-6 md:p-8 flex items-start justify-between border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-5">
                  <div className={`p-3 rounded-xl ${type === 'danger' ? 'bg-red-500/10 text-red-400' : type === 'safe' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    <StatusIcon size={32} strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-slate-200">
                      {type === 'danger' ? 'Malicious Indicator' : type === 'safe' ? 'Clean / Not Listed' : 'Invalid Format'}
                    </h3>
                    <div className="text-sm font-mono mt-1 text-slate-400">{ip}</div>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest border ${type === 'danger' ? 'bg-red-500/10 text-red-400 border-red-500/20' : type === 'safe' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {type === 'danger' ? 'Threat Detected' : type === 'safe' ? 'Not Listed' : 'Warning'}
                </div>
              </div>

              {/* Body */}
              <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-12">
                <div className="md:col-span-2">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Assessment</h4>
                  {type === 'danger' ? (
                    <p className="text-slate-300 leading-relaxed text-sm">
                      The indicator <code className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/5 font-mono text-red-400">{ip}</code> has been positively identified as malicious by the
                      Threatbase global sensor network. It is currently active in our threat intelligence blocklists.
                    </p>
                  ) : type === 'safe' ? (
                    <p className="text-slate-300 leading-relaxed text-sm">
                      The indicator <code className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/5 font-mono text-emerald-400">{ip}</code> is <strong>not currently listed</strong> in the active
                      Threatbase threat database.
                    </p>
                  ) : (
                    <p className="text-slate-300 leading-relaxed text-sm">Please enter a valid IPv4 address, Domain, SHA-256 Hash, or URL.</p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">External Intelligence</h4>
                  <div className="flex flex-col">
                    {showVt && (
                      <a href={vtHref} target="_blank" rel="noopener" className="group flex items-center justify-between py-3 border-b border-white/5 hover:bg-white/[0.02] px-3 -mx-3 rounded-lg transition-colors">
                        <div className="flex items-center gap-3">
                          <img src="https://www.virustotal.com/gui/images/favicon.png" alt="" className="w-4 h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                          <span className="font-medium text-sm text-slate-300 group-hover:text-white transition-colors">VirusTotal</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
                      </a>
                    )}
                    {showAbuse && (
                      <a href={abuseHref} target="_blank" rel="noopener" className="group flex items-center justify-between py-3 border-b border-white/5 hover:bg-white/[0.02] px-3 -mx-3 rounded-lg transition-colors">
                        <div className="flex items-center gap-3">
                          <AlertOctagon size={16} className="text-slate-400 group-hover:text-red-400 transition-colors" />
                          <span className="font-medium text-sm text-slate-300 group-hover:text-white transition-colors">AbuseIPDB</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
                      </a>
                    )}
                    {!showVt && !showAbuse && (
                      <p className="text-sm text-slate-500 italic">No external links available.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {loadingReports && !isScanning && (
            <motion.div 
              key="loading-reports"
              className="w-full flex flex-col items-center justify-center py-20 bg-slate-950/20 backdrop-blur-md rounded-2xl border border-white/[0.05]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="relative h-8 w-8 mb-4">
                <div className="absolute inset-0 rounded-full border border-slate-800"></div>
                <div className="absolute inset-0 rounded-full border border-slate-500 border-t-transparent animate-spin"></div>
              </div>
              <p className="font-semibold tracking-wider text-[10px] text-slate-500 uppercase">Fetching community reports...</p>
            </motion.div>
          )}

          {reports.length > 0 && !isScanning && !loadingReports && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-6"
            >
              <div>
                <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
                  Community Reports for <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent font-mono">{ip}</span>
                </h3>
                <p className="text-xs md:text-sm text-slate-400 leading-relaxed font-medium">
                  This IP address has been reported <span className="text-white font-bold">{reports.length.toLocaleString()}</span> times. First reported on <span className="text-slate-300 font-medium">{new Date(reports[reports.length - 1].created_at || Date.now()).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric'})}</span>, with the most recent report from <span className="text-slate-300 font-medium">{timeAgo(reports[0].created_at || new Date().toISOString())}</span>.
                </p>
              </div>

              <div className="relative overflow-hidden bg-slate-950/40 backdrop-blur-sm border border-white/[0.05] border-l-2 border-l-orange-500 px-6 py-5 rounded-xl shadow-lg font-elegant">
                <div className="space-y-1.5 relative z-10">
                  <strong className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent block text-[11px] uppercase tracking-widest font-bold">Active Threat Warning</strong>
                  <p className="text-slate-300 leading-relaxed text-xs">
                    Abusive activity was reported from this address within the past week. It may still be actively engaged in hostile operations.
                  </p>
                </div>
                <div className="absolute top-0 left-0 w-48 h-full bg-gradient-to-r from-orange-500/10 to-transparent pointer-events-none" />
              </div>

              <div className="overflow-hidden rounded-xl border border-white/[0.05] bg-slate-950/40 backdrop-blur-md shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left block md:table">
                    <thead className="hidden md:table-header-group text-[10px] uppercase bg-slate-950/45 text-slate-400 font-bold border-b border-white/5 tracking-widest">
                      <tr>
                        <th className="px-6 py-5 w-[20%]">Reporter</th>
                        <th className="px-6 py-5 w-[25%]">
                          <div className="flex items-center gap-1.5">
                            IoA Timestamp (UTC) 
                            <span className="text-cyan-400 text-[9px] font-bold bg-cyan-400/10 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center cursor-help" title="Indicator of Attack timestamp">?</span>
                          </div>
                        </th>
                        <th className="px-6 py-5 w-[35%]">Comment</th>
                        <th className="px-6 py-5 text-right w-[20%]">Categories</th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group p-4 md:p-0 space-y-4 md:space-y-0 md:divide-y md:divide-white/5">
                      {reports.map((row, idx) => {
                        const createdAt = row.created_at || new Date().toISOString();
                        const reporter = row.reporter_alias || 'Anonymous';
                        const comment = row.comment || 'No context provided.';
                        const categories = (row.category || 'Other').split(', ');
                        
                        return (
                          <tr key={idx} className="block md:table-row bg-slate-900/50 md:bg-transparent hover:bg-white/[0.015] transition-colors group border border-white/10 md:border-0 rounded-xl md:rounded-none p-4 md:p-0">
                            <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Check size={14} className="text-emerald-400 shrink-0" strokeWidth={2.5} />
                                <span className="font-bold text-slate-300">@{reporter}</span>
                              </div>
                            </td>
                            <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 whitespace-nowrap text-slate-400">
                              <div className="flex items-center gap-2 md:block">
                                <div>{createdAt.replace('T', ' ').substring(0, 19)}</div>
                                <div className="text-[10px] text-slate-500 font-medium md:mt-1">({timeAgo(createdAt)})</div>
                              </div>
                            </td>
                            <td className="block md:table-cell px-0 py-3 md:px-6 md:py-4 text-slate-300 md:max-w-[300px] border-t border-b border-white/5 md:border-0 my-3 md:my-0">
                              <div className="leading-relaxed font-medium md:line-clamp-2" title={comment}>{comment}</div>
                            </td>
                            <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 text-right">
                              <div className="flex flex-wrap md:justify-end gap-1.5 pt-1 md:pt-0">
                                {categories.map((cat: string) => (
                                  <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${getCategoryColor(cat)}`}>
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </section>
  )
}


