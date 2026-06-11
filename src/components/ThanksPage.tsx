import { motion } from 'framer-motion'
import { ExternalLink, ShieldCheck, Heart, HeartHandshake } from 'lucide-react'

const intelSources = [
  { name: 'FireHOL', desc: 'Aggregated blocklists analyzing cyber threats, attacks, and malware.', url: 'https://iplists.firehol.org/' },
  { name: 'Spamhaus', desc: 'The Spamhaus Project DROP and EDROP lists for spam and botnet operations.', url: 'https://www.spamhaus.org/' },
  { name: 'Emerging Threats', desc: 'Open source intelligence for firewall rules and IDS/IPS signatures.', url: 'https://rules.emergingthreats.net/' },
  { name: 'Blocklist.de', desc: 'Fail2Ban reporting service for SSH, Apache, Mail, and Brute Force attacks.', url: 'https://www.blocklist.de/' },
  { name: 'ThreatFox', desc: 'A project from Abuse.ch sharing indicators of compromise (IOCs).', url: 'https://threatfox.abuse.ch/' },
  { name: 'Feodo Tracker', desc: 'Tracking Botnet Command and Control (C2) servers.', url: 'https://feodotracker.abuse.ch/' },
  { name: 'IPSUM', desc: 'A daily threat intelligence feed of malicious IPs based on 30+ blacklists.', url: 'https://github.com/stamparm/ipsum' },
  { name: 'CINS Army', desc: 'Collective Intelligence Network Security providing active threat scores.', url: 'https://cinsarmy.com/' },
  { name: 'DShield', desc: 'SANS Internet Storm Center blocklist tracking highly active malicious subnets.', url: 'https://www.dshield.org/' },
  { name: 'Binary Defense', desc: 'Artillery Threat Intelligence Feed and Banlist.', url: 'https://www.binarydefense.com/' },
  { name: 'Botvrij.eu', desc: 'Open source indicators of compromise for network defenders.', url: 'https://botvrij.eu/' },
  { name: 'GreenSnow', desc: 'A team dedicated to tracking and blocking malicious IPs attacking servers.', url: 'https://greensnow.co/' },
  { name: 'BruteForceBlocker', desc: 'List of IPs blocked for massive SSH brute-forcing attempts.', url: 'http://danger.rulez.sk/projects/bruteforceblocker/dirlist' },
  { name: 'CriticalPath Security', desc: 'Actionable threat intelligence feeds for network defense.', url: 'https://criticalpathsecurity.com/' },
  { name: 'Tor Bulk Exit', desc: 'Comprehensive list of active Tor exit nodes.', url: 'https://check.torproject.org/' },
  { name: 'Dan Tor', desc: 'TOR node list provided by Dan.me.uk.', url: 'https://www.dan.me.uk/tornodes' },
  { name: 'Romain Marcoux', desc: 'Curated firewall blocklists and outgoing connection rules.', url: 'https://github.com/romainmarcoux' },
  { name: 'BBCan177', desc: 'Malicious IP blocklists curated by BBCan177.', url: 'https://github.com/BBcan177' }
]

export default function ThanksPage() {
  return (
    <main className="min-h-screen pt-28 pb-24 relative bg-[#0B0F19] overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-20 text-center relative flex flex-col items-center"
        >
          {/* Glowing Background Behind Handshake */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-cyan-500/20 rounded-full blur-[100px] pointer-events-none"></div>

          {/* Shaking Handshake Animation */}
          <motion.div
            animate={{ rotate: [0, -15, 15, -15, 15, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
            className="mb-6 relative z-10"
          >
            <div className="bg-gradient-to-b from-white/10 to-transparent p-4 rounded-full border border-white/10 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
              <HeartHandshake size={56} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
            </div>
          </motion.div>

          <h1 className="text-4xl md:text-6xl font-black flex flex-col items-center justify-center gap-2 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 tracking-tight drop-shadow-sm pb-2">
            Intel Sources
          </h1>
          <p className="mt-4 text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed drop-shadow">
            HimalayaFeed is powered by the tireless work of the global cybersecurity community. We extend our deepest gratitude to the following organizations and open-source projects for providing free, high-quality threat intelligence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {intelSources.map((source, index) => (
            <motion.a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              key={source.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="group rounded-xl border border-white/5 bg-[#10141D] p-6 hover:bg-[#171C28] hover:border-white/10 transition-all duration-300 relative overflow-hidden flex flex-col h-full shadow-lg hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <ExternalLink size={18} className="text-cyan-400" />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-black/50 border border-white/5 flex items-center justify-center group-hover:border-cyan-500/30 transition-colors">
                  <ShieldCheck size={20} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
                </div>
                <h3 className="font-bold text-lg text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
                  {source.name}
                </h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed flex-grow">
                {source.desc}
              </p>
            </motion.a>
          ))}
        </div>
      </div>
    </main>
  )
}
