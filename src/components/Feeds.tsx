import { Radar, Network, Fingerprint, Unlink, Layers, Server, Download } from 'lucide-react'
import { motion } from 'framer-motion'

const BASE = import.meta.env.BASE_URL

const feeds = [
  {
    name: 'IPv4 Blocklist',
    desc: 'High-confidence malicious IPs with risk scores (10-100). Format: IP,Score.',
    file: 'malicious_ips.txt',
    icon: <Radar size={20} />,
    color: 'text-red-500 bg-red-500/10',
  },
  {
    name: 'Domain Blocklist',
    desc: 'Malicious, phishing, and C2 domains ready for DNS sinkholing.',
    file: 'malicious_domains.txt',
    icon: <Network size={20} />,
    color: 'text-purple-500 bg-purple-500/10',
  },
  {
    name: 'Hash Blocklist',
    desc: 'SHA-256 malware file signatures for EDRs and AV scanners.',
    file: 'malicious_hashes.txt',
    icon: <Fingerprint size={20} />,
    color: 'text-amber-500 bg-amber-500/10',
  },
  {
    name: 'URL Blocklist',
    desc: 'Complete malicious URLs for web proxies and filtering.',
    file: 'malicious_urls.txt',
    icon: <Unlink size={20} />,
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    name: 'IPv6 Blocklist',
    desc: 'High-confidence malicious IPv6 addresses.',
    file: 'malicious_ipv6.txt',
    icon: <Network size={20} />,
    color: 'text-teal-500 bg-teal-500/10',
  },
  {
    name: 'CIDR Blocklist',
    desc: 'Malicious IPv4 and IPv6 subnets (CIDR notation).',
    file: 'malicious_cidrs.txt',
    icon: <Layers size={20} />,
    color: 'text-orange-500 bg-orange-500/10',
  },
]

export default function Feeds() {
  return (
    <section className="py-12 md:py-20" id="feeds">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-14 text-center md:text-left">
          <div className="text-xs font-bold text-red-500 uppercase tracking-widest mb-3 drop-shadow-sm">Blocklists</div>
          <h2 className="text-3xl md:text-5xl font-extrabold flex items-center justify-center md:justify-start gap-4 text-white">
            <Server className="text-red-500" size={36} /> Threat Feeds
          </h2>
          <p className="mt-5 text-slate-400 text-lg max-w-2xl font-medium leading-relaxed">
            Integrate these plain text indicators directly into your Firewalls, IDS/IPS, and SIEMs. Updated regularly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feeds.map((f, i) => (
            <motion.div 
              className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-md p-8 shadow-xl transition-all duration-300 hover:shadow-2xl hover:bg-slate-900/60 hover:border-white/20 hover:-translate-y-1" 
              key={f.file} 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`p-3.5 rounded-2xl transition-colors duration-300 shadow-inner ${f.color}`}>
                    {f.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">{f.name}</h3>
                </div>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium">
                  {f.desc}
                </p>
              </div>
              <a 
                href={`https://raw.githubusercontent.com/kalidada18/himalayafeed/main/public/ioc/${f.file}`} 
                className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 text-sm font-bold transition-all duration-300 border border-white/10 rounded-full bg-white/5 text-white hover:bg-white/10 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 shadow-sm" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Download size={16} /> Download {f.file}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
