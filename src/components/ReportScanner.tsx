import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon, ChevronRight } from 'lucide-react'

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

  const StatusIcon = type === 'danger' ? ShieldAlert : type === 'safe' ? ShieldCheck : AlertTriangle

  return (
    <section className="py-12" id="report-section" aria-live="polite">
      <div className="mx-auto max-w-4xl px-6 lg:px-12 relative">
        {isScanning && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
            <div className="relative w-28 h-28 mb-8">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/10 shadow-[0_0_30px_rgba(6,182,212,0.1)]"></div>
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin"></div>
              <div className="absolute inset-3 rounded-full border-2 border-cyan-500/10"></div>
              <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-cyan-300 animate-[spin_1.5s_linear_infinite_reverse]"></div>
              <div className="absolute inset-0 flex items-center justify-center text-cyan-400">
                <Search size={32} className="animate-pulse shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
              </div>
            </div>
            <div className="text-xl font-bold mb-2 tracking-wide text-white">Analyzing Intelligence Feeds</div>
            <div className="text-cyan-400 font-mono mb-8 tracking-widest text-sm uppercase opacity-80">{ip}</div>
            <div className="w-full max-w-sm h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner relative">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,1)]" 
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.5, ease: 'linear' }}
              />
            </div>
          </div>
        )}

        <AnimatePresence>
          {scanResult && !isScanning && (
            <motion.div 
              className={`overflow-hidden rounded-2xl border-x border-b border-white/10 bg-slate-900/80 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] border-t-4 ${type === 'danger' ? 'border-t-red-500' : type === 'safe' ? 'border-t-emerald-500' : 'border-t-amber-500'}`}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              <div className="p-8 flex items-start justify-between border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-6">
                  <div className={`p-4 rounded-2xl ${type === 'danger' ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[inset_0_0_20px_rgba(239,68,68,0.2)]' : type === 'safe' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.2)]' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[inset_0_0_20px_rgba(245,158,11,0.2)]'}`}>
                    <StatusIcon size={28} />
                  </div>
                  <div>
                    <h3 className={`font-black text-xl tracking-wider uppercase ${type === 'danger' ? 'text-red-500' : type === 'safe' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {type === 'danger' ? 'Malicious Indicator Confirmed' : type === 'safe' ? 'Not found in active blocklists' : 'Invalid format'}
                    </h3>
                    <div className="text-xl font-mono mt-2 text-white">{ip}</div>
                  </div>
                </div>
                <div className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest ${type === 'danger' ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)]' : type === 'safe' ? 'bg-emerald-500 text-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-amber-500 text-amber-50 shadow-[0_0_20px_rgba(245,158,11,0.5)]'}`}>
                  {type === 'danger' ? 'THREAT DETECTED' : type === 'safe' ? 'NOT LISTED' : 'WARNING'}
                </div>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="md:col-span-2">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Assessment</h4>
                  {type === 'danger' ? (
                    <p className="text-slate-300 leading-relaxed text-lg">
                      The indicator <code className="px-2 py-1 rounded bg-black/40 border border-white/10 font-mono text-red-400 shadow-inner">{ip}</code> has been positively identified as malicious by the
                      HimalayaFeed global sensor network. It is currently active in our threat intelligence blocklists.
                    </p>
                  ) : type === 'safe' ? (
                    <p className="text-slate-300 leading-relaxed text-lg">
                      The indicator <code className="px-2 py-1 rounded bg-black/40 border border-white/10 font-mono text-emerald-400 shadow-inner">{ip}</code> is <strong>not currently listed</strong> in the active
                      HimalayaFeed threat database.
                    </p>
                  ) : (
                    <p className="text-slate-300 leading-relaxed text-lg">Please enter a valid IPv4 address, Domain, SHA-256 Hash, or URL.</p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Intelligence Sources</h4>
                  <div className="space-y-4">
                    {showVt && (
                      <a href={vtHref} target="_blank" rel="noopener" className="group flex items-center justify-between px-5 py-4 rounded-xl border border-white/5 bg-slate-800/40 hover:bg-slate-800/80 hover:border-cyan-500/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                        <div className="flex items-center gap-4">
                          <img src="https://www.virustotal.com/gui/images/favicon.png" alt="" className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                          <span className="font-bold text-slate-300 group-hover:text-white transition-colors tracking-wide">VirusTotal</span>
                        </div>
                        <ChevronRight size={18} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                      </a>
                    )}
                    {showAbuse && (
                      <a href={abuseHref} target="_blank" rel="noopener" className="group flex items-center justify-between px-5 py-4 rounded-xl border border-white/5 bg-slate-800/40 hover:bg-slate-800/80 hover:border-red-500/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                        <div className="flex items-center gap-4">
                          <AlertOctagon size={20} className="text-slate-400 group-hover:text-red-400 transition-colors duration-300" />
                          <span className="font-bold text-slate-300 group-hover:text-white transition-colors tracking-wide">AbuseIPDB</span>
                        </div>
                        <ChevronRight size={18} className="text-slate-500 group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
                      </a>
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
