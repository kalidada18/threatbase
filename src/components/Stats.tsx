import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Radar, Network, Fingerprint, Unlink, Layers } from 'lucide-react'
import { animateValue } from '../utils'

export default function Stats({ statsData }: any) {
  useEffect(() => {
    if (statsData) {
      animateValue(document.getElementById('n-total'), statsData.total_unique_ips)
      animateValue(document.getElementById('n-domains'), statsData.total_unique_domains || 0)
      animateValue(document.getElementById('n-hashes'), statsData.total_unique_hashes || 0)
      animateValue(document.getElementById('n-urls'), statsData.total_unique_urls || 0)
      animateValue(document.getElementById('n-ipv6'), statsData.total_unique_ipv6 || 0)
      animateValue(document.getElementById('n-cidrs'), statsData.total_unique_cidrs || 0)
    }
  }, [statsData])

  return (
    <section className="py-12 md:py-20" id="stats">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            label="Malicious IPs"
            icon={<Radar size={20} />}
            iconColorClass="text-red-400 bg-red-950/30 border-red-500/20 group-hover:border-red-500/40"
            valueId="n-total"
            sub="Active IPv4 addresses"
            trendId="trend-ips"
          />
          <StatCard
            label="Domains"
            icon={<Network size={20} />}
            iconColorClass="text-purple-400 bg-purple-950/30 border-purple-500/20 group-hover:border-purple-500/40"
            valueId="n-domains"
            sub="Known malicious domains"
            trendId="trend-domains"
          />
          <StatCard
            label="File Hashes"
            icon={<Fingerprint size={20} />}
            iconColorClass="text-amber-400 bg-amber-950/30 border-amber-500/20 group-hover:border-amber-500/40"
            valueId="n-hashes"
            sub="SHA-256 signatures"
            trendId="trend-hashes"
          />
          <StatCard
            label="Malicious URLs"
            icon={<Unlink size={20} />}
            iconColorClass="text-blue-400 bg-blue-950/30 border-blue-500/20 group-hover:border-blue-500/40"
            valueId="n-urls"
            sub="Active phishing URLs"
            trendId="trend-urls"
          />
          <StatCard
            label="IPv6 Addresses"
            icon={<Network size={20} />}
            iconColorClass="text-teal-400 bg-teal-950/30 border-teal-500/20 group-hover:border-teal-500/40"
            valueId="n-ipv6"
            sub="Active IPv6 threats"
            trendId="trend-ipv6"
          />
          <StatCard
            label="CIDR Blocks"
            icon={<Layers size={20} />}
            iconColorClass="text-orange-400 bg-orange-950/30 border-orange-500/20 group-hover:border-orange-500/40"
            valueId="n-cidrs"
            sub="Malicious subnets"
            trendId="trend-cidrs"
          />
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, icon, iconColorClass, valueId, sub, trendId }: any) {
  return (
    <motion.div 
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.04] bg-slate-950/40 p-6 sm:p-8 transition-all duration-300 hover:bg-slate-900/30 hover:border-slate-700/40 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl" 
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="flex items-center justify-between relative z-10">
        <span className="text-sm font-semibold text-slate-400 tracking-wide group-hover:text-slate-300 transition-colors duration-200">{label}</span>
        <div className={`p-2.5 rounded-xl border transition-all duration-300 ${iconColorClass}`}>
          {icon}
        </div>
      </div>
      
      <div className="mt-6 text-4xl font-extrabold tracking-tight text-white tabular-nums relative z-10" id={valueId}>-</div>
      
      <div className="mt-4 text-xs text-slate-500 flex items-center justify-between font-medium relative z-10">
        <span className="group-hover:text-slate-400 transition-colors duration-200">{sub}</span>
        <span id={trendId} className="font-semibold px-2 py-0.5 rounded bg-white/[0.02] border border-white/[0.04] text-slate-300 shadow-sm group-hover:bg-white/[0.04] group-hover:border-white/[0.08] transition-colors duration-200"></span>
      </div>
    </motion.div>
  )
}
