import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, Copy, Check, ChevronLeft, ChevronRight, Users, ShieldCheck
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { AuthComponent } from '@/components/ui/sign-up'
import supabaseClient from '../supabaseClient'
import { fmt, timeAgo, DEFAULT_AVATAR, categoryTier, TIER_CHIP } from '../utils'
import { useAuth } from '../AuthContext'
import { useSEO } from '@/useSEO'
import DOMPurify from 'dompurify'
import { DNS_WHITELIST_CIDRS, PRIVATE_RESERVED_CIDRS, inCidr, isPrivateReservedIpv6 } from '@/lib/ipValidation'

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

const REPORT_PAGE_SIZE = 10
const SUBMIT_COOLDOWN = 15000
const TURNSTILE_SITE_KEY = '0x4AAAAAADj2T6kY9_5dXRhs'

const THREAT_TAGS = [
  'DNS Compromise',
  'DNS Poisoning',
  'Fraud Orders',
  'Open Proxy',
  'Web Spam',
  'Email Spam',
  'DDoS Attack',
  'FTP Brute-Force',
  'Spoofing',
  'Port Scan',
  'Ping of Death',
  'Phishing',
  'Brute-Force',
  'Bad Web Bot',
  'Exploited Host',
  'Fraud VoIP',
  'VPN IP',
  'SQL Injection',
  'Web App Attack',
  'SSH',
  'IoT Targeted',
  'Hacking',
  'Blog Spam',
  'Other',
];
const MAX_TAGS = 10;

const CommentCell = ({ comment }: { comment: string }) => {
  const [expanded, setExpanded] = useState(false);
  const maxLength = 100;

  if (!comment) return <span className="text-slate-500 italic">No comment provided</span>;
  
  if (comment.length <= maxLength) {
    return <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-300 font-sans text-[13px] tracking-wide">{comment}</div>;
  }

  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-300 font-sans text-[13px] tracking-wide">
      {expanded ? comment : `${comment.substring(0, maxLength).trim()}...`}
      <div className="text-right mt-1">
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="text-red-400 hover:text-red-300 text-[11px] font-sans font-bold uppercase tracking-wider"
        >
          {expanded ? 'show less' : 'show more'}
        </button>
      </div>
    </div>
  );
};

export default function ReportIP({ addToast }: any) {
  const { user, profile } = useAuth()
  const prefersReducedMotion = useReducedMotion()
  useSEO({
    title: 'Report a Malicious IP | Threatbase Community Intel',
    description: 'Submit malicious IP addresses to the Threatbase community intelligence feed. Help defend networks globally by reporting threats, malware, phishing, DDoS attacks, and more.',
    path: '/report',
  })
  
  const [ipValue, setIpValue] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [alias, setAlias] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileInstance>(null)
  const lastSubmitRef = useRef(0)

  // Reported IPs table state
  const [reports, setReports] = useState<any[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)
  const [copiedIp, setCopiedIp] = useState<string | null>(null)
  
  // Edit State
  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [editComment, setEditComment] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const totalPages = Math.ceil(reportCount / REPORT_PAGE_SIZE)

  // Real-time IP validation
  const [ipStatus, setIpStatus] = useState<{ type: 'empty' | 'valid_v4' | 'valid_v6' | 'private' | 'whitelisted' | 'invalid', msg: string }>({ type: 'empty', msg: '' })

  // Inline per-field validation errors (toasts stay for transient infra/cooldown messages)
  const [fieldErrors, setFieldErrors] = useState<{ ip?: string; tags?: string; comment?: string; turnstile?: string }>({})

  useEffect(() => {
    if (!showPolicyModal) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPolicyModal(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showPolicyModal])

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
        // View = reported_ips + profiles.avatar_url (definer join; profiles
        // is owner-only-RLS, so anon cannot embed it client-side).
        .from('reported_ips_feed')
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

    const raw = ipValue.trim()
    const rawComment = comment.trim()
    const rawAlias = alias.trim()

    if (rawAlias.length > 50) {
      return addToast('Alias is too long (max 50 characters)', 'error')
    }

    const canSubmit = ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'

    const errors: typeof fieldErrors = {}
    if (!raw) errors.ip = 'IP address is required.'
    else if (!canSubmit) errors.ip = ipStatus.msg || 'Valid IPv4 or IPv6 required.'
    if (!tags.length) errors.tags = 'Select at least one threat tag.'
    if (!rawComment) errors.comment = 'A description is required.'
    if (!turnstileToken) errors.turnstile = 'Complete the human verification first.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    const safeComment = DOMPurify.sanitize(rawComment)

    try {
      const { data: sessionData } = await supabaseClient.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) {
        setSubmitting(false)
        return addToast('Your session has expired. Please sign in again.', 'error')
      }

      const res = await fetch(`${import.meta.env.BASE_URL}api/community-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ip: raw,
          category: tags.join(', '),
          comment: safeComment,
          turnstileToken,
        }),
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(result?.error || 'Submission failed')
      }

      lastSubmitRef.current = Date.now()
      setSubmitSuccess(true)
      setIpValue('')
      setTags([])
      setComment('')
      loadReportedIPs(0)

      setTimeout(() => {
        setSubmitSuccess(false)
      }, 3000)
    } catch (err: any) {
      addToast('Submission failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      turnstileRef.current?.reset()
      setTurnstileToken('')
      setSubmitting(false)
    }
  }

  const handleSaveEdit = async (id: number) => {
    if (!supabaseClient) return addToast('Supabase connection unavailable', 'error')
    if (!alias) return addToast('Cannot edit without a reporter alias', 'error')
    if (!editComment.trim()) return addToast('Comment cannot be empty', 'error')
    if (editComment.trim().length > 1000) return addToast('Comment is too long (max 1000 characters)', 'error')

    setIsSavingEdit(true)
    try {
      const safeComment = DOMPurify.sanitize(editComment.trim())
      // SECURITY: Scope the update to both the row ID AND the current user's
      // reporter_alias. This prevents editing another user's report by
      // sending a crafted row ID directly to Supabase.
      const { data, error } = await supabaseClient
        .from('reported_ips')
        .update({ comment: safeComment })
        .eq('id', id)
        .eq('reporter_alias', alias)
        .select()
        
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update failed. You can only edit your own reports.')
      }
      
      addToast('Comment updated successfully!', 'success')
      setEditingRowId(null)
      loadReportedIPs(page)
    } catch (err: any) {
      addToast('Failed to update comment: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip)
    setCopiedIp(ip)
    addToast(`Copied ${ip} to clipboard!`, 'success')
    setTimeout(() => setCopiedIp(null), 1500)
  }

  const getCategoryColor = (cat: string) => TIER_CHIP[categoryTier(cat)]

  const isFormValid = () => {
    return ipValue.trim() !== "" && tags.length > 0 && comment.trim() !== "" && (ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6');
  }

  return (
    <main className="relative min-h-[100dvh] bg-[#050505] font-sans text-slate-300 selection:bg-red-500/30 pt-16">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_0%_30%,_rgba(153,27,27,0.08),_transparent_50%)]" />
      <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col lg:flex-row">
        {/* LEFT COLUMN - STICKY */}
        <div className="relative flex flex-col justify-center p-8 pt-16 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-[45%] lg:p-16">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-bold tracking-widest text-red-400 uppercase">
              <ShieldCheck className="h-3.5 w-3.5" /> Indicator Intake
            </div>
            
            <h1 className="text-5xl font-extrabold tracking-tighter text-white lg:text-7xl leading-[1.05]">
              Report a<br />Threat.
            </h1>
            
            <p className="mt-6 max-w-sm text-lg text-slate-400 leading-relaxed">
              Every verified submission strengthens the global blocklist. 
              Defend networks and expose malicious infrastructure.
            </p>
          </motion.div>
          
        </div>

        {/* RIGHT COLUMN - SCROLLABLE */}
        <div className="flex-1 p-6 lg:p-16 lg:pt-24 pb-32">
          
          {/* FORM SECTION */}
          <motion.section
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mb-24"
          >
            {!user ? (
              <div className="flex justify-center py-12">
                <AuthComponent />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-8">
                <div className="space-y-3">
                  <Label htmlFor="ipAddress" className="text-sm font-semibold text-slate-200 tracking-wide">
                    IP Address
                  </Label>
                  <div className="relative">
                    <Input
                      id="ipAddress"
                      placeholder="e.g., 203.0.113.45"
                      value={ipValue}
                      onChange={(e) => { setIpValue(e.target.value); setFieldErrors(p => ({ ...p, ip: undefined })) }}
                      aria-invalid={!!fieldErrors.ip}
                      aria-describedby={fieldErrors.ip ? 'ipAddress-error' : undefined}
                      className="h-14 rounded-xl border-white/10 bg-white/[0.02] px-4 font-mono text-base text-white placeholder:font-sans placeholder:text-slate-500 focus-visible:border-red-500/50 focus-visible:ring-red-500/20"
                    />
                    {ipStatus.type !== 'empty' && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2">
                        {ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6'
                          ? <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
                          : <AlertTriangle className="h-4 w-4 text-destructive" />}
                      </span>
                    )}
                  </div>
                  {fieldErrors.ip && (
                    <p id="ipAddress-error" className="text-[11px] font-medium tracking-wider text-red-400">{fieldErrors.ip}</p>
                  )}
                  {ipStatus.msg && ipStatus.type !== 'empty' && (
                    <p className={`text-[11px] font-medium uppercase tracking-wider ${ipStatus.type === 'valid_v4' || ipStatus.type === 'valid_v6' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {ipStatus.msg}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-200 tracking-wide">
                      Threat Tags
                    </Label>
                    <span className="font-mono text-[10px] text-slate-400">{tags.length}/{MAX_TAGS}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {THREAT_TAGS.map((tag) => {
                      const active = tags.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => { setTags(prev => active ? prev.filter(t => t !== tag) : prev.length < MAX_TAGS ? [...prev, tag] : prev); setFieldErrors(p => ({ ...p, tags: undefined })) }}
                          aria-pressed={active}
                          className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                            active
                              ? getCategoryColor(tag)
                              : 'border border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                          }`}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                  {fieldErrors.tags && (
                    <p id="tags-error" className="text-[11px] font-medium tracking-wider text-red-400">{fieldErrors.tags}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="comment" className="text-sm font-semibold text-slate-200 tracking-wide">
                      Description / Evidence
                    </Label>
                    <span className="font-mono text-[10px] text-slate-400">{comment.length}/1000</span>
                  </div>
                  <Textarea
                    id="comment"
                    placeholder="Describe the malicious activity: observed behaviour, timestamps, ports, or log excerpts."
                    value={comment}
                    onChange={(e) => { setComment(e.target.value); setFieldErrors(p => ({ ...p, comment: undefined })) }}
                    maxLength={1000}
                    aria-invalid={!!fieldErrors.comment}
                    aria-describedby={fieldErrors.comment ? 'comment-error' : undefined}
                    className="min-h-[140px] resize-none rounded-xl border-white/10 bg-white/[0.02] p-4 text-base leading-relaxed text-white placeholder:text-slate-500 focus-visible:border-red-500/50 focus-visible:ring-red-500/20"
                  />
                  {fieldErrors.comment && (
                    <p id="comment-error" className="text-[11px] font-medium tracking-wider text-red-400">{fieldErrors.comment}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label htmlFor="contributorName" className="text-sm font-semibold text-slate-300 tracking-wide">
                    Reporter Alias
                  </Label>
                  <Input
                    id="contributorName"
                    placeholder="Anonymous"
                    value={alias}
                    readOnly
                    className="h-14 cursor-not-allowed rounded-xl border-transparent bg-white/[0.01] font-mono text-slate-400 focus-visible:ring-0"
                  />
                  <p className="text-[11px] text-slate-500">
                    Locked to your profile. Change it in <Link to="/profile" className="text-red-400 hover:text-red-300 hover:underline">Settings</Link>.
                  </p>
                </div>

                <div className="pt-2">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(t) => { setTurnstileToken(t); setFieldErrors(p => ({ ...p, turnstile: undefined })) }}
                    onExpire={() => setTurnstileToken('')}
                    onError={() => setTurnstileToken('')}
                    options={{ theme: 'dark', size: 'flexible' }}
                  />
                  {fieldErrors.turnstile && (
                    <p id="turnstile-error" className="mt-2 text-[11px] font-medium tracking-wider text-red-400">{fieldErrors.turnstile}</p>
                  )}
                </div>

                <div className="pt-6">
                  <Button
                    type="submit"
                    disabled={!isFormValid() || submitting || !turnstileToken}
                    className="h-14 w-full rounded-xl bg-red-600 text-sm font-bold text-white shadow-glow-ruby transition-all hover:bg-red-500 active:scale-[0.98] disabled:scale-100 disabled:shadow-none"
                  >
                    {submitting ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Submitting...
                      </>
                    ) : submitSuccess ? (
                      <>
                        <Check className="mr-2 h-5 w-5 text-white" />
                        Submitted Successfully
                      </>
                    ) : (
                      'Submit Report'
                    )}
                  </Button>
                  <p className="mt-4 text-center text-[11px] text-slate-500">
                    By submitting, you agree to our{' '}
                    <button type="button" onClick={() => setShowPolicyModal(true)} className="text-red-400 hover:underline">
                      reporting policy
                    </button>.
                  </p>
                </div>
              </form>
            )}
          </motion.section>

          {/* FEED SECTION */}
          <motion.section
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-xl border-t border-white/5 pt-16"
          >
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Live Feed</h2>
                <p className="mt-1 text-sm text-slate-400">Community-reported indicators</p>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-slate-400">
                <Users className="h-3 w-3" />
                {reportCount > 0 ? fmt(reportCount) : 'Live'}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-500">
                <div className="mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Syncing</p>
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.01] py-16 text-center">
                <ShieldCheck className="mb-3 h-6 w-6 text-slate-600" />
                <p className="text-sm text-slate-400">No submissions yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <AnimatePresence>
                  {reports.reduce((acc: any[], row) => {
                    const isDuplicate = acc.some(r => r.ip === row.ip && r.reporter_alias === row.reporter_alias);
                    if (!isDuplicate) acc.push(row);
                    return acc;
                  }, []).map((row: any, idx: number) => {
                    const categories = (row.category || 'Other').split(', ');
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.05, 0.3) }}
                        key={row.id || row.created_at}
                        className="group relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 transition-colors hover:bg-white/[0.02]"
                      >
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-base font-bold text-slate-200">{row.ip}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyIp(row.ip)}
                              className="-m-2 p-2 text-slate-500 opacity-100 transition-all hover:text-white md:opacity-0 md:group-hover:opacity-100"
                              title="Copy IP"
                              aria-label="Copy IP"
                            >
                              {copiedIp === row.ip ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-[10px] text-slate-500">{timeAgo(row.created_at)}</div>
                          </div>
                        </div>

                        <div className="mb-4">
                          {editingRowId === row.id ? (
                            <div className="flex flex-col gap-2">
                              <Textarea
                                value={editComment}
                                onChange={(e) => setEditComment(e.target.value)}
                                className="min-h-[80px] resize-none rounded-lg border-white/10 bg-black/40 p-3 text-[13px] text-white"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setEditingRowId(null)} disabled={isSavingEdit} className="h-8 text-xs text-slate-400">Cancel</Button>
                                <Button size="sm" onClick={() => handleSaveEdit(row.id)} disabled={isSavingEdit} className="h-8 bg-red-600 text-xs text-white hover:bg-red-500">
                                  {isSavingEdit ? 'Saving...' : 'Save'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <CommentCell comment={row.comment} />
                              {alias && row.reporter_alias === alias && (
                                <button
                                  type="button"
                                  onClick={() => { setEditingRowId(row.id); setEditComment(row.comment); }}
                                  className="absolute -right-2 -top-2 rounded-md bg-white/5 p-2 text-slate-400 opacity-100 transition-opacity hover:text-white md:opacity-0 md:group-hover:opacity-100"
                                  aria-label="Edit comment"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/5 pt-3">
                          <div className="flex items-center gap-2">
                            <img src={row.avatar_url || DEFAULT_AVATAR} alt="" className="h-5 w-5 rounded-full object-cover" />
                            <span className="text-[12px] font-medium text-slate-400">{row.reporter_alias || 'Anonymous'}</span>
                          </div>
                          <div className="flex gap-1.5">
                            {categories.map((cat: string) => (
                              <span key={cat} className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getCategoryColor(cat)}`}>
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-500">
                      Page {page + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadReportedIPs(page - 1)}
                        disabled={page === 0}
                        className="h-8 text-xs text-slate-400 hover:text-white"
                      >
                        <ChevronLeft className="mr-1 h-3 w-3" /> Prev
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadReportedIPs(page + 1)}
                        disabled={page >= totalPages - 1}
                        className="h-8 text-xs text-slate-400 hover:text-white"
                      >
                        Next <ChevronRight className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.section>

        </div>
      </div>

      <AnimatePresence>
        {showPolicyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPolicyModal(false)} className="absolute inset-0 bg-[#050505]/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} role="dialog" aria-modal="true" aria-labelledby="policy-title" className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#0A0A0A] p-8 shadow-2xl z-10">
              <div className="mb-6 flex items-center gap-4 border-b border-white/5 pb-4">
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-red-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 id="policy-title" className="text-xl font-bold text-white tracking-tight">Community Reporting Policy</h3>
              </div>
              <div className="space-y-6 overflow-y-auto pr-2 text-sm leading-relaxed text-slate-400 custom-scrollbar">
                <div>
                  <h4 className="mb-1 text-sm font-bold text-white">1. Target Integrity</h4>
                  <p>Only report public IP addresses demonstrating malicious activity. Do not report private networks (e.g., 192.168.x.x), loopback addresses, or legitimate DNS/infrastructure unless actively weaponized.</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-white">2. Accuracy and Evidence</h4>
                  <p>Provide clear and concise evidence or reasoning in your submission comment. Deliberately submitting false reports, false positives, or targeted harassment will result in a permanent account ban.</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-white">3. No Personal Information</h4>
                  <p>Do not include Personally Identifiable Information (PII) in your reports unless it is directly part of the threat indicators (e.g., a phishing email address used by an attacker).</p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-6">
                <Link to="/policy" onClick={() => setShowPolicyModal(false)} className="text-xs font-bold text-red-400 hover:text-red-300 hover:underline">
                  Read full policy
                </Link>
                <button type="button" onClick={() => setShowPolicyModal(false)} className="rounded-lg bg-white/10 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-white/20">
                  I UNDERSTAND
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
