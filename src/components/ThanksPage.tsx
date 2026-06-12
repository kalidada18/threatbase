import { motion } from 'framer-motion'
import { ExternalLink, Heart, HeartHandshake } from 'lucide-react'
import { useSEO } from '@/useSEO'

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
  useSEO({
    title: 'Intel Sources — Threatbase | Open Source Threat Intelligence Credits',
    description: 'Threatbase is powered by the global cybersecurity community. Credits to Spamhaus, FireHOL, Emerging Threats, Abuse.ch, SANS DShield, and 15+ open-source threat intelligence providers.',
    path: '/thanks',
  })
  return (
    <main className="min-h-screen pt-32 pb-32 relative bg-[#0B0F19] overflow-hidden font-sans">
      {/* Immersive Abstract Background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.03, 0.08, 0.03], rotate: [0, 90, 0] }} 
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-cyan-500/20 via-blue-900/10 to-transparent blur-[120px]"
        />
        <motion.div 
          animate={{ scale: [1, 1.15, 1], opacity: [0.03, 0.06, 0.03], rotate: [0, -90, 0] }} 
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-[20%] -right-[20%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tl from-amber-500/20 via-orange-900/10 to-transparent blur-[140px]"
        />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-24 text-center relative flex flex-col items-center"
        >
          {/* Golden Glowing Background Behind Handshake */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none"></div>

          {/* Shaking Handshake Animation */}
          <motion.div
            animate={{ rotate: [0, -12, 12, -12, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
            className="mb-8 relative z-10"
          >
            <div className="bg-gradient-to-b from-white/10 to-white/5 p-5 rounded-full border border-white/10 shadow-[0_0_40px_rgba(245,158,11,0.15)] backdrop-blur-md relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 to-transparent opacity-50"></div>
              <HeartHandshake size={64} className="text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)] relative z-10" />
            </div>
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-black flex flex-col items-center justify-center gap-3 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-slate-400 tracking-tight drop-shadow-sm pb-2">
            Intel Sources
          </h1>
          <p className="mt-4 text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed drop-shadow">
            Threatbase is powered by the tireless work of the global cybersecurity community. We extend our deepest gratitude to the following organizations and open-source projects for providing free, high-quality threat intelligence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {intelSources.map((source, index) => (
            <motion.a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              key={source.name}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05, ease: "easeOut" }}
              className="group rounded-2xl border border-white/5 bg-white/[0.01] p-8 hover:bg-white/[0.03] hover:border-white/10 transition-all duration-500 relative overflow-hidden flex flex-col h-full shadow-2xl backdrop-blur-xl hover:-translate-y-2"
            >
              {/* Subtle top border glow on hover */}
              <div className="absolute top-0 inset-x-0 h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-400/0 to-transparent group-hover:via-cyan-400/50 transition-all duration-500"></div>
              
              {/* Background ambient glow inside card */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform group-hover:translate-x-0 translate-x-2">
                <ExternalLink size={20} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              </div>
              <div className="flex items-center gap-4 mb-5 relative z-10">
                <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center group-hover:border-cyan-500/40 group-hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all duration-500">
                  <svg className="h-6 w-6 text-slate-500 group-hover:text-cyan-400 transition-colors duration-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.05" />
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="font-extrabold text-xl tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-cyan-200 transition-all duration-500">
                  {source.name}
                </h3>
              </div>
              <p className="text-slate-400 text-[15px] leading-relaxed flex-grow relative z-10 group-hover:text-slate-300 transition-colors duration-500">
                {source.desc}
              </p>
            </motion.a>
          ))}
        </div>
      </div>
    </main>
  )
}
