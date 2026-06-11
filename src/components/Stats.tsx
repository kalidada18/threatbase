import { motion } from 'framer-motion'
import { Radar, Network, Fingerprint, Unlink, Layers } from 'lucide-react'

export default function Stats({ statsData }: any) {
  return (
    <section className="py-12 md:py-20" id="stats">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            label="Malicious IPs"
            icon={<Radar size={18} />}
            iconClass="text-destructive"
            valueId="n-total"
            sub="Active IPv4 addresses"
            trendId="trend-ips"
          />
          <StatCard
            label="Domains"
            icon={<Network size={18} />}
            iconClass="text-purple-500"
            valueId="n-domains"
            sub="Known malicious domains"
            trendId="trend-domains"
          />
          <StatCard
            label="File Hashes"
            icon={<Fingerprint size={18} />}
            iconClass="text-amber-500"
            valueId="n-hashes"
            sub="SHA-256 signatures"
            trendId="trend-hashes"
          />
          <StatCard
            label="Malicious URLs"
            icon={<Unlink size={18} />}
            iconClass="text-blue-500"
            valueId="n-urls"
            sub="Active phishing URLs"
            trendId="trend-urls"
          />
          <StatCard
            label="IPv6 Addresses"
            icon={<Network size={18} />}
            iconClass="text-teal-500"
            valueId="n-ipv6"
            sub="Active IPv6 threats"
            trendId="trend-ipv6"
          />
          <StatCard
            label="CIDR Blocks"
            icon={<Layers size={18} />}
            iconClass="text-orange-500"
            valueId="n-cidrs"
            sub="Malicious subnets"
            trendId="trend-cidrs"
          />
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, icon, iconClass, valueId, sub, trendId }: any) {
  return (
    <motion.div 
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-md" 
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={`p-2 rounded-lg bg-muted ${iconClass}`}>{icon}</div>
      </div>
      <div className="mt-4 text-3xl font-bold tracking-tight text-foreground tabular-nums" id={valueId}>-</div>
      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
        {sub} <span id={trendId} className="font-medium"></span>
      </div>
    </motion.div>
  )
}
