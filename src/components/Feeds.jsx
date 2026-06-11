import { Radar, Network, Fingerprint, Unlink, Layers, Server, Download } from 'lucide-react'
import { motion } from 'framer-motion'

const BASE = import.meta.env.BASE_URL

const feeds = [
  {
    name: 'IPv4 Blocklist',
    desc: 'High-confidence malicious IPs with risk scores (10-100). Format: IP,Score.',
    file: 'malicious_ips.txt',
    icon: <Radar size={18} />,
    iconClass: 'icon-red',
    glowClass: 'dl-glow-red',
  },
  {
    name: 'Domain Blocklist',
    desc: 'Malicious, phishing, and C2 domains ready for DNS sinkholing.',
    file: 'malicious_domains.txt',
    icon: <Network size={18} />,
    iconClass: 'icon-purple',
    glowClass: 'dl-glow-purple',
  },
  {
    name: 'Hash Blocklist',
    desc: 'SHA-256 malware file signatures for EDRs and AV scanners.',
    file: 'malicious_hashes.txt',
    icon: <Fingerprint size={18} />,
    iconClass: 'icon-amber',
    glowClass: 'dl-glow-amber',
  },
  {
    name: 'URL Blocklist',
    desc: 'Complete malicious URLs for web proxies and filtering.',
    file: 'malicious_urls.txt',
    icon: <Unlink size={18} />,
    iconClass: 'icon-blue',
    glowClass: 'dl-glow-blue',
  },
  {
    name: 'IPv6 Blocklist',
    desc: 'High-confidence malicious IPv6 addresses.',
    file: 'malicious_ipv6.txt',
    icon: <Network size={18} />,
    iconClass: 'icon-teal',
    glowClass: 'dl-glow-teal',
  },
  {
    name: 'CIDR Blocklist',
    desc: 'Malicious IPv4 and IPv6 subnets (CIDR notation).',
    file: 'malicious_cidrs.txt',
    icon: <Layers size={18} />,
    iconClass: 'icon-orange',
    glowClass: 'dl-glow-orange',
  },
]

function handleSpotlight(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
  e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
}

export default function Feeds() {
  return (
    <section className="section" id="feeds">
      <div className="section-head">
        <div className="section-label">Blocklists</div>
        <h2 className="section-title"><Server size={22} /> Threat Feeds</h2>
        <p className="section-desc">
          Integrate these plain text indicators directly into your Firewalls, IDS/IPS, and SIEMs. Updated regularly.
        </p>
      </div>

      <div className="dl-grid">
        {feeds.map((f, i) => (
          <motion.div 
            className="dl-card" 
            key={f.file} 
            onMouseMove={handleSpotlight}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(34, 197, 94, 0.15)" }}
          >
            <div className={`dl-glow ${f.glowClass}`}></div>
            <div className="dl-top">
              <div className={`dl-icon ${f.iconClass}`}>{f.icon}</div>
              <span className="dl-name">{f.name}</span>
            </div>
            <p className="dl-desc">{f.desc}</p>
            <a href={`${BASE}ioc/${f.file}`} className="btn btn-outline" target="_blank" rel="noopener">
              <Download size={16} /> {f.file}
            </a>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
