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
            icon={<Radar size={22} />}
            iconClass="text-red-400 bg-red-500/10 group-hover:bg-red-500/20 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-red-500/20"
            glowClass="group-hover:via-red-500/50"
            ambientClass="bg-red-500/5"
            valueId="n-total"
            sub="Active IPv4 addresses"
            trendId="trend-ips"
          />
          <StatCard
            label="Domains"
            icon={<Network size={22} />}
            iconClass="text-purple-400 bg-purple-500/10 group-hover:bg-purple-500/20 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] border border-purple-500/20"
            glowClass="group-hover:via-purple-500/50"
            ambientClass="bg-purple-500/5"
            valueId="n-domains"
            sub="Known malicious domains"
            trendId="trend-domains"
          />
          <StatCard
            label="File Hashes"
            icon={<Fingerprint size={22} />}
            iconClass="text-amber-400 bg-amber-500/10 group-hover:bg-amber-500/20 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] border border-amber-500/20"
            glowClass="group-hover:via-amber-500/50"
            ambientClass="bg-amber-500/5"
            valueId="n-hashes"
            sub="SHA-256 signatures"
            trendId="trend-hashes"
          />
          <StatCard
            label="Malicious URLs"
            icon={<Unlink size={22} />}
            iconClass="text-blue-400 bg-blue-500/10 group-hover:bg-blue-500/20 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] border border-blue-500/20"
            glowClass="group-hover:via-blue-500/50"
            ambientClass="bg-blue-500/5"
            valueId="n-urls"
            sub="Active phishing URLs"
            trendId="trend-urls"
          />
          <StatCard
            label="IPv6 Addresses"
            icon={<Network size={22} />}
            iconClass="text-teal-400 bg-teal-500/10 group-hover:bg-teal-500/20 group-hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] border border-teal-500/20"
            glowClass="group-hover:via-teal-500/50"
            ambientClass="bg-teal-500/5"
            valueId="n-ipv6"
            sub="Active IPv6 threats"
            trendId="trend-ipv6"
          />
          <StatCard
            label="CIDR Blocks"
            icon={<Layers size={22} />}
            iconClass="text-orange-400 bg-orange-500/10 group-hover:bg-orange-500/20 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] border border-orange-500/20"
            glowClass="group-hover:via-orange-500/50"
            ambientClass="bg-orange-500/5"
            valueId="n-cidrs"
            sub="Malicious subnets"
            trendId="trend-cidrs"
          />
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, icon, iconClass, glowClass, ambientClass, valueId, sub, trendId }: any) {
  return (
    <motion.div 
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/5 bg-[#10141D] p-6 sm:p-8 shadow-xl transition-all duration-500 hover:shadow-2xl hover:bg-[#151B28] hover:border-white/10 hover:-translate-y-2 backdrop-blur-xl" 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Dynamic ambient background glow */}
      <div className={`absolute -right-8 -top-8 w-40 h-40 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none ${ambientClass}`}></div>

      {/* Subtle top gradient glow effect on hover */}
      <div className={`absolute top-0 inset-x-0 h-[1px] w-full bg-gradient-to-r from-transparent via-white/0 to-transparent transition-all duration-500 ${glowClass}`}></div>
      
      <div className="flex items-center justify-between relative z-10">
        <span className="text-[15px] font-bold text-slate-400 tracking-wide group-hover:text-slate-300 transition-colors duration-300">{label}</span>
        <div className={`p-3 rounded-xl transition-all duration-500 ${iconClass}`}>{icon}</div>
      </div>
      
      <div className="mt-8 text-5xl font-black tracking-tighter text-white tabular-nums drop-shadow-sm relative z-10" id={valueId}>-</div>
      
      <div className="mt-4 text-sm text-slate-500 flex items-center gap-2 font-medium relative z-10 group-hover:text-slate-400 transition-colors duration-300">
        {sub} <span id={trendId} className="font-bold px-2.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-slate-300 shadow-inner group-hover:border-white/10 transition-colors duration-300"></span>
      </div>
    </motion.div>
  )
}
