import { useEffect } from 'react'
import { Radar, Network, Fingerprint, Unlink, Layers } from 'lucide-react'

export default function Stats({ statsData }) {
  return (
    <section className="section" id="stats">
      <div className="stats-grid">
        <StatCard
          label="Malicious IPs"
          icon={<Radar size={18} />}
          iconClass="icon-red"
          valueId="n-total"
          sub="Active IPv4 addresses"
          trendId="trend-ips"
        />
        <StatCard
          label="Domains"
          icon={<Network size={18} />}
          iconClass="icon-purple"
          valueId="n-domains"
          sub="Known malicious domains"
          trendId="trend-domains"
        />
        <StatCard
          label="File Hashes"
          icon={<Fingerprint size={18} />}
          iconClass="icon-amber"
          valueId="n-hashes"
          sub="SHA-256 signatures"
          trendId="trend-hashes"
        />
        <StatCard
          label="Malicious URLs"
          icon={<Unlink size={18} />}
          iconClass="icon-blue"
          valueId="n-urls"
          sub="Active phishing URLs"
          trendId="trend-urls"
        />
        <StatCard
          label="IPv6 Addresses"
          icon={<Network size={18} />}
          iconClass="icon-teal"
          valueId="n-ipv6"
          sub="Active IPv6 threats"
          trendId="trend-ipv6"
        />
        <StatCard
          label="CIDR Blocks"
          icon={<Layers size={18} />}
          iconClass="icon-orange"
          valueId="n-cidrs"
          sub="Malicious subnets"
          trendId="trend-cidrs"
        />
      </div>
    </section>
  )
}

function StatCard({ label, icon, iconClass, valueId, sub, trendId }) {
  return (
    <div className="stat-card" onMouseMove={handleSpotlight}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <div className={`stat-icon ${iconClass}`}>{icon}</div>
      </div>
      <div className="stat-value tabular-nums" id={valueId}>-</div>
      <div className="stat-sub">
        {sub} <span id={trendId} className="trend neutral"></span>
      </div>
    </div>
  )
}

function handleSpotlight(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
  e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
}
