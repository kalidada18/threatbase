import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react'

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
    <section className="py-12 md:py-20 bg-muted/30" id="report-section" aria-live="polite">
      <div className="mx-auto max-w-4xl px-6 lg:px-12 relative">
        {isScanning && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl border p-8 shadow-lg">
            <div className="p-4 rounded-full bg-primary/10 text-primary mb-4 animate-pulse">
              <Search size={32} />
            </div>
            <div className="text-xl font-semibold mb-2">Checking blocklists...</div>
            <div className="text-muted-foreground font-mono mb-6">{ip}</div>
            <div className="w-full max-w-md h-2 bg-muted rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-primary" 
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.5, ease: [0.1, 0.8, 0.3, 1] }}
              />
            </div>
          </div>
        )}

        <AnimatePresence>
          {scanResult && !isScanning && (
            <motion.div 
              className="overflow-hidden rounded-2xl border bg-card shadow-lg"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              <div className={`p-6 md:p-8 flex items-start justify-between border-b ${type === 'danger' ? 'bg-destructive/10 border-destructive/20' : type === 'safe' ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-full ${type === 'danger' ? 'bg-destructive text-destructive-foreground' : type === 'safe' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
                    <StatusIcon size={24} />
                  </div>
                  <div>
                    <h3 className={`font-semibold ${type === 'danger' ? 'text-destructive' : type === 'safe' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {type === 'danger' ? 'Malicious Indicator Confirmed' : type === 'safe' ? 'Not found in active blocklists' : 'Invalid format'}
                    </h3>
                    <div className="text-xl font-mono mt-1 text-foreground">{ip}</div>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${type === 'danger' ? 'bg-destructive text-destructive-foreground' : type === 'safe' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {type === 'danger' ? 'THREAT DETECTED' : type === 'safe' ? 'NOT LISTED' : 'WARNING'}
                </div>
              </div>

              <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Assessment</h4>
                  {type === 'danger' ? (
                    <p className="text-foreground leading-relaxed">
                      The indicator <code className="px-1.5 py-0.5 rounded bg-muted font-mono">{ip}</code> has been positively identified as malicious by the
                      HimalayaFeed global sensor network. It is currently active in our threat intelligence blocklists.
                    </p>
                  ) : type === 'safe' ? (
                    <p className="text-foreground leading-relaxed">
                      The indicator <code className="px-1.5 py-0.5 rounded bg-muted font-mono">{ip}</code> is <strong>not currently listed</strong> in the active
                      HimalayaFeed threat database.
                    </p>
                  ) : (
                    <p className="text-foreground leading-relaxed">Please enter a valid IPv4 address, Domain, SHA-256 Hash, or URL.</p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Intelligence Sources</h4>
                  <div className="space-y-3">
                    {showVt && (
                      <a href={vtHref} target="_blank" rel="noopener" className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-background hover:bg-muted transition-colors text-sm font-medium">
                        <img src="https://www.virustotal.com/gui/images/favicon.png" alt="" className="w-4 h-4" />
                        VirusTotal
                      </a>
                    )}
                    {showAbuse && (
                      <a href={abuseHref} target="_blank" rel="noopener" className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-background hover:bg-muted transition-colors text-sm font-medium">
                        <AlertOctagon size={16} />
                        AbuseIPDB
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
