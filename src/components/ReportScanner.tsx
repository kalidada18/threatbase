import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radar, Bug, ShieldCheck, AlertTriangle, AlertOctagon, ChevronRight } from 'lucide-react'

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
        {isScanning && (
          <motion.div 
            className="w-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-3xl rounded-2xl border border-white/10 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {/* Cyber Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:32px_32px]"></div>
            <div className="absolute top-0 inset-x-0 h-px w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_rgba(34,211,238,1)]"></div>
            
            {/* Sweeping Radar Centerpiece */}
            <div className="relative w-40 h-40 mb-10 flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full border border-cyan-500/20"></div>
              {/* Spinning Conic Radar Sweep */}
              <div className="absolute inset-0 rounded-full border border-cyan-400/50 animate-spin" style={{ background: 'conic-gradient(from 0deg, transparent 70%, rgba(6,182,212,0.1) 80%, rgba(6,182,212,0.6) 100%)' }}></div>
              <div className="absolute inset-4 rounded-full border border-dashed border-cyan-500/40 animate-[spin_4s_linear_infinite_reverse]"></div>
              <div className="absolute inset-8 rounded-full border border-cyan-400/30 bg-slate-900/50 shadow-[0_0_30px_rgba(34,211,238,0.2)]"></div>
              <Radar size={48} className="text-cyan-400 animate-pulse drop-shadow-[0_0_15px_rgba(34,211,238,1)] z-10" />
            </div>

            <div className="relative z-10 text-2xl font-black mb-3 tracking-[0.2em] text-white uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-pulse">Scanning Target</div>
            <div className="relative z-10 text-cyan-400 font-mono mb-10 tracking-[0.15em] text-lg bg-slate-950/80 px-6 py-2 rounded-lg border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(6,182,212,0.2)]">{ip}</div>
            
            <div className="relative z-10 w-full max-w-md h-2 bg-slate-950 rounded-full overflow-hidden shadow-inner border border-white/5">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,1)] relative" 
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.5, ease: 'linear' }}
              >
                {/* Glowing head of the progress bar */}
                <div className="absolute top-0 right-0 bottom-0 w-8 bg-white blur-[2px]"></div>
              </motion.div>
            </div>
          </motion.div>
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
              <div className="p-8 flex items-start justify-between border-b border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent">
                <div className="flex items-center gap-6">
                  <div className={`${type === 'danger' ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]' : type === 'safe' ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]'}`}>
                    <StatusIcon size={56} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className={`font-black text-2xl tracking-widest uppercase ${type === 'danger' ? 'text-red-500' : type === 'safe' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {type === 'danger' ? 'Malicious Indicator' : type === 'safe' ? 'Clean / Not Listed' : 'Invalid format'}
                    </h3>
                    <div className="text-2xl font-mono mt-2 text-white/90">{ip}</div>
                  </div>
                </div>
                <div className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest ${type === 'danger' ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]' : type === 'safe' ? 'bg-emerald-500 text-emerald-50 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-amber-500 text-amber-50 shadow-[0_0_10px_rgba(245,158,11,0.3)]'}`}>
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
