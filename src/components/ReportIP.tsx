import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flag, Globe, Tag, MessageSquare, Send, List, Inbox, ChevronLeft, ChevronRight,
  ShieldAlert, Activity, AlertTriangle, ShieldCheck, CheckCircle2, Trophy,
  HelpCircle, User, Info, Check, Copy, Lock
} from 'lucide-react'
import { Link } from 'react-router-dom'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo } from '../utils'
import { Button } from '@/components/ui/button'
import { Typewriter } from '@/components/ui/typewriter'
import Leaderboard from './Leaderboard'
import { useAuth } from '../AuthContext'
import { SignInPage } from '@/components/ui/sign-in-flow-1'

const REPORT_PAGE_SIZE = 10
const SUBMIT_COOLDOWN = 15000

// DNS Whitelist IP CIDRs
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

// RFC 1918, loopback, multicast, link-local and reserved IPv4 CIDRs
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

// 23 threat categories exactly ordered row-by-row matching the 4-column mockup layout
const THREAT_CATEGORIES = [
  { id: 'dns_compromise', name: 'DNS Compromise', description: 'Domain Hijacking, unauthorized DNS record modifications.' },
  { id: 'ddos_attack', name: 'DDoS Attack', description: 'Distributed denial of service traffic sourcing or botnet nodes.' },
  { id: 'email_spam', name: 'Email Spam', description: 'IP is generating high volumes of unsolicited spam emails.' },
  { id: 'brute_force', name: 'Brute-Force', description: 'General authentication brute-forcing across other protocols.' },
  { id: 'dns_poisoning', name: 'DNS Poisoning', description: 'Spoofing DNS responses to redirect client traffic to malicious hosts.' },
  { id: 'open_proxy', name: 'Open Proxy', description: 'IP hosts an open proxy server used to mask traffic origin.' },
  { id: 'port_scan', name: 'Port Scan', description: 'Port scanning, service enumeration, or host scanning.' },
  { id: 'bad_web_bot', name: 'Bad Web Bot', description: 'Aggressive web scraping, crawling, or vulnerability scanning bots.' },
  { id: 'fraud_orders', name: 'Fraud Orders', description: 'Transactional fraud or credit card testing behavior.' },
  { id: 'web_spam', name: 'Web Spam', description: 'Forum spam, automated comment submissions, or SEO spam.' },
  { id: 'spoofing', name: 'Spoofing', description: 'IP spoofing or protocol header spoofing.' },
  { id: 'exploited_host', name: 'Exploited Host', description: 'Host shows signs of active exploitation or backdoor beacons.' },
  { id: 'web_app_attack', name: 'Web App Attack', description: 'Attacks targeting web applications (LFI, RFI, directory traversal).' },
  { id: 'ftp_brute_force', name: 'FTP Brute-Force', description: 'FTP credential brute-forcing or automated file system probing.' },
  { id: 'fraud_voip', name: 'Fraud VoIP', description: 'VoIP hacking, SIP brute forcing, or calling fraud.' },
  { id: 'hacking', name: 'Hacking', description: 'Active hacking attempts, shell uploads, or payload staging.' },
  { id: 'ssh', name: 'SSH', description: 'SSH credential brute-forcing or unauthorized access attempts.' },
  { id: 'ping_of_death', name: 'Ping of Death', description: 'Malformed ICMP packet ping flooding attempts.' },
  { id: 'blog_spam', name: 'Blog Spam', description: 'Blog comments, trackbacks, or guestbook spamming.' },
  { id: 'sql_injection', name: 'SQL Injection', description: 'Database manipulation attempts using SQL injections.' },
  { id: 'iot_targeted', name: 'IoT Targeted', description: 'Attacking smart devices, routers, cameras, or custom firmware.' },
  { id: 'phishing', name: 'Phishing', description: 'Hosting phishing sites or harvesting login credentials.' },
  { id: 'vpn_ip', name: 'VPN IP', description: 'IP belongs to a commercial VPN, Tor exit node, or proxy service.' }
]

export default function ReportIP({ addToast }: any) {
  const { user, profile, signInWithGoogle } = useAuth()
  const [ipValue, setIpValue] = useState('')
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [alias, setAlias] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'feed' | 'leaderboard'>('feed')
  const [showOptional, setShowOptional] = useState(false)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const lastSubmitRef = useRef(0)

  // Sync profile username into alias when logged in
  useEffect(() => {
    if (profile?.username) {
      setAlias(profile.username)
    } else if (user) {
      const fallback = user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
      setAlias(fallback.replace(/[^a-zA-Z0-9_-]/g, ''))
    }
  }, [profile, user])

  // Real-time IP address status validation state
  const [ipStatus, setIpStatus] = useState<{ type: 'empty' | 'valid_v4' | 'valid_v6' | 'private' | 'whitelisted' | 'invalid', msg: string }>({ type: 'empty', msg: '' })

  // Reported IPs table state
  const [reports, setReports] = useState<any[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)
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
      setIpStatus({ type: 'invalid', msg: 'Format must be a valid IPv4 (e.g. 8.8.8.8) or IPv6 address.' })
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
      const { data, error, count } = await supabaseClient
        .from('reported_ips')
        .select('*', { count: 'exact' })
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
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => loadReportedIPs(0), 500)
    return () => clearTimeout(timer)
  }, [loadReportedIPs])

  const toggleCategory = (catName: string) => {
    setSelectedCats(prev =>
      prev.includes(catName)
        ? prev.filter(c => c !== catName)
        : [...prev, catName]
    )
  }

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

    if (selectedCats.length === 0) {
      addToast('Please select at least one threat category', 'error')
      return
    }

    setSubmitting(true)

    // Save multiple categories joined as a comma-separated string
    const joinedCategories = selectedCats.join(', ')

    try {
      const { error } = await supabaseClient
        .from('reported_ips')
        .insert([{ ip: raw, category: joinedCategories, comment: comment.trim(), reporter_alias: alias.trim() || null }])

      if (error) throw error

      lastSubmitRef.current = Date.now()
      setSubmitSuccess(true)
      setIpValue('')
      setSelectedCats([])
      setComment('')
      loadReportedIPs(0)
    } catch (err: any) {
      console.error('Submit error:', err)
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [ipValue, selectedCats, comment, alias, addToast, loadReportedIPs])

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

  if (!user) {
    return <SignInPage />
  }

  const canSubmit = ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'

  return (
    <main className="min-h-screen pt-28 pb-24 relative bg-[#0B0F19] overflow-hidden font-sans bg-cyber-grid-green bg-scanlines">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-12 relative z-10">

        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center relative"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 text-emerald-400 backdrop-blur-xl shadow-2xl text-[10px] uppercase select-none badge-cyber mb-5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-blink mr-1"></span>
            Active Threat Database
          </div>
          <h1 className="text-5xl md:text-6xl font-black flex items-center justify-center gap-2 text-white tracking-tighter pb-2">
            Community <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">Intel</span>
          </h1>
          <p className="mt-3 text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Report malicious infrastructure. Submissions feed the community blacklist to defend networks globally.
          </p>
        </motion.div>

        {/* Top Section: Form Card / Lock Screen */}
        <div className="space-y-10">
          <motion.div
            key="form-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
            transition={{ duration: 0.5 }}
            className="w-full"
          >
            <div className="rounded-[32px] bg-slate-950/40 backdrop-blur-3xl relative overflow-hidden group border border-white/[0.05] shadow-[0_0_80px_rgba(16,185,129,0.03)]">
                  <div className="p-6 md:p-8 relative z-10 flex flex-col justify-between">
                    <AnimatePresence mode="wait">
                      {!submitSuccess ? (
                        <motion.div
                          key="form"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
                          transition={{ duration: 0.3 }}
                          className="space-y-6"
                        >
                          {/* IP Input with Verification */}
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-300 ml-1" htmlFor="rip-ip-input">
                              IP Address <span className="text-slate-500 font-normal lowercase">(ex. 8.8.8.8)</span>
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                id="rip-ip-input"
                                className="w-full h-14 rounded-2xl border border-white/[0.05] bg-white/[0.02] pl-5 pr-12 text-sm font-mono font-medium text-white placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-emerald-500/40 focus-visible:bg-emerald-500/[0.02] transition-all shadow-inner"
                                placeholder="IP Address"
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
                                  <Info className="text-rose-400" size={16} />
                                ) : ipStatus.type === 'invalid' ? (
                                  <AlertTriangle className="text-rose-500" size={16} />
                                ) : null}
                              </div>
                            </div>

                            {/* Animated Validator Banner */}
                            <AnimatePresence>
                              {ipStatus.type !== 'empty' && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0, y: -6 }}
                                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                                  exit={{ opacity: 0, height: 0, y: -6 }}
                                  className={`p-3.5 rounded-xl border text-[11px] font-semibold leading-relaxed flex items-start gap-2.5 transition-all duration-300 overflow-hidden ${ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'
                                      ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400 shadow-[inset_0_1px_0_rgba(16,185,129,0.05)]'
                                      : ipStatus.type === 'private'
                                        ? 'bg-amber-500/5 border-amber-500/15 text-amber-400 shadow-[inset_0_1px_0_rgba(245,158,11,0.05)]'
                                        : 'bg-rose-500/5 border-rose-500/15 text-rose-400 shadow-[inset_0_1px_0_rgba(244,63,94,0.05)]'
                                    }`}
                                >
                                  <div className="flex-shrink-0 mt-0.5">
                                    {ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6' ? (
                                      <ShieldCheck size={14} />
                                    ) : (
                                      <AlertTriangle size={14} />
                                    )}
                                  </div>
                                  <div>
                                    <span className="font-bold uppercase tracking-widest block text-[9px] mb-0.5">
                                      {ipStatus.type === 'valid_v4' && 'Verified Public IPv4'}
                                      {ipStatus.type === 'valid_v6' && 'Verified Public IPv6'}
                                      {ipStatus.type === 'private' && 'Local Address Warning'}
                                      {ipStatus.type === 'whitelisted' && 'Safe DNS Blocked'}
                                      {ipStatus.type === 'invalid' && 'IP Format Error'}
                                    </span>
                                    {ipStatus.msg}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Premium Chips Grid for Categories */}
                          <div className="space-y-3">
                            <label className="text-xs font-medium text-slate-300 ml-1">
                              Threat Tags <span className="text-slate-500 font-normal lowercase">(Select all that apply)</span>
                            </label>

                            <div className="flex flex-wrap gap-2 select-none">
                              {THREAT_CATEGORIES.map((cat) => {
                                const isChecked = selectedCats.includes(cat.name)
                                return (
                                  <div
                                    key={cat.id}
                                    onClick={() => toggleCategory(cat.name)}
                                    className={`relative group/pill cursor-pointer px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all duration-300 flex items-center gap-2 ${isChecked
                                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                        : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] hover:border-white/[0.1]'
                                      }`}
                                  >
                                    <span>{cat.name}</span>
                                    
                                    {/* Hover tooltip for pill */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 rounded-lg bg-slate-900 border border-white/10 text-[10px] text-slate-300 leading-relaxed opacity-0 pointer-events-none group-hover/pill:opacity-100 transition-opacity z-50 shadow-2xl text-center backdrop-blur-xl">
                                      {cat.description}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Mockup-Aligned Text Area */}
                          <div className="space-y-2 mt-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium text-slate-300 ml-1" htmlFor="rip-comment">
                                Context
                              </label>
                              <span className="text-[10px] font-medium text-slate-500 tracking-wider">
                                {1024 - comment.length} remaining
                              </span>
                            </div>
                            <textarea
                              id="rip-comment"
                              maxLength={1024}
                              className="w-full h-28 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-5 py-4 text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-emerald-500/30 focus-visible:bg-emerald-500/[0.02] transition-all resize-none leading-relaxed"
                              placeholder="Comment (server log snippets, abuse details, etc)"
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                            />
                          </div>

                          {/* Toggle Optional Information button */}
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => setShowOptional(!showOptional)}
                              className="mx-auto block text-[9px] font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg border border-white/5 bg-slate-900/40 hover:bg-slate-900/80 text-slate-400 hover:text-slate-200 transition-all select-none active:scale-[0.98]"
                            >
                              {showOptional ? 'Hide Optional Report Information' : 'Toggle Optional Report Information'}
                            </button>

                            <AnimatePresence>
                              {showOptional && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.3 }}
                                  className="overflow-hidden space-y-4 pt-4"
                                >
                                  <div className="space-y-2 max-w-md mx-auto">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 ml-1" htmlFor="rip-alias">
                                      <User size={13} className="text-slate-500" /> Agent Alias <span className="text-slate-500 font-normal lowercase">(optional)</span>
                                    </label>
                                    <div className="relative">
                                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <span className="text-slate-600 font-bold text-sm">@</span>
                                      </div>
                                      <input
                                        type="text"
                                        id="rip-alias"
                                        className={`w-full h-12 rounded-2xl border border-white/[0.05] bg-white/[0.02] pl-9 pr-4 text-sm font-medium text-white placeholder:text-slate-600 focus-visible:outline-none transition-all shadow-inner ${user ? 'opacity-60 cursor-not-allowed' : 'focus-visible:border-emerald-500/30 focus-visible:bg-emerald-500/[0.02]'
                                          }`}
                                        placeholder="Anonymous Defender"
                                        autoComplete="off"
                                        spellCheck="false"
                                        maxLength={24}
                                        value={alias}
                                        onChange={(e) => setAlias(e.target.value)}
                                        disabled={!!user}
                                      />
                                    </div>
                                    {user && (
                                      <p className="text-[10px] text-slate-500 font-semibold ml-1 mt-1">
                                        Logged in as @{profile?.username || alias || 'defender'}. Update your alias in your{' '}
                                        <Link to="/profile" className="text-cyan-400 hover:underline hover:text-cyan-300">
                                          account settings
                                        </Link>
                                        .
                                      </p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Premium Action Row */}
                          <div className="flex flex-col sm:flex-row items-center gap-4 pt-6 mt-4 border-t border-white/[0.02]">
                            <Button
                              className={`h-14 px-8 rounded-2xl text-white font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 border select-none ${canSubmit && selectedCats.length > 0
                                  ? 'bg-emerald-500 hover:bg-emerald-400 border-transparent shadow-[0_0_30px_rgba(16,185,129,0.2)] active:scale-[0.98] text-slate-950'
                                  : 'bg-white/[0.02] border-white/[0.05] text-slate-500 cursor-not-allowed'
                                }`}
                              onClick={handleSubmit}
                              disabled={submitting || !canSubmit || selectedCats.length === 0}
                            >
                              {submitting ? (
                                <>
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                  <span>Reporting IP...</span>
                                </>
                              ) : (
                                <span>REPORT IP ADDRESS</span>
                              )}
                            </Button>

                            <p className="text-xs text-slate-500 font-semibold">
                              Please abide by our{' '}
                              <button
                                type="button"
                                onClick={() => setShowPolicyModal(true)}
                                className="text-cyan-400 hover:underline hover:text-cyan-300 font-bold transition-colors"
                              >
                                reporting policy
                              </button>
                              .
                            </p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="success"
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                          transition={{ duration: 0.4 }}
                          className="flex flex-col items-center justify-center text-center py-10"
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

          {/* Bottom Section: Database Table / Leaderboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full flex flex-col"
          >
            <div className="rounded-[32px] bg-slate-950/40 backdrop-blur-2xl flex flex-col overflow-hidden relative border border-white/[0.05] shadow-2xl">

              {/* Table / Leaderboard Header Section */}
              <div className="p-4 md:px-6 flex items-center justify-between border-b border-white/5 bg-slate-950/25 relative z-10">
                <div className="flex gap-6">
                  <button
                    onClick={() => setActiveTab('feed')}
                    className={`font-semibold text-xs py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'feed' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <List size={14} /> Submissions Feed
                  </button>
                  <button
                    onClick={() => setActiveTab('leaderboard')}
                    className={`font-semibold text-xs py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'leaderboard' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Trophy size={14} /> Global Contributors
                  </button>
                </div>
                {activeTab === 'feed' && (
                  <div className="hidden sm:flex text-xs text-slate-300 font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/5 shadow-inner items-center gap-2">
                    <ShieldAlert size={14} className="text-red-400" />
                    {reportCount > 0 ? `${fmt(reportCount)} Submissions` : 'Live'}
                  </div>
                )}
              </div>

              {activeTab === 'leaderboard' ? (
                <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                  <Leaderboard />
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-x-auto">
                    {loading ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 py-24">
                        <div className="relative h-12 w-12 mb-4">
                          <div className="absolute inset-0 rounded-full border-2 border-slate-800"></div>
                          <div className="absolute inset-0 rounded-full border-2 border-red-500 border-t-transparent animate-spin"></div>
                        </div>
                        <p className="font-semibold tracking-wider text-[10px] text-slate-500 uppercase">Syncing Live database...</p>
                      </div>
                    ) : isEmpty ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-20 px-6">
                        <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/5">
                          <Inbox size={40} className="opacity-40 animate-pulse" />
                        </div>
                        <p className="text-base font-bold text-white mb-1">No Reports Found</p>
                        <p className="text-xs max-w-xs text-slate-400 leading-relaxed">
                          The intel feed is currently clear. Submit the first malicious IP to start the database.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-xs text-left">
                        <thead className="text-[10px] uppercase bg-slate-950/45 text-slate-400 font-bold border-b border-white/5 tracking-widest">
                          <tr>
                            <th className="px-8 py-5">IP Address</th>
                            <th className="px-6 py-5">Category</th>
                            <th className="px-6 py-5">Context</th>
                            <th className="px-8 py-5 text-right">Age</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          <AnimatePresence>
                            {reports.map((row, idx) => (
                              <motion.tr
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                key={row.id || row.created_at}
                                className="hover:bg-white/[0.015] transition-colors group"
                              >
                                <td className="px-8 py-4.5 whitespace-nowrap">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="font-mono font-bold text-slate-200 flex items-center gap-2 text-sm">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                                      <span>{row.ip}</span>

                                      {/* Copy to Clipboard Trigger */}
                                      <button
                                        type="button"
                                        onClick={() => handleCopyIp(row.ip)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 w-5 h-5 flex items-center justify-center cursor-pointer"
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
                                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pl-4">
                                        By <span className="text-slate-400">@{row.reporter_alias}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4.5">
                                  <div className="flex flex-wrap gap-1.5 max-w-[240px]">
                                    {row.category.split(', ').map((cat: string) => (
                                      <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${getCategoryColor(cat)}`}>
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4.5 text-slate-400 max-w-[200px] sm:max-w-xs md:max-w-md">
                                  {row.comment ? (
                                    <span className="flex items-start gap-1.5 group-hover:text-slate-300 transition-colors">
                                      <AlertTriangle size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
                                      <span className="whitespace-normal leading-relaxed text-slate-400 font-medium">{row.comment}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 italic text-[11px] font-medium">No Context Recorded</span>
                                  )}
                                </td>
                                <td className="px-8 py-4.5 text-slate-500 whitespace-nowrap font-medium text-right group-hover:text-slate-400 transition-colors">
                                  {timeAgo(row.created_at)}
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && !loading && !isEmpty && (
                    <div className="p-4 md:px-8 border-t border-white/[0.05] flex items-center justify-between bg-slate-950/20 select-none">
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

      {/* Reporting Policy Modal */}
      <AnimatePresence>
        {showPolicyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPolicyModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative bg-[#0E1322] border border-white/10 rounded-2xl max-w-xl w-full p-6 md:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-10 overflow-hidden"
            >
              {/* Glow Accent Stripe */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-wide">Community Reporting Policy</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Threatbase Threat Intelligence Network</p>
                  </div>
                </div>

                {/* Body Content */}
                <div className="text-xs text-slate-300 space-y-4 leading-relaxed max-h-[350px] overflow-y-auto pr-1">
                  <p className="font-semibold text-slate-400">
                    By submitting Indicators of Compromise (IoCs) to our public database, you agree to comply with the following data integrity guidelines:
                  </p>

                  <div className="space-y-4 pt-2">
                    <div className="flex gap-2.5 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-xs mb-0.5">1. Target Integrity</h4>
                        <p className="text-slate-400">Only report public IP addresses that show verifiable, persistent malicious activity (e.g. brute-forcing, active scans, hosting phishing portals, command-and-control beacons).</p>
                      </div>
                    </div>

                    <div className="flex gap-2.5 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-xs mb-0.5">2. Infrastructure Exclusions</h4>
                        <p className="text-slate-400">Do not report internal/private networks (RFC 1918, RFC 4193) or common public resolver services (Cloudflare, Google, Quad9, OpenDNS). Submissions matching these are automatically dropped.</p>
                      </div>
                    </div>

                    <div className="flex gap-2.5 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-xs mb-0.5">3. Prohibition of Abuse</h4>
                        <p className="text-slate-400">Reporting benign infrastructure, testing setups, or spamming false-positives to pollute feed files is strictly prohibited. Offenders may have their reporter alias or source IP permanently blacklisted.</p>
                      </div>
                    </div>

                    <div className="flex gap-2.5 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-xs mb-0.5">4. Processing & Transparency</h4>
                        <p className="text-slate-400">All reports undergo automated parsing, CIDR verification, and feed consolidation before being distributed. Submissions contain metadata associated with your optional analyst alias.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex items-center justify-end pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowPolicyModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider transition-all select-none active:scale-[0.98] shadow-lg shadow-emerald-600/10 border border-emerald-500/10"
                  >
                    I UNDERSTAND & AGREE
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
