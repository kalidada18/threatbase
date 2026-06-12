import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bug, ShieldCheck, AlertTriangle, AlertOctagon, ChevronRight, Search, Check } from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { timeAgo } from '../utils'

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

          {reports.length > 0 && !isScanning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <h3 className="text-[22px] text-[#FFB300] mb-5 text-center font-sans tracking-wide">
                IP Abuse Reports for <span className="font-bold">{ip}</span>:
              </h3>
              
              <p className="text-[13px] text-slate-200 mb-5 px-2 font-sans tracking-wide">
                This IP address has been reported a total of <span className="font-bold">{reports.length.toLocaleString()}</span> times from distinct sources. {ip} was first reported on {new Date(reports[reports.length - 1].created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric'})}, and the most recent report was <span className="font-bold">{timeAgo(reports[0].created_at || new Date().toISOString())}</span>.
              </p>

              <div className="bg-[#EFA034] text-white px-4 py-3.5 rounded text-[13px] mb-6 shadow-lg flex gap-3 items-start md:items-center">
                <AlertTriangle size={18} className="shrink-0 mt-0.5 md:mt-0 opacity-90" strokeWidth={2.5} />
                <span>
                  <strong>Recent Reports:</strong> We have received reports of abusive activity from this IP address within the last week. It is potentially still actively engaged in abusive activities.
                </span>
              </div>

              <div className="overflow-x-auto border border-[#333] bg-[#0E0E0E]">
                <table className="w-full text-left border-collapse min-w-[800px] font-sans">
                  <thead>
                    <tr className="border-b border-[#333] bg-black">
                      <th className="px-5 py-3.5 font-bold text-white text-[13px] w-[20%]">Reporter</th>
                      <th className="px-5 py-3.5 font-bold text-white text-[13px] w-[25%] flex items-center gap-1.5">
                        IoA Timestamp (UTC) 
                        <span className="text-[#3273dc] text-[10px] font-bold ml-0.5 bg-[#3273dc]/10 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center cursor-help">?</span>
                      </th>
                      <th className="px-5 py-3.5 font-bold text-white text-[13px] w-[35%]">Comment</th>
                      <th className="px-5 py-3.5 font-bold text-white text-[13px] w-[20%]">Categories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((row, idx) => {
                      const createdAt = row.created_at || new Date().toISOString();
                      const reporter = row.reporter_alias || 'Anonymous';
                      const comment = row.comment || 'No context provided.';
                      const categories = (row.category || 'Other').split(', ');
                      
                      return (
                      <tr key={idx} className={`border-b border-[#333] ${idx % 2 === 0 ? 'bg-[#181818]' : 'bg-[#222222]'}`}>
                        <td className="px-5 py-4 text-[13px] align-top">
                          <div className="flex items-center gap-1.5">
                            <Check size={14} className="text-[#32CD32] shrink-0" strokeWidth={3} />
                            <span className="text-base leading-none">🇺🇸</span>
                            <span className="text-[#3273dc] hover:text-[#23527c] hover:underline cursor-pointer">{reporter}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[13px] text-[#ddd] align-top">
                          <div>{createdAt.replace('T', ' ').substring(0, 19)}</div>
                          <div className="text-[#999] text-[12px] mt-1">({timeAgo(createdAt)})</div>
                        </td>
                        <td className="px-5 py-4 text-[13px] text-[#ddd] align-top max-w-[300px]">
                          <div className="truncate">{comment}</div>
                          {row.comment && <div className="text-[#3273dc] hover:text-[#23527c] hover:underline text-[12px] mt-2 cursor-pointer text-right w-full block">show more</div>}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {categories.map((cat: string) => (
                              <span key={cat} className="bg-[#777] border border-[#555] text-white text-[11px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
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
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </section>
  )
}
