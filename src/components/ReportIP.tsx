import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, Copy, Check, ChevronLeft, ChevronRight, HelpCircle, Users, ShieldCheck
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { SignIn1 } from '@/components/ui/modern-stunning-sign-in'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo } from '../utils'
import { Typewriter } from '@/components/ui/typewriter'
import Leaderboard from './Leaderboard'
import { useAuth } from '../AuthContext'
import { useSEO } from '@/useSEO'
import { MatrixText } from '@/components/ui/matrix-text'

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32"
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

const THREAT_CATEGORIES = [
  { value: 'malware', label: 'Malware Distribution' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'spam', label: 'Spam' },
  { value: 'ddos', label: 'DDoS Attack' },
  { value: 'brute-force', label: 'Brute Force' },
  { value: 'scanning', label: 'Port Scanning' },
  { value: 'botnet', label: 'Botnet' },
  { value: 'other', label: 'Other' },
];

const CommentCell = ({ comment }: { comment: string }) => {
  const [expanded, setExpanded] = useState(false);
  const maxLength = 100;

  if (!comment) return <span className="text-slate-500 italic">No comment provided</span>;
  
  if (comment.length <= maxLength) {
    return <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-200 font-mono text-[12px]">{comment}</div>;
  }

  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-200 font-mono text-[12px]">
      {expanded ? comment : `${comment.substring(0, maxLength).trim()}...`}
      <div className="text-right mt-1">
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="text-[#3b82f6] hover:underline text-[11px] font-sans font-medium"
        >
          {expanded ? 'show less' : 'show more'}
        </button>
      </div>
    </div>
  );
};

export default function ReportIP({ addToast }: any) {
  const { user, profile, signInWithGoogle } = useAuth()
  useSEO({
    title: 'Report Malicious IP — Threatbase Community Intel',
    description: 'Submit malicious IP addresses to the Threatbase community intelligence feed. Help defend networks globally by reporting threats, malware, phishing, DDoS attacks, and more.',
    path: '/report',
  })
  const [ipValue, setIpValue] = useState('')
  const [category, setCategory] = useState('')
  const [comment, setComment] = useState('')
  const [alias, setAlias] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const lastSubmitRef = useRef(0)

  // Reported IPs table state
  const [reports, setReports] = useState<any[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)
  const [copiedIp, setCopiedIp] = useState<string | null>(null)

  const totalPages = Math.ceil(reportCount / REPORT_PAGE_SIZE)

  // Real-time IP validation
  const [ipStatus, setIpStatus] = useState<{ type: 'empty' | 'valid_v4' | 'valid_v6' | 'private' | 'whitelisted' | 'invalid', msg: string }>({ type: 'empty', msg: '' })

  useEffect(() => {
    if (profile?.username) {
      setAlias(profile.username)
    } else if (user) {
      const fallback = user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
      setAlias(fallback.replace(/[^a-zA-Z0-9_-]/g, ''))
    }
  }, [profile, user])

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
        for (const cidr of PRIVATE_RESERVED_CIDRS) {
          if (inCidr(raw, cidr)) {
            isPrivate = true; break;
          }
        }
        for (const cidr of DNS_WHITELIST_CIDRS) {
          if (inCidr(raw, cidr)) {
            isWhitelisted = true;
            whitelistProvider = "DNS Provider";
            break;
          }
        }
      } else if (isV6) {
        isPrivate = isPrivateReservedIpv6(raw)
      }

      if (isWhitelisted) {
        setIpStatus({ type: 'whitelisted', msg: `Whitelisted IP detected (${whitelistProvider}). Submissions blocked.` })
      } else if (isPrivate) {
        setIpStatus({ type: 'private', msg: 'Private/Reserved range warning.' })
      } else {
        setIpStatus({ type: isV4 ? 'valid_v4' : 'valid_v6', msg: `Verified ${isV4 ? 'IPv4' : 'IPv6'} address.` })
      }
    } else {
      setIpStatus({ type: 'invalid', msg: 'Valid IPv4 or IPv6 required.' })
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
          setIsEmpty(true); setReports([]); setReportCount(0)
        } else {
          loadReportedIPs(p - 1)
        }
      } else {
        setReports(data); setReportCount(count || 0); setIsEmpty(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseClient) return addToast('Supabase connection unavailable', 'error')

    const now = Date.now()
    if (now - lastSubmitRef.current < SUBMIT_COOLDOWN) {
      const remaining = Math.ceil((SUBMIT_COOLDOWN - (now - lastSubmitRef.current)) / 1000)
      return addToast(`Wait ${remaining}s before submitting again`, 'error')
    }

    if (!ipValue.trim() || !category || !comment.trim()) {
      return addToast('Please fill all required fields', 'error')
    }

    const raw = ipValue.trim()
    const canSubmit = ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'
    
    if (!canSubmit) {
      return addToast('Submission blocked due to invalid or private IP', 'error')
    }

    setSubmitting(true)

    // Translate value back to label for database consistency
    const catLabel = THREAT_CATEGORIES.find(c => c.value === category)?.label || category

    try {
      const { error } = await supabaseClient
        .from('reported_ips')
        .insert([{ ip: raw, category: catLabel, comment: comment.trim(), reporter_alias: alias.trim() || null }])

      if (error) throw error

      lastSubmitRef.current = Date.now()
      setSubmitSuccess(true)
      setIpValue('')
      setCategory('')
      setComment('')
      loadReportedIPs(0)
      
      setTimeout(() => {
        setSubmitSuccess(false)
      }, 3000)
    } catch (err: any) {
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip)
    setCopiedIp(ip)
    addToast(`Copied ${ip} to clipboard!`, 'success')
    setTimeout(() => setCopiedIp(null), 1500)
  }

  const getCategoryColor = (cat: string) => {
    if (!cat) return 'bg-slate-500/10 text-slate-300 border border-slate-500/20'
    if (cat.includes('Brute') || cat.includes('Force')) return 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
    if (cat.includes('Malware')) return 'bg-red-500/10 text-red-400 border border-red-500/20'
    if (cat.includes('DDoS')) return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    if (cat.includes('Phish')) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    if (cat.includes('Scan')) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
    return 'bg-slate-500/10 text-slate-300 border border-slate-500/20'
  }

  const isFormValid = () => {
    return ipValue.trim() !== "" && category !== "" && comment.trim() !== "" && (ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6');
  }

  return (
    <main className="bg-[#0B0F19] min-h-screen">
      <div className="pt-28 pb-24 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay pointer-events-none"></div>

        <div className="mx-auto max-w-7xl px-4 lg:px-8 relative z-10 space-y-10">
          
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center relative"
          >
            <h1 className="text-4xl md:text-5xl font-black flex items-center justify-center gap-2 text-white tracking-tighter pb-2">
              <MatrixText text="Community Intel" className="font-mono text-white" />
            </h1>
            <div className="mt-2 text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed flex flex-wrap items-center justify-center min-h-[28px]">
              <span>{"Submissions feed the blacklist to "}</span>
              <Typewriter
                text={[
                  "defend networks globally.",
                  "track threat actors.",
                  "identify malicious infrastructure.",
                ]}
                speed={60}
                className="text-emerald-400 ml-1.5 font-medium"
                waitTime={2500}
                deleteSpeed={30}
                cursorChar={"_"}
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="shadow-lg border-white/[0.05] bg-slate-950/40 backdrop-blur-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L4 5.5v5.5c0 5.5 3.5 10.2 8 11.5 4.5-1.3 8-6 8-11.5V5.5L12 2z" fill="url(#shieldGlow)" opacity="0.1" />
                        <path d="M12 2L4 5.5v5.5c0 5.5 3.5 10.2 8 11.5 4.5-1.3 8-6 8-11.5V5.5L12 2z" stroke="url(#shieldBorderGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 6.5c-2.5 1.5-4 3-4 6 0 3.5 2 6 4 7 2-1 4-3.5 4-7 0-3-1.5-4.5-4-6z" fill="url(#shieldCore)" stroke="url(#shieldBorderGrad)" strokeWidth="1" />
                        <defs>
                          <linearGradient id="shieldGlow" x1="12" y1="2" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#EF4444" />
                            <stop offset="1" stopColor="#7F1D1D" />
                          </linearGradient>
                          <linearGradient id="shieldBorderGrad" x1="12" y1="2" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#FCA5A5" />
                            <stop offset="0.5" stopColor="#EF4444" />
                            <stop offset="1" stopColor="#991B1B" />
                          </linearGradient>
                          <linearGradient id="shieldCore" x1="12" y1="6.5" x2="12" y2="19.5" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#EF4444" stopOpacity="0.4" />
                            <stop offset="1" stopColor="#7F1D1D" stopOpacity="0.1" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    <div>
                      <CardTitle className="text-xl md:text-2xl text-white">Submit Malicious IP</CardTitle>
                      <CardDescription className="text-slate-400">
                        Help protect the community by reporting malicious IP addresses
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!user ? (
                    <div className="flex justify-center w-full mt-4">
                      <SignIn1 />
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="ipAddress" className="text-base font-medium text-slate-300">
                          IP Address <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="ipAddress"
                          placeholder="e.g., 192.168.1.1"
                          value={ipValue}
                          onChange={(e) => setIpValue(e.target.value)}
                          className="h-11 bg-black/20 border-white/10 text-white placeholder:text-slate-500"
                        />
                        {ipStatus.msg && ipStatus.type !== 'empty' && (
                          <p className={`text-xs mt-1 font-medium ${ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {ipStatus.msg}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="category" className="text-base font-medium text-slate-300">
                          Threat Category <span className="text-red-500">*</span>
                        </Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger id="category" className="h-11 bg-black/20 border-white/10 text-white">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10">
                            {THREAT_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value} className="text-slate-200 focus:bg-white/10">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                                  {cat.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="comment" className="text-base font-medium text-slate-300">
                          Description / Evidence <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="comment"
                          placeholder="Provide details about the malicious activity..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className="min-h-[120px] resize-none bg-black/20 border-white/10 text-white placeholder:text-slate-500"
                        />
                      </div>

                      <div className="space-y-2 opacity-70">
                        <Label htmlFor="contributorName" className="text-base font-medium text-slate-300">
                          Your Alias
                        </Label>
                        <Input
                          id="contributorName"
                          placeholder="Anonymous"
                          value={alias}
                          readOnly
                          className="h-11 bg-black/20 border-white/10 text-white placeholder:text-slate-500 cursor-not-allowed focus-visible:ring-0"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Locked to your profile username. You can change it in your <Link to={profile?.username ? `/u/${profile.username}` : "/profile"} className="text-blue-400 hover:underline font-semibold">Profile Settings</Link>.
                        </p>
                      </div>

                      <div className="pt-4 flex flex-col gap-3">
                        <Button
                          type="submit"
                          disabled={!isFormValid() || submitting}
                          className="w-full h-12 text-base font-medium bg-white text-black hover:bg-slate-200"
                        >
                          {submitting ? (
                            <>
                              <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                              Submitting...
                            </>
                          ) : submitSuccess ? (
                            <>
                              <Check className="h-5 w-5 mr-2 text-emerald-500" />
                              Submitted Successfully!
                            </>
                          ) : (
                            <>
                              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Submit Report
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-center text-slate-500">
                          By submitting, you agree to our <button type="button" onClick={() => setShowPolicyModal(true)} className="text-cyan-400 hover:underline">reporting policy</button>.
                        </p>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24 relative group">
                <div className="absolute -inset-1 opacity-30 group-hover:opacity-50 transition-opacity duration-700 blur-2xl pointer-events-none z-0">
                  <div className="absolute -top-4 -left-4 w-48 h-48 bg-blue-500/20 rounded-full mix-blend-screen filter blur-3xl animate-blob" />
                  <div className="absolute top-20 -right-4 w-48 h-48 bg-indigo-500/20 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-2000" />
                  <div className="absolute -bottom-8 left-10 w-48 h-48 bg-purple-500/20 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-4000" />
                </div>
                <Card className="relative z-10 shadow-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-[40px] overflow-hidden rounded-2xl">
                  <CardHeader className="pb-6 pt-6 px-6 border-b border-white/[0.05] bg-gradient-to-r from-white/[0.02] to-transparent">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-400 drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]">
                        <Users size={24} strokeWidth={1.5} />
                      </div>
                      <div>
                        <CardTitle className="text-[22px] font-bold text-white tracking-wide drop-shadow-sm">Top Contributors</CardTitle>
                        <CardDescription className="text-slate-400 mt-0.5">Global threat intelligence leaders</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 pt-4">
                    <div className="h-[400px] overflow-y-auto custom-scrollbar px-6 pb-6">
                      <Leaderboard />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Submissions Feed - Aurora UI */}
          <div className="relative mt-12 w-full group">
            {/* Aurora Background Orbs */}
            <div className="absolute -inset-1 opacity-40 group-hover:opacity-60 transition-opacity duration-700 blur-3xl pointer-events-none z-0">
              <div className="absolute top-0 -left-10 w-72 h-72 bg-emerald-500/30 rounded-full mix-blend-screen filter blur-3xl animate-blob" />
              <div className="absolute top-0 -right-10 w-72 h-72 bg-cyan-500/30 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-2000" />
              <div className="absolute -bottom-20 left-40 w-72 h-72 bg-purple-500/30 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-4000" />
            </div>

            <Card className="relative z-10 shadow-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-[40px] overflow-hidden font-elegant tracking-tight rounded-2xl">
              <div className="p-4 md:px-8 py-5 flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-r from-white/[0.02] to-transparent">
                <div className="flex gap-6">
                  <div className="font-semibold text-sm rounded-lg flex items-center gap-3 text-white">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="url(#listBorderGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <defs>
                        <linearGradient id="listBorderGrad" x1="12" y1="6" x2="12" y2="18" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#34D399" />
                          <stop offset="1" stopColor="#06B6D4" />
                        </linearGradient>
                      </defs>
                    </svg> Submissions Feed
                  </div>
                </div>
                <div className="hidden sm:flex text-[10px] text-slate-300 font-bold bg-white/[0.05] px-4 py-1.5 rounded-full border border-white/10 items-center gap-2 shadow-inner">
                  {reportCount > 0 ? `${fmt(reportCount)} SUBMISSIONS` : 'LIVE FEED'}
                </div>
              </div>

            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center text-slate-400 py-24">
                  <div className="relative h-8 w-8 mb-4">
                    <div className="absolute inset-0 rounded-full border border-slate-800"></div>
                    <div className="absolute inset-0 rounded-full border border-slate-500 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="font-semibold tracking-wider text-[10px] text-slate-500 uppercase">Syncing Live database...</p>
                </div>
              ) : isEmpty ? (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <div className="text-center space-y-2">
                    <h3 className="text-sm font-semibold text-white tracking-wide">No Submissions Yet</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      The intel feed is currently clear. Be the first to report malicious activity and protect the network.
                    </p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left font-sans block md:table">
                  <thead className="hidden md:table-header-group bg-black/40 backdrop-blur-sm text-white border-b border-white/[0.08]">
                    <tr>
                      <th className="px-4 py-3 text-[13px] font-bold tracking-wide w-[12%]">IP Address</th>
                      <th className="px-4 py-3 text-[13px] font-bold tracking-wide w-[15%]">Reporter</th>
                      <th className="px-4 py-3 text-[13px] font-bold tracking-wide w-[20%]">
                        <div className="flex items-center gap-1.5">
                          IoA Timestamp (UTC)
                          <HelpCircle size={14} className="text-[#3b82f6] fill-[#3b82f6]/20" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-[13px] font-bold tracking-wide">Comment</th>
                      <th className="px-4 py-3 text-[13px] font-bold tracking-wide text-right w-[15%]">Categories</th>
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group space-y-4 md:space-y-0 p-4 md:p-0">
                    <AnimatePresence>
                      {reports.map((row, idx) => {
                        const dateObj = new Date(row.created_at);
                        const fullDate = dateObj.toISOString().replace('T', ' ').substring(0, 19);
                        const categories = (row.category || 'Other').split(', ');
                        
                        return (
                          <motion.tr
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            key={row.id || row.created_at}
                            className="block md:table-row bg-slate-900/50 md:bg-white/[0.02] md:even:bg-transparent hover:bg-white/[0.04] transition-colors group border border-white/10 md:border-0 md:border-b md:border-white/[0.02] last:border-0 rounded-xl md:rounded-none p-4 md:p-0"
                          >
                            {/* IP Address */}
                            <td className="block md:table-cell px-0 py-1.5 md:px-4 md:py-3 align-top whitespace-nowrap">
                              <span className="text-slate-300 font-mono text-[15px] md:text-[13px] font-bold md:font-medium">
                                {row.ip}
                              </span>
                            </td>

                            {/* Reporter */}
                            <td className="block md:table-cell px-0 py-1 md:px-4 md:py-3 align-top whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Check size={14} strokeWidth={3} className="text-[#10b981]" />
                                <span className="text-[#3b82f6] hover:underline cursor-pointer text-[13px] font-medium">
                                  {row.reporter_alias || 'Anonymous'}
                                </span>
                                {row.reporter_alias === 'lamichhanesujal18' && (
                                  <span className="ml-1 px-1.5 py-[1px] bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 text-[8px] uppercase tracking-widest font-bold rounded shadow-[0_0_5px_rgba(99,102,241,0.2)] flex items-center gap-0.5 drop-shadow-sm">
                                    <ShieldCheck size={8} strokeWidth={3} />
                                    Admin
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Timestamp */}
                            <td className="block md:table-cell px-0 py-1 md:px-4 md:py-3 align-top whitespace-nowrap">
                              <div className="flex items-center gap-2 md:block">
                                <div className="text-[13px] text-slate-200 font-medium">{fullDate}</div>
                                <div className="text-[11px] text-slate-500 md:mt-0.5">({timeAgo(row.created_at)})</div>
                              </div>
                            </td>

                            {/* Comment */}
                            <td className="block md:table-cell px-0 py-3 md:px-4 md:py-3 align-top border-t border-b border-white/5 md:border-0 my-3 md:my-0">
                              <CommentCell comment={row.comment} />
                            </td>

                            {/* Categories */}
                            <td className="block md:table-cell px-0 py-1 md:px-4 md:py-3 align-top">
                              <div className="flex flex-wrap md:flex-col items-start md:items-end gap-1.5 pt-1 md:pt-0">
                                {categories.map(cat => (
                                  <span key={cat} className="inline-block px-2 py-0.5 bg-white/10 text-white text-[10px] rounded-[3px] font-medium whitespace-nowrap border border-white/[0.05]">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </div>

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
          </Card>

        </div>

        <AnimatePresence>
          {showPolicyModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPolicyModal(false)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} transition={{ type: 'tween', duration: 0.2 }} className="relative bg-slate-950 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl z-10 flex flex-col max-h-[85vh]">
                <div className="flex items-center gap-3 mb-6 shrink-0 border-b border-white/[0.05] pb-4">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L4 5.5v5.5c0 5.5 3.5 10.2 8 11.5 4.5-1.3 8-6 8-11.5V5.5L12 2z" fill="url(#policyGlow)" opacity="0.1" />
                      <path d="M12 2L4 5.5v5.5c0 5.5 3.5 10.2 8 11.5 4.5-1.3 8-6 8-11.5V5.5L12 2z" stroke="url(#policyBorderGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9 11l2 2 4-4" stroke="url(#policyBorderGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <defs>
                        <linearGradient id="policyGlow" x1="12" y1="2" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#3B82F6" />
                          <stop offset="1" stopColor="#1E3A8A" />
                        </linearGradient>
                        <linearGradient id="policyBorderGrad" x1="12" y1="2" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#60A5FA" />
                          <stop offset="0.5" stopColor="#3B82F6" />
                          <stop offset="1" stopColor="#1D4ED8" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-wide">Community Reporting Policy</h3>
                  </div>
                </div>
                <div className="text-xs text-slate-300 space-y-6 leading-relaxed overflow-y-auto pr-2 custom-scrollbar">
                  <div>
                    <h4 className="font-bold text-white text-sm mb-2 border-l-2 border-red-500 pl-2">1. Target Integrity</h4>
                    <p className="text-slate-400">Only report public IP addresses demonstrating malicious activity. Do not report private networks (e.g., 192.168.x.x), loopback addresses, or legitimate DNS/infrastructure unless actively weaponized.</p>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm mb-2 border-l-2 border-red-500 pl-2">2. Accuracy and Evidence</h4>
                    <p className="text-slate-400">Provide clear and concise evidence or reasoning in your submission comment. Deliberately submitting false reports, false positives, or targeted harassment will result in a permanent account ban.</p>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm mb-2 border-l-2 border-red-500 pl-2">3. No Personal Information</h4>
                    <p className="text-slate-400">Do not include Personally Identifiable Information (PII) in your reports unless it is directly part of the threat indicators (e.g., a phishing email address used by an attacker).</p>
                  </div>
                </div>
                <div className="flex items-center justify-end pt-4 mt-2 border-t border-white/[0.05] shrink-0">
                  <button type="button" onClick={() => setShowPolicyModal(false)} className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all select-none">
                    I UNDERSTAND & AGREE
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </main>
  )
}
