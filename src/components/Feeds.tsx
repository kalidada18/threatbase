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
        <div className="mb-12 text-center md:text-left">
          <div className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Blocklists</div>
          <h2 className="text-3xl md:text-4xl font-bold flex items-center justify-center md:justify-start gap-3"><Server className="text-primary" /> Threat Feeds</h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl">
            Integrate these plain text indicators directly into your Firewalls, IDS/IPS, and SIEMs. Updated regularly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feeds.map((f, i) => (
            <motion.div 
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-md" 
              key={f.file} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.02 }}
            >
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-xl ${f.color}`}>
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-semibold">{f.name}</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                  {f.desc}
                </p>
              </div>
              <a 
                href={`${BASE}ioc/${f.file}`} 
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium transition-colors border rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" 
                target="_blank" 
                rel="noopener"
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
