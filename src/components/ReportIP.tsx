import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Flag, Globe, Tag, MessageSquare, Send, List, Inbox, ChevronLeft, ChevronRight, 
  ShieldAlert, Activity, AlertTriangle, ShieldCheck, CheckCircle2, Trophy,
  Bug, Zap, Copy, Check, Search, Sparkles, User, AlertCircle
} from 'lucide-react'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo } from '../utils'
import { Button } from '@/components/ui/button'
import Leaderboard from './Leaderboard'

const REPORT_PAGE_SIZE = 10
const SUBMIT_COOLDOWN = 15000

// DNS Whitelist IP CIDRs - community sync and feeds bypass these
const DNS_WHITELIST_CIDRS = [
  "1.0.0.0/24",       // Cloudflare DNS
  "1.1.1.0/24",       // Cloudflare DNS
  "8.8.8.0/24",       // Google DNS
  "8.8.4.0/24",       // Google DNS
  "9.9.9.0/24",       // Quad9
  "9.9.9.10/32",      // Quad9 ECS
  "149.112.112.0/24", // Quad9
  "208.67.222.0/24",  // OpenDNS
  "208.67.220.0/24",  // OpenDNS
  "4.4.4.4/32",       // Level3 DNS
  "4.2.2.0/24",       // Level3 DNS
  "94.140.14.0/24",   // AdGuard DNS
  "94.140.15.0/24",   // AdGuard DNS
]

// RFC 1918, RFC 4193, loopback, link-local, multicast and reserved space
const PRIVATE_RESERVED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32"
]

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  try {
    const [baseIp, maskStr] = cidr.split('/');
    const mask = parseInt(maskStr, 10);
    const ipLong = ipToLong(ip);
    const baseLong = ipToLong(baseIp);
    if (mask === 0) return true;
    const bitmask = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
    return (ipLong & bitmask) === (baseLong & bitmask);
  } catch (e) {
    return false;
  }
}

function isPrivateReservedIpv6(ip: string): boolean {
  const norm = ip.toLowerCase().trim();
  if (norm === '::1' || norm === '::' || norm.startsWith('::/')) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(norm)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(norm)) return true;
  if (/^ff[0-9a-f]{2}:/i.test(norm)) return true;
  if (norm.startsWith('2001:db8:') || norm.startsWith('2001:0db8:')) return true;
  if (norm.startsWith('100::') || norm.startsWith('0100::') || /^0100:0{0,3}:/i.test(norm)) return true;
  return false;
}

// Category structure with icons, custom tags and colors
const CATEGORIES = [
  { 
    id: 'Brute Force', 
    name: 'Brute Force', 
    icon: ShieldAlert, 
    color: 'orange', 
    borderColor: 'border-orange-500/20 group-hover:border-orange-500/40',
    selectedBorderColor: 'border-orange-500',
    bgColor: 'bg-orange-500/5',
    selectedBgColor: 'bg-orange-500/10',
    textColor: 'text-orange-400',
    glowColor: 'shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    description: 'Credential stuffing, SSH, or web login attacks.'
  },
  { 
    id: 'Port Scan', 
    name: 'Port Scan', 
    icon: Activity, 
    color: 'cyan', 
    borderColor: 'border-cyan-500/20 group-hover:border-cyan-500/40',
    selectedBorderColor: 'border-cyan-500',
    bgColor: 'bg-cyan-500/5',
    selectedBgColor: 'bg-cyan-500/10',
    textColor: 'text-cyan-400',
    glowColor: 'shadow-[0_0_15px_rgba(6,182,212,0.15)]',
    description: 'Scanning hosts for open ports and services.'
  },
  { 
    id: 'Phishing', 
    name: 'Phishing', 
    icon: Globe, 
    color: 'blue', 
    borderColor: 'border-blue-500/20 group-hover:border-blue-500/40',
    selectedBorderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/5',
    selectedBgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    glowColor: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]',
    description: 'Phishing pages or credential harvesting portals.'
  },
  { 
    id: 'Malware / C2', 
    name: 'Malware / C2', 
    icon: Bug, 
    color: 'red', 
    borderColor: 'border-red-500/20 group-hover:border-red-500/40',
    selectedBorderColor: 'border-red-500',
    bgColor: 'bg-red-500/5',
    selectedBgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
    glowColor: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
    description: 'Command & Control servers or malware distribution.'
  },
  { 
    id: 'DDoS', 
    name: 'DDoS', 
    icon: Zap, 
    color: 'purple', 
    borderColor: 'border-purple-500/20 group-hover:border-purple-500/40',
    selectedBorderColor: 'border-purple-500',
    bgColor: 'bg-purple-500/5',
    selectedBgColor: 'bg-purple-500/10',
    textColor: 'text-purple-400',
    glowColor: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]',
    description: 'Denial of Service source or botnet nodes.'
  },
  { 
    id: 'Spam', 
    name: 'Spam', 
    icon: Inbox, 
    color: 'pink', 
    borderColor: 'border-pink-500/20 group-hover:border-pink-500/40',
    selectedBorderColor: 'border-pink-500',
    bgColor: 'bg-pink-500/5',
    selectedBgColor: 'bg-pink-500/10',
    textColor: 'text-pink-400',
    glowColor: 'shadow-[0_0_15px_rgba(236,72,153,0.15)]',
    description: 'Malicious email campaigns or comment spam bots.'
  },
  { 
    id: 'Exploit Attempt', 
    name: 'Exploit Attempt', 
    icon: AlertTriangle, 
    color: 'amber', 
    borderColor: 'border-amber-500/20 group-hover:border-amber-500/40',
    selectedBorderColor: 'border-amber-500',
    bgColor: 'bg-amber-500/5',
    selectedBgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    glowColor: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    description: 'Application vulnerability exploits (SQLi, CVE tests).'
  },
  { 
    id: 'Other', 
    name: 'Other', 
    icon: MessageSquare, 
    color: 'slate', 
    borderColor: 'border-slate-500/20 group-hover:border-slate-500/40',
    selectedBorderColor: 'border-slate-500',
    bgColor: 'bg-slate-500/5',
    selectedBgColor: 'bg-slate-500/10',
    textColor: 'text-slate-400',
    glowColor: 'shadow-[0_0_15px_rgba(100,116,139,0.15)]',
    description: 'Suspicious requests or custom report category.'
  }
]

export default function ReportIP({ addToast }: any) {
  const [ipValue, setIpValue] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')
  const [alias, setAlias] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'feed' | 'leaderboard'>('feed')
  const lastSubmitRef = useRef(0)

  // Real-time IP address status validation state
  const [ipStatus, setIpStatus] = useState<{ type: 'empty' | 'valid_v4' | 'valid_v6' | 'private' | 'whitelisted' | 'invalid', msg: string }>({ type: 'empty', msg: '' })

  // Reported IPs table state
  const [reports, setReports] = useState<any[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)

  // Live filter and search state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All')
  const [copiedIp, setCopiedIp] = useState<string | null>(null)

  const totalPages = Math.ceil(reportCount / REPORT_PAGE_SIZE)

  // Real-time IP checks
  useEffect(() => {
    const raw = ipValue.trim()
    if (!raw) {
      setIpStatus({ type: 'empty', msg: '' })
      return
    }
    
    const isV4 = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(raw)
    const isV6 = raw.includes(':') && /^[0-9a-fA-F:]+$/.test(raw)
    
    if (isV4 || isV6) {
      let isPrivate = false
      let isWhitelisted = false
      let whitelistProvider = ''

      if (isV4) {
        // Check private/reserved ranges
        const ipLong = ipToLong(raw)
        for (const cidr of PRIVATE_RESERVED_CIDRS) {
          if (inCidr(raw, cidr)) {
            isPrivate = true
            break
          }
        }
        
        // Check DNS Whitelist CIDRs
        for (const cidr of DNS_WHITELIST_CIDRS) {
          if (inCidr(raw, cidr)) {
            isWhitelisted = true
            // Match provider string
            if (cidr.includes("1.0.0.0") || cidr.includes("1.1.1.0")) whitelistProvider = "Cloudflare DNS"
            else if (cidr.includes("8.8.8.0") || cidr.includes("8.8.4.0")) whitelistProvider = "Google DNS"
            else if (cidr.includes("9.9.9.0") || cidr.includes("9.9.9.10") || cidr.includes("149.112.112.0")) whitelistProvider = "Quad9 DNS"
            else if (cidr.includes("208.67.222.0") || cidr.includes("208.67.220.0")) whitelistProvider = "OpenDNS"
            else if (cidr.includes("4.4.4.4") || cidr.includes("4.2.2.0")) whitelistProvider = "Level3 DNS"
            else if (cidr.includes("94.140.14.0") || cidr.includes("94.140.15.0")) whitelistProvider = "AdGuard DNS"
            break
          }
        }
      } else if (isV6) {
        isPrivate = isPrivateReservedIpv6(raw)
      }
      
      if (isWhitelisted) {
        setIpStatus({ 
          type: 'whitelisted', 
          msg: `Whitelisted IP detected (${whitelistProvider || 'DNS Provider'}). Submissions of safe infrastructure are blocked to prevent false-positives.` 
        })
      } else if (isPrivate) {
        setIpStatus({ 
          type: 'private', 
          msg: 'Private/Reserved range warning. These addresses are local/special and are filtered out of public feeds.' 
        })
      } else {
        setIpStatus({ 
          type: isV4 ? 'valid_v4' : 'valid_v6', 
          msg: `Public verified ${isV4 ? 'IPv4' : 'IPv6'} address structure recognized.` 
        })
      }
    } else {
      setIpStatus({ type: 'invalid', msg: 'Format must be a valid IPv4 (e.g. 1.1.1.1) or IPv6 address.' })
    }
  }, [ipValue])

  const loadReportedIPs = useCallback(async (pg = 0) => {
    if (!supabaseClient) return
    const p = Math.max(0, pg)
    setPage(p)
    setLoading(true)
    setIsEmpty(false)

    const from = p * REPORT_PAGE_SIZE
    const to = from + REPORT_PAGE_SIZE - 1

    try {
      let query = supabaseClient
        .from('reported_ips')
        .select('*', { count: 'exact' })

      if (searchQuery.trim()) {
        query = query.or(`ip.ilike.%${searchQuery.trim()}%,comment.ilike.%${searchQuery.trim()}%,reporter_alias.ilike.%${searchQuery.trim()}%`)
      }

      if (selectedCategoryFilter !== 'All') {
        query = query.eq('category', selectedCategoryFilter)
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      if (!data || data.length === 0) {
        if (p === 0) {
          setIsEmpty(true)
          setReports([])
          setReportCount(0)
        } else {
          loadReportedIPs(p - 1)
          return
        }
      } else {
        setReports(data)
        setReportCount(count || 0)
        setIsEmpty(false)
      }
    } catch (err) {
      console.error('Failed to load reports:', err)
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedCategoryFilter])

  // Trigger load with page reset when filters/search changes
  useEffect(() => {
    setPage(0)
  }, [searchQuery, selectedCategoryFilter])

  // Debounced load effect
  useEffect(() => {
    const timer = setTimeout(() => loadReportedIPs(page), 400)
    return () => clearTimeout(timer)
  }, [loadReportedIPs, page])

  const handleSubmit = useCallback(async () => {
    if (!supabaseClient) {
      addToast('Supabase connection unavailable', 'error')
      return
    }

    const now = Date.now()
    if (now - lastSubmitRef.current < SUBMIT_COOLDOWN) {
      const remaining = Math.ceil((SUBMIT_COOLDOWN - (now - lastSubmitRef.current)) / 1000)
      addToast(`Please wait ${remaining}s before submitting again`, 'error')
      return
    }

    if (!ipValue.trim()) {
      addToast('Please enter an IP address', 'error')
      return
    }

    // Check validator states
    const raw = ipValue.trim()
    const isV4 = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(raw)
    const isV6 = raw.includes(':') && /^[0-9a-fA-F:]+$/.test(raw)

    if (!isV4 && !isV6) {
      addToast('Please enter a valid IPv4 or IPv6 address', 'error')
      return
    }

    // Double check blacklist / whitelist client side to block transmission
    let blockSubmit = false
    if (isV4) {
      for (const cidr of DNS_WHITELIST_CIDRS) {
        if (inCidr(raw, cidr)) {
          blockSubmit = true
          break
        }
      }
      for (const cidr of PRIVATE_RESERVED_CIDRS) {
        if (inCidr(raw, cidr)) {
          blockSubmit = true
          break
        }
      }
    } else if (isV6) {
      blockSubmit = isPrivateReservedIpv6(raw)
    }

    if (blockSubmit) {
      addToast('Submission blocked due to invalid, private, or whitelisted IP address', 'error')
      return
    }

    if (!category) {
      addToast('Please select a threat category', 'error')
      return
    }

    setSubmitting(true)

    try {
      const { error } = await supabaseClient
        .from('reported_ips')
        .insert([{ ip: raw, category, comment: comment.trim(), reporter_alias: alias.trim() || null }])

      if (error) throw error

      lastSubmitRef.current = Date.now()
      setSubmitSuccess(true)
      setIpValue('')
      setCategory('')
      setComment('')
      loadReportedIPs(0)
    } catch (err: any) {
      console.error('Submit error:', err)
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [ipValue, category, comment, alias, addToast, loadReportedIPs])

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip)
    setCopiedIp(ip)
    addToast(`Copied ${ip} to clipboard!`, 'success')
    setTimeout(() => setCopiedIp(null), 1500)
  }

  const getCategoryColor = (cat: string) => {
    if (cat.includes('Brute')) return 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
    if (cat.includes('Malware')) return 'bg-red-500/10 text-red-400 border border-red-500/20'
    if (cat.includes('DDoS')) return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    if (cat.includes('Phish')) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    if (cat.includes('Scan')) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
    if (cat.includes('Exploit')) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
    return 'bg-slate-500/10 text-slate-300 border border-slate-500/20'
  }

  const getDotColor = (cat: string) => {
    if (cat.includes('Brute')) return 'bg-orange-400'
    if (cat.includes('Malware')) return 'bg-red-400'
    if (cat.includes('DDoS')) return 'bg-purple-400'
    if (cat.includes('Phish')) return 'bg-blue-400'
    if (cat.includes('Scan')) return 'bg-cyan-400'
    if (cat.includes('Exploit')) return 'bg-amber-400'
    return 'bg-slate-400'
  }

  // Compute live local statistics for community header dashboard
  const computeMetrics = () => {
    if (!reports || reports.length === 0) {
      return { uniqueIps: 0, activeDefenders: 0, primaryVector: 'N/A' }
    }
    const uniqueIps = new Set(reports.map(r => r.ip)).size
    const defenders = new Set(reports.map(r => r.reporter_alias).filter(a => a && a.trim().length > 0)).size
    
    const categoriesMap: Record<string, number> = {}
    reports.forEach(r => {
      if (r.category) categoriesMap[r.category] = (categoriesMap[r.category] || 0) + 1
    })
    
    let topCategory = 'N/A'
    let maxCount = 0
    Object.entries(categoriesMap).forEach(([cat, val]) => {
      if (val > maxCount) {
        maxCount = val
        topCategory = cat
      }
    })

    return { uniqueIps, activeDefenders: defenders || 1, primaryVector: topCategory }
  }

  const metrics = computeMetrics()
  const canSubmit = ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'

  return (
    <main className="min-h-screen pt-28 pb-24 relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">
        
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-14 text-center relative"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/60 border border-white/[0.06] backdrop-blur-xl shadow-2xl text-[10px] font-bold uppercase tracking-widest mb-6 text-slate-300 select-none">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            Crowdsourced Threat Intel
          </div>
          <h1 className="text-4xl md:text-5xl font-black flex flex-col items-center justify-center gap-2 text-white tracking-tight pb-2">
            Community Intelligence
          </h1>
          <p className="mt-4 text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed font-medium">
            Empower global defense networks. Submit malicious IPs, scan targets, and log Indicators of Compromise (IoCs) to our real-time database.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          
          {/* Left Column: Submission Form */}
          <motion.div 
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="xl:col-span-5"
          >
            <div className="rounded-2xl border border-white/[0.07] bg-slate-900/35 backdrop-blur-xl relative overflow-hidden group shadow-[0_20px_50px_rgba(0,0,0,0.5)] h-full">
              
              <div className="p-6 sm:p-7 relative z-10 flex flex-col h-full justify-between">
                <AnimatePresence mode="wait">
                  {!submitSuccess ? (
                    <motion.div 
                      key="form"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
                      transition={{ duration: 0.3 }}
                      className="space-y-5.5"
                    >
                      <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                          <Flag className="text-red-500 animate-pulse" size={20} /> Transmit Threat Report
                        </h2>
                        <p className="text-slate-400 text-xs mt-1.5 font-medium leading-relaxed">
                          Your telemetry helps identify active attack nodes. Verified submissions compile into the firewall feed.
                        </p>
                      </div>

                      {/* IP Input with Intelligent Validator */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1 flex items-center gap-1" htmlFor="rip-ip-input">
                          <Globe size={13} className="text-slate-500" /> Target IP Address <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            id="rip-ip-input"
                            className={`w-full h-11 rounded-xl border pl-4 pr-10 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus-visible:outline-none transition-all duration-300 bg-slate-950/60 ${
                              ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6' 
                                ? 'border-emerald-500/30 focus-visible:border-emerald-500/50 focus-visible:ring-1 focus-visible:ring-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.05)]' 
                                : ipStatus.type === 'private' 
                                ? 'border-amber-500/30 focus-visible:border-amber-500/50 focus-visible:ring-1 focus-visible:ring-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.05)]' 
                                : ipStatus.type === 'whitelisted' || ipStatus.type === 'invalid' 
                                ? 'border-rose-500/30 focus-visible:border-rose-500/50 focus-visible:ring-1 focus-visible:ring-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.05)]' 
                                : 'border-white/5 focus-visible:border-red-500/30 focus-visible:ring-1 focus-visible:ring-red-500/20'
                            }`}
                            placeholder="IPv4 or IPv6 (e.g. 185.220.101.5)"
                            autoComplete="off"
                            spellCheck="false"
                            value={ipValue}
                            onChange={(e) => setIpValue(e.target.value)}
                          />
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
                            {ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6' ? (
                              <ShieldCheck className="text-emerald-400" size={16} />
                            ) : ipStatus.type === 'private' ? (
                              <AlertTriangle className="text-amber-400" size={16} />
                            ) : ipStatus.type === 'whitelisted' ? (
                              <AlertCircle className="text-rose-400 animate-bounce" size={16} />
                            ) : ipStatus.type === 'invalid' ? (
                              <AlertTriangle className="text-rose-500" size={16} />
                            ) : null}
                          </div>
                        </div>

                        {/* Animated Validator Alert box */}
                        <AnimatePresence>
                          {ipStatus.type !== 'empty' && (
                            <motion.div
                              initial={{ opacity: 0, height: 0, y: -8 }}
                              animate={{ opacity: 1, height: 'auto', y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -8 }}
                              className={`p-3 rounded-xl border text-[11px] font-medium leading-relaxed mt-2 flex items-start gap-2.5 transition-all duration-300 overflow-hidden ${
                                ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'
                                  ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400'
                                  : ipStatus.type === 'private'
                                  ? 'bg-amber-500/5 border-amber-500/15 text-amber-400'
                                  : 'bg-rose-500/5 border-rose-500/15 text-rose-400'
                              }`}
                            >
                              {ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6' ? (
                                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              ) : ipStatus.type === 'whitelisted' ? (
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              )}
                              <div>
                                <span className="font-bold uppercase tracking-widest block text-[9px] mb-0.5">
                                  {ipStatus.type === 'valid_v4' && 'Verified Public IPv4'}
                                  {ipStatus.type === 'valid_v6' && 'Verified Public IPv6'}
                                  {ipStatus.type === 'private' && 'Local Address warning'}
                                  {ipStatus.type === 'whitelisted' && 'Safe infrastructure blocked'}
                                  {ipStatus.type === 'invalid' && 'Syntax Error'}
                                </span>
                                {ipStatus.msg}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Interactive Threat Category Card Selector */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1 flex items-center gap-1">
                          <Tag size={13} className="text-slate-500" /> Threat Category <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2.5 select-none">
                          {CATEGORIES.map((cat) => {
                            const IconComp = cat.icon
                            const isSelected = category === cat.id
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setCategory(cat.id)}
                                className={`flex flex-col items-start text-left p-3.5 rounded-xl border transition-all duration-300 relative overflow-hidden group active:scale-[0.97] ${
                                  isSelected
                                    ? `${cat.selectedBgColor} ${cat.selectedBorderColor} ${cat.glowColor} text-white scale-[1.01]`
                                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10 hover:bg-slate-950/60'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <IconComp size={14} className={`transition-colors duration-300 ${isSelected ? cat.textColor : 'text-slate-500'}`} />
                                    <span className="text-[11px] font-bold tracking-wide">{cat.name}</span>
                                  </div>
                                  {isSelected && (
                                    <CheckCircle2 size={12} className={cat.textColor} />
                                  )}
                                </div>
                                <p className="text-[9.5px] leading-snug text-slate-500 font-medium group-hover:text-slate-400 transition-colors duration-300">
                                  {cat.description}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Agent Alias Input */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1 flex items-center gap-1" htmlFor="rip-alias">
                          <User size={13} className="text-slate-500" /> Agent Alias <span className="text-slate-500 font-normal lowercase">(optional)</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <span className="text-slate-600 font-mono font-bold text-xs">@</span>
                          </div>
                          <input
                            type="text"
                            id="rip-alias"
                            className="w-full h-11 rounded-xl border border-white/5 bg-slate-950/60 pl-8 pr-4 text-xs font-semibold text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-red-500/30 focus-visible:ring-1 focus-visible:ring-red-500/20 transition-all shadow-inner"
                            placeholder="Anonymous Defender"
                            autoComplete="off"
                            spellCheck="false"
                            maxLength={24}
                            value={alias}
                            onChange={(e) => setAlias(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Notes with Realtime Count Constraints */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1" htmlFor="rip-comment">
                            <MessageSquare size={13} className="text-slate-500" /> Analyst Notes
                          </label>
                          <span className={`text-[9px] font-bold font-mono tracking-wider ${comment.length > 450 ? 'text-rose-400 animate-pulse' : comment.length > 300 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {comment.length} / 500
                          </span>
                        </div>
                        <div className="relative">
                          <textarea
                            id="rip-comment"
                            maxLength={500}
                            className="w-full min-h-[85px] rounded-xl border border-white/5 bg-slate-950/60 px-4 py-3 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-red-500/30 focus-visible:ring-1 focus-visible:ring-red-500/20 transition-all shadow-inner resize-none font-medium leading-relaxed"
                            rows={3}
                            placeholder="Provide observed activity, threat characteristics, logs..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          ></textarea>
                        </div>
                      </div>

                      {/* Transmit Trigger */}
                      <Button
                        className={`w-full h-12 rounded-xl text-white font-bold tracking-wider transition-all shadow-lg mt-3 flex items-center justify-center gap-2 border select-none ${
                          canSubmit
                            ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 border-red-500/25 shadow-[0_4px_25px_rgba(239,68,68,0.12)] active:scale-[0.98]'
                            : 'bg-slate-900 border-white/5 text-slate-600 cursor-not-allowed'
                        }`}
                        onClick={handleSubmit}
                        disabled={submitting || !canSubmit}
                      >
                        {submitting ? (
                          <>
                            <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            <span>Transmitting Intel...</span>
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            <span>Transmit Intel Report</span>
                          </>
                        )}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="success"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                      transition={{ duration: 0.4 }}
                      className="flex flex-col items-center justify-center text-center py-12"
                    >
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl animate-pulse"></div>
                        <div className="bg-gradient-to-b from-emerald-400 to-emerald-600 text-white p-5 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.35)] relative">
                          <ShieldCheck size={40} strokeWidth={2.5} />
                        </div>
                      </div>
                      <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                        Intel Dispatched
                      </h2>
                      <p className="text-slate-400 text-xs leading-relaxed mb-8 px-4 max-w-xs font-medium">
                        Your submission has been cataloged in our community log database. Our backend compiler evaluates reports every few hours to update live blocklists.
                      </p>
                      
                      <Button
                        className="h-11 px-6 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 transition-all backdrop-blur-md flex items-center gap-2 active:scale-95 shadow-lg"
                        onClick={() => setSubmitSuccess(false)}
                      >
                        <Send size={12} />
                        Report Another Target
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Database Feed & Leaderboard */}
          <motion.div 
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="xl:col-span-7 flex flex-col"
          >
            <div className="rounded-2xl border border-white/[0.07] bg-slate-900/35 backdrop-blur-xl flex flex-col overflow-hidden relative h-full shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              
              {/* Tab Selector & online stats */}
              <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.06] bg-slate-950/20 relative z-10 gap-3">
                <div className="flex p-0.5 bg-slate-950/60 border border-white/5 rounded-xl self-start">
                  <button 
                    onClick={() => setActiveTab('feed')}
                    className={`font-bold text-[11px] uppercase tracking-wider py-2 px-4 rounded-lg flex items-center gap-2 transition-all ${
                      activeTab === 'feed' 
                        ? 'bg-white/5 text-white shadow-sm border border-white/5' 
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <List size={13} /> Submissions Feed
                  </button>
                  <button 
                    onClick={() => setActiveTab('leaderboard')}
                    className={`font-bold text-[11px] uppercase tracking-wider py-2 px-4 rounded-lg flex items-center gap-2 transition-all ${
                      activeTab === 'leaderboard' 
                        ? 'bg-white/5 text-cyan-400 shadow-sm border border-white/5' 
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Trophy size={13} /> Top Defenders
                  </button>
                </div>

                {activeTab === 'feed' && (
                  <div className="text-[10px] text-slate-400 font-bold bg-slate-950/50 px-3.5 py-1.5 rounded-lg border border-white/5 shadow-inner flex items-center gap-2 self-start sm:self-auto select-none">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    {reportCount > 0 ? `${fmt(reportCount)} Logged Indicators` : 'Intel Base Online'}
                  </div>
                )}
              </div>

              {activeTab === 'leaderboard' ? (
                <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                  <Leaderboard />
                </div>
              ) : (
                <>
                  {/* Live Search & Filter pills */}
                  <div className="px-5 py-3 border-b border-white/[0.04] bg-slate-950/10 relative z-10 flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Search database by IP, alias, or notes..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full h-10 pl-10 pr-8 text-[11px] font-medium rounded-xl bg-slate-950/50 border border-white/5 text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-cyan-500/25 focus-visible:ring-1 focus-visible:ring-cyan-500/10 transition-all"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Filter Pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 mt-0.5 no-scrollbar select-none">
                      {['All', 'Brute Force', 'Port Scan', 'Phishing', 'Malware / C2', 'DDoS', 'Spam', 'Exploit Attempt', 'Other'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategoryFilter(cat)}
                          className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                            selectedCategoryFilter === cat
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25 shadow-[0_0_10px_rgba(6,182,212,0.05)]'
                              : 'bg-slate-900/40 text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/60'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Metrics Header Cards */}
                  <div className="px-5 pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Metric 1 */}
                      <div className="rounded-xl border border-white/5 bg-slate-950/20 backdrop-blur-md p-3.5 flex flex-col justify-between hover:border-white/[0.08] transition-colors duration-300">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Telemetry</span>
                          <ShieldAlert size={14} className="text-red-500" />
                        </div>
                        <div className="mt-2.5">
                          <span className="text-lg font-bold text-slate-100 font-mono tracking-tight">{fmt(reportCount)}</span>
                          <span className="text-[8px] block text-slate-500 font-bold uppercase tracking-widest mt-0.5">Total Reports</span>
                        </div>
                      </div>

                      {/* Metric 2 */}
                      <div className="rounded-xl border border-white/5 bg-slate-950/20 backdrop-blur-md p-3.5 flex flex-col justify-between hover:border-white/[0.08] transition-colors duration-300">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Unique</span>
                          <Globe size={14} className="text-cyan-400" />
                        </div>
                        <div className="mt-2.5">
                          <span className="text-lg font-bold text-slate-100 font-mono tracking-tight">{metrics.uniqueIps}</span>
                          <span className="text-[8px] block text-slate-500 font-bold uppercase tracking-widest mt-0.5">Indicators</span>
                        </div>
                      </div>

                      {/* Metric 3 */}
                      <div className="rounded-xl border border-white/5 bg-slate-950/20 backdrop-blur-md p-3.5 flex flex-col justify-between hover:border-white/[0.08] transition-colors duration-300">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Defenders</span>
                          <User size={14} className="text-purple-400" />
                        </div>
                        <div className="mt-2.5">
                          <span className="text-lg font-bold text-slate-100 font-mono tracking-tight">{metrics.activeDefenders}</span>
                          <span className="text-[8px] block text-slate-500 font-bold uppercase tracking-widest mt-0.5">Agents</span>
                        </div>
                      </div>

                      {/* Metric 4 */}
                      <div className="rounded-xl border border-white/5 bg-slate-950/20 backdrop-blur-md p-3.5 flex flex-col justify-between hover:border-white/[0.08] transition-colors duration-300">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Vector</span>
                          <Bug size={14} className="text-orange-400" />
                        </div>
                        <div className="mt-2.5">
                          <span className="text-xs font-bold text-slate-100 truncate block tracking-wide">{metrics.primaryVector}</span>
                          <span className="text-[8px] block text-slate-500 font-bold uppercase tracking-widest mt-1">Top Vector</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Main Table Container */}
                  <div className="flex-1 overflow-x-auto mt-4">
                    {loading ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 py-24">
                        <div className="relative h-10 w-10 mb-4">
                          <div className="absolute inset-0 rounded-full border-2 border-slate-800"></div>
                          <div className="absolute inset-0 rounded-full border-2 border-red-500 border-t-transparent animate-spin"></div>
                        </div>
                        <p className="font-semibold tracking-wider text-[10px] text-slate-500 uppercase">Querying Supabase Feed...</p>
                      </div>
                    ) : isEmpty ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-20 px-6">
                        <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/5">
                          <Inbox size={40} className="opacity-40 animate-pulse" />
                        </div>
                        <p className="text-base font-bold text-white mb-1">No Indicators Match</p>
                        <p className="text-xs max-w-xs text-slate-400 leading-relaxed">
                          No reports match your current filtering or search criteria. Try modifying your inputs.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-xs text-left">
                        <thead className="text-[9px] uppercase bg-white/[0.01] text-slate-500 font-bold border-b border-white/5 tracking-widest select-none">
                          <tr>
                            <th className="px-6 py-4">IP Address</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4">Context</th>
                            <th className="px-6 py-4 text-right">Age</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          <AnimatePresence>
                            {reports.map((row, idx) => (
                              <motion.tr 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.02 }}
                                key={row.id || row.created_at} 
                                className="hover:bg-white/[0.015] transition-colors group"
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <div className="font-mono font-bold text-slate-200 flex items-center gap-2">
                                      <span>{row.ip}</span>
                                      
                                      {/* Copy to Clipboard Trigger */}
                                      <button
                                        type="button"
                                        onClick={() => handleCopyIp(row.ip)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300"
                                        title="Copy IP address"
                                      >
                                        {copiedIp === row.ip ? (
                                          <Check size={12} className="text-emerald-400" />
                                        ) : (
                                          <Copy size={12} />
                                        )}
                                      </button>
                                    </div>
                                    {row.reporter_alias && (
                                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                                        By <span className="text-slate-400">@{row.reporter_alias}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${getCategoryColor(row.category)}`}>
                                    <span className={`w-1 h-1 rounded-full mr-1.5 ${getDotColor(row.category)}`} />
                                    {row.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-400 max-w-[200px] sm:max-w-xs md:max-w-sm">
                                  {row.comment ? (
                                    <span className="flex items-start gap-1.5 group-hover:text-slate-300 transition-colors">
                                      <AlertTriangle size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
                                      <span className="whitespace-normal leading-relaxed text-slate-400 font-medium">{row.comment}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 italic text-[11px] font-medium">No Context Recorded</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium text-right group-hover:text-slate-400 transition-colors">
                                  {timeAgo(row.created_at)}
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination Section */}
                  {totalPages > 1 && !loading && !isEmpty && (
                    <div className="p-4 md:px-6 border-t border-white/[0.05] flex items-center justify-between bg-slate-950/20 select-none">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:bg-white/5 hover:text-white rounded-lg transition-colors font-bold text-xs"
                        onClick={() => loadReportedIPs(page - 1)}
                        disabled={page === 0}
                      >
                        <ChevronLeft size={14} className="mr-0.5" /> Prev
                      </Button>
                      <div className="flex gap-1.5">
                        {[...Array(totalPages)].map((_, i) => (
                          <div 
                            key={i} 
                            onClick={() => loadReportedIPs(i)}
                            className={`transition-all duration-300 rounded-full cursor-pointer ${i === page ? 'h-1.5 w-4.5 bg-white' : 'h-1.5 w-1.5 bg-slate-700 hover:bg-slate-500'}`}
                          />
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:bg-white/5 hover:text-white rounded-lg transition-colors font-bold text-xs"
                        onClick={() => loadReportedIPs(page + 1)}
                        disabled={page >= totalPages - 1}
                      >
                        Next <ChevronRight size={14} className="ml-0.5" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  )
}
