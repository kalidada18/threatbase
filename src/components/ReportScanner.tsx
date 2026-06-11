import { motion, AnimatePresence } from 'framer-motion'
import { Bug, ShieldCheck, AlertTriangle, AlertOctagon, ChevronRight, Search } from 'lucide-react'

export default function ReportScanner({ scanResult, isScanning, showReport, scanInput }: any) {
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

  const StatusIcon = type === 'danger' ? Bug : type === 'safe' ? ShieldCheck : AlertTriangle

  return (
    <section className="py-12" id="report-section" aria-live="polite">
      <div className="mx-auto max-w-4xl px-6 lg:px-12 relative">
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
              className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-2xl"
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
                      HimalayaFeed global sensor network. It is currently active in our threat intelligence blocklists.
                    </p>
                  ) : type === 'safe' ? (
                    <p className="text-slate-300 leading-relaxed text-sm">
                      The indicator <code className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/5 font-mono text-emerald-400">{ip}</code> is <strong>not currently listed</strong> in the active
                      HimalayaFeed threat database.
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
        </AnimatePresence>
      </div>
    </section>
  )
}
