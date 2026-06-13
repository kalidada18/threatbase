import { Server, Download } from 'lucide-react'
import { motion } from 'framer-motion'

const BASE = import.meta.env.BASE_URL

const feeds = [
  {
    name: 'IPv4 Blocklist',
    desc: 'High-confidence malicious IPv4 addresses actively involved in cyber attacks, ready for firewall ingestion.',
    file: 'malicious_ips.txt',
    icon: <img src={`${BASE}img/ipv4icon.png`} alt="IPv4" className="w-8 h-8 object-contain invert opacity-80" />,
    color: 'text-red-500 bg-red-500/10 border-red-500/20',
    glow: 'group-hover:shadow-[0_0_30px_rgba(239,68,68,0.15)]',
  },
  {
    name: 'Domain Blocklist',
    desc: 'Malicious, phishing, and C2 domains ready for immediate DNS sinkholing and blocking.',
    file: 'malicious_domains.txt',
    icon: <img src={`${BASE}img/domain.png`} alt="Domain" className="w-8 h-8 object-contain drop-shadow-sm" />,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    glow: 'group-hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]',
  },
  {
    name: 'Hash Blocklist',
    desc: 'SHA-256 malware file signatures tailored for endpoint detection and AV scanners.',
    file: 'malicious_hashes.txt',
    icon: <img src={`${BASE}img/file.png`} alt="File" className="w-8 h-8 object-contain drop-shadow-sm" />,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    glow: 'group-hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]',
  },
  {
    name: 'URL Blocklist',
    desc: 'Verified malicious URLs optimized for web proxies, gateways, and content filtering.',
    file: 'malicious_urls.txt',
    icon: <img src={`${BASE}img/url.png`} alt="URL" className="w-8 h-8 object-contain drop-shadow-sm" />,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    glow: 'group-hover:shadow-[0_0_30px_rgba(244,63,94,0.15)]',
  },
  {
    name: 'IPv6 Blocklist',
    desc: 'High-confidence malicious IPv6 addresses for comprehensive, modern network defense.',
    file: 'malicious_ipv6.txt',
    icon: <img src={`${BASE}img/ipv6.png`} alt="IPv6" className="w-8 h-8 object-contain invert opacity-80" />,
    color: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    glow: 'group-hover:shadow-[0_0_30px_rgba(14,165,233,0.15)]',
  },
  {
    name: 'CIDR Blocklist',
    desc: 'Aggregated malicious IPv4 and IPv6 subnets (CIDR notation) for broad-spectrum blocking.',
    file: 'malicious_cidrs.txt',
    icon: <img src={`${BASE}img/cidrs.png`} alt="CIDR" className="w-8 h-8 object-contain drop-shadow-sm" />,
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    glow: 'group-hover:shadow-[0_0_30px_rgba(249,115,22,0.15)]',
  },
]

export default function Feeds() {
  return (
    <section className="relative py-16 md:py-28 overflow-hidden scroll-mt-24" id="feeds">
      {/* Background decorations */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[1px] bg-gradient-to-r from-transparent via-red-500/20 to-transparent"></div>
      
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-16 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-500 uppercase tracking-widest mb-4 drop-shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              Live Blocklists
            </div>
            <h2 className="text-3xl md:text-5xl font-black flex items-center justify-center md:justify-start gap-4 text-white tracking-tight">
              Threat Intelligence Feeds
            </h2>
            <p className="mt-5 text-slate-400 text-lg font-medium leading-relaxed">
              Integrate these plain text indicators directly into your Firewalls, IDS/IPS, and SIEMs. Feeds are updated continuously as the community reports new threats.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {feeds.map((f, i) => (
            <motion.div
              className={`group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-xl p-8 shadow-xl transition-all duration-500 hover:bg-slate-800/50 hover:border-white/10 hover:-translate-y-1.5 ${f.glow}`}
              key={f.file}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            >
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`p-3.5 rounded-2xl border transition-all duration-500 shadow-inner group-hover:scale-110 ${f.color}`}>
                    {f.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">{f.name}</h3>
                </div>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium group-hover:text-slate-300 transition-colors">
                  {f.desc}
                </p>
              </div>
              <a
                href={`https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/${f.file}`}
                className="inline-flex items-center justify-center gap-2 w-full px-5 py-3.5 text-sm font-bold transition-all duration-300 border border-white/10 rounded-2xl bg-white/5 text-white hover:bg-white/10 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 shadow-sm overflow-hidden relative"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                <Download size={16} className="transition-transform group-hover:-translate-y-0.5" /> 
                <span>Download <span className="font-mono text-xs text-slate-300 ml-1">{f.file}</span></span>
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
