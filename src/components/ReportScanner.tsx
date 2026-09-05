import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Bug, ShieldCheck, AlertTriangle, AlertOctagon, ChevronRight, Search, Check, ShieldAlert, Copy, Globe } from 'lucide-react'
import DOMPurify from 'dompurify'
import supabaseClient from '../supabaseClient'
import { timeAgo, normalizeTags, categoryTier, TIER_CHIP, TIER_ACCENT } from '../utils'
import { useAuth } from '../AuthContext'
import ScanPulse from './ui/scan-pulse'
import { getMalwareDescription } from '../malwareDictionary'

// Derive a credible 0–100 confidence-of-abuse score from real signals
// (severity, number of feeds listing it, subnet matches, community reports)
// instead of a binary 100/0. Clean indicators stay low.
function computeConfidence(scanResult: any, reportCount: number): number {
  if (!scanResult) return 0
  if (scanResult.isDisputed) return 35
  if (!scanResult.isMalicious) {
    // A clean indicator that the community has still flagged carries residual risk.
    return Math.min(20, reportCount * 4)
  }

  const risk = String(scanResult.riskScore || '').toLowerCase()
  let score = risk === 'high' ? 82 : risk === 'medium' ? 62 : 45

  // Each independent feed listing the indicator raises confidence.
  const feeds = Number(scanResult.feedCount) || 1
  score += Math.min(feeds - 1, 4) * 3

  // A malicious-subnet match is a strong, range-level signal.
  if (scanResult.matchedCidr) score = Math.max(score, 80)

  // A pivot match (subdomain / URL host) is indirect — cap confidence slightly
  // below a direct listing of the exact indicator.
  if (scanResult.relatedMatch) score = Math.min(score, 85)

  // Corroborating community reports nudge confidence up.
  score += Math.min(reportCount, 8) * 1.5

  // More than 10 independent feeds is overwhelming corroboration: lock at 100.
  if (feeds > 10) return 100

  return Math.max(0, Math.min(99, Math.round(score)))
}

const getConfidenceTier = (score: number) => {
  if (score >= 75) return { label: 'Critical', text: 'text-rose-400', bar: 'bg-rose-500', track: 'shadow-rose-500/20' }
  if (score >= 50) return { label: 'High', text: 'text-orange-400', bar: 'bg-orange-500', track: 'shadow-orange-500/20' }
  if (score >= 25) return { label: 'Elevated', text: 'text-yellow-400', bar: 'bg-yellow-500', track: 'shadow-yellow-500/20' }
  // Minimal reads as safe, so it must not borrow the ruby accent (primary IS red).
  return { label: 'Minimal', text: 'text-emerald-400', bar: 'bg-emerald-500', track: 'shadow-emerald-500/20' }
}

// Semantic verdict lock: safe = emerald, danger = ruby, disputed = amber,
// invalid = slate. Primary is ruby, so safe states never reference it.
const VERDICT_META: Record<string, { text: string; chip: string; ring: string; rail: string; glow: string }> = {
  danger: {
    text: 'text-red-400',
    chip: 'border-red-500/30 bg-red-500/10 text-red-400',
    ring: 'bg-red-500/30',
    rail: 'via-red-500/80',
    glow: 'bg-red-600/30',
  },
  safe: {
    text: 'text-emerald-400',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    ring: '',
    rail: 'via-emerald-500/70',
    glow: 'bg-emerald-600/25',
  },
  disputed: {
    text: 'text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    ring: '',
    rail: 'via-amber-500/70',
    glow: 'bg-amber-500/25',
  },
  warn: {
    text: 'text-slate-300',
    chip: 'border-white/15 bg-white/[0.05] text-slate-400',
    ring: '',
    rail: 'via-slate-500/60',
    glow: 'bg-slate-500/20',
  },
}

const METER_SEGMENTS = 20

const getCategoryColor = (cat: string) => TIER_CHIP[categoryTier(cat)]

// Feed keys (pipeline/update_feed.py) → human vendor names. Several raw keys
// collapse to one vendor (both Feodo lists are "Feodo Tracker"), so the chip
// row dedupes after mapping.
const SOURCE_LABELS: Record<string, string> = {
  feodo_tracker: 'Feodo Tracker', feodo_tracker_aggressive: 'Feodo Tracker',
  threatfox_full: 'ThreatFox', sslbl_abuse_ch: 'SSL Blacklist',
  bbcan177_ms1: 'BBcan177', ipsum: 'IPsum', blackbook: 'BlackBook',
  firehol_level1: 'FireHOL L1', firehol_level2: 'FireHOL L2', firehol_level3: 'FireHOL L3',
  cins_army: 'CINS Army',
  emerging_threats: 'Emerging Threats', emerging_threats_fwrules: 'Emerging Threats',
  blocklist_de: 'Blocklist.de', blocklist_de_ssh: 'Blocklist.de SSH', blocklist_de_mail: 'Blocklist.de Mail',
  blocklist_de_apache: 'Blocklist.de Apache', blocklist_net_bots: 'blocklist.net Bots', blocklist_net_strongips: 'blocklist.net Strong_ips',
  binary_defense: 'Binary Defense', greensnow: 'GreenSnow', abuseipdb: 'AbuseIPDB',
  spamhaus_drop: 'Spamhaus DROP', spamhaus_edrop: 'Spamhaus eDROP', spamhaus_dropv6: 'Spamhaus DROPv6',
  dshield_blocklist: 'SANS DShield', criticalpath_security: 'Critical Path',
  bruteforceblocker: 'BruteForceBlocker', botvrij: 'Botvrij',
  dan_tor: 'Tor List', tor_bulk_exit: 'Tor Project', snort_ip_filter: 'Snort',
  alienvault_reputation: 'AlienVault OTX', stopforumspam_toxic: 'StopForumSpam',
  romainmarcoux_outgoing_40k: 'R. Marcoux', romainmarcoux_outgoing_aa: 'R. Marcoux', romainmarcoux_outgoing_ab: 'R. Marcoux',
  dataplane_sipinv: 'DataPlane SIP', dataplane_sshclient: 'DataPlane SSH', dataplane_sshpwauth: 'DataPlane SSH Auth', dataplane_vncrfb: 'DataPlane VNC',
  custom: 'Threatbase Verified',
}

function labelSources(keys: string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    const label = SOURCE_LABELS[k] || k
    if (!out.includes(label)) out.push(label)
  }
  return out
}

// RDAP answers from rdap.org are heterogeneous (registrar vs registry,
// vcard vs plain name, string vs array eventAction). Parse everything with
// optional chaining and render only the fields that came back.
function WhoisSection({ scanResult, ip, abuseHref }: any) {
  const isDomain = !!scanResult?.isDomain
  const [fields, setFields] = useState<[string, string][] | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!ip) return
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    setLoading(true)
    setFailed(false)
    setFields(null)

    const url = isDomain
      ? `https://rdap.org/domain/${encodeURIComponent(ip)}`
      : `https://rdap.org/ip/${encodeURIComponent(ip)}`

    fetch(url, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error('rdap http')
        return r.json()
      })
      .then(json => {
        clearTimeout(timeoutId)
        if (cancelled) return
        const fmtDate = (s: any) => {
          const d = new Date(String(s))
          return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
        }
        const events: Record<string, string> = {}
        for (const ev of Array.isArray(json?.events) ? json.events : []) {
          const actions: string[] = Array.isArray(ev?.eventAction) ? ev.eventAction : [ev?.eventAction]
          const action = actions.find(a => a === 'registration' || a === 'last changed' || a === 'expiration')
          if (action && ev?.eventDate) events[action] = fmtDate(ev.eventDate)
        }
        const registrar = (Array.isArray(json?.entities) ? json.entities : []).find((e: any) => (e?.roles || []).includes('registrar'))
        const vcards: any[] = Array.isArray(registrar?.vcardArray?.[1]) ? registrar.vcardArray[1] : []
        const organization = vcards.find((v: any) => v?.[0] === 'fn')?.[3] || registrar?.name || ''
        const adr = vcards.find((v: any) => v?.[0] === 'adr')
        const country = (Array.isArray(json?.publicIds) ? json.publicIds : []).find((p: any) => p?.type === 'country')?.identifier || adr?.[3]?.[6] || ''
        const rows: [string, string][] = []
        // IPs: the card's intel grid already shows ISP/Country, and RDAP's
        // network name/organization/country are the same entity in another
        // casing. Keep registration data to what the grid does NOT have.
        if (!isDomain) {
          if (events['registration']) rows.push(['Registered', events['registration']])
          if (events['last changed']) rows.push(['Last changed', events['last changed']])
          if (events['expiration']) rows.push(['Expires', events['expiration']])
          const cidr = Array.isArray(json?.cidr) ? json.cidr.join(', ') : (json?.cidr || '')
          if (cidr) rows.push(['Network', String(cidr)])
          if (json?.parentHandle) rows.push(['Parent handle', String(json.parentHandle)])
        } else {
          if (organization) rows.push(['Organization', String(organization)])
          if (country) rows.push(['Country', String(country)])
          if (events['registration']) rows.push(['Registered', events['registration']])
          if (events['last changed']) rows.push(['Last changed', events['last changed']])
          if (events['expiration']) rows.push(['Expires', events['expiration']])
        }
        setFields(rows)
        setLoading(false)
      })
      .catch(() => {
        clearTimeout(timeoutId)
        if (!cancelled) {
          setFailed(true)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [ip, isDomain])

  return (
    <div className="w-full">
      <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">Registration data</h3>
      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4 animate-pulse">
              <div className="mb-2 h-2 w-16 rounded bg-slate-800" />
              <div className="h-3 w-2/3 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <p className="text-sm text-slate-400">
          Could not load registration data.{' '}
          <a href={abuseHref} target="_blank" rel="noopener" className="font-semibold text-platinum-200 underline-offset-4 hover:underline">
            Use an external whois lookup
          </a>
          .
        </p>
      ) : fields && fields.length > 0 ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
            {fields.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">{label}</div>
                <div className="break-all text-sm font-medium text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <a href={abuseHref} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300">
            <Globe size={12} strokeWidth={2} />
            Full whois record on whois.com
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-400">No registration records returned for this {scanResult?.isDomain ? 'domain' : 'address'}.</p>
      )}
    </div>
  )
}

function CommentsSection({ ip, addToast }: { ip: string; addToast: (msg: string, type: string) => void }) {
  const { user, profile, signInWithGoogle } = useAuth()
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setComments([])
    if (!ip || !supabaseClient) {
      setLoading(false)
      return
    }
    setLoading(true)
    // Promise.resolve: the Supabase builder is only *thenable* (see reports fetch above).
    void Promise.resolve(supabaseClient
      .from('comments')
      .select('id, body, username, user_id, created_at')
      .eq('indicator', ip)
      .order('created_at', { ascending: false })
      .limit(50))
      .then(({ data }) => {
        if (cancelled) return
        if (data) setComments(data)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ip])

  const handlePost = async () => {
    if (!user) return
    const text = body.trim()
    if (!text) return addToast('Please write a comment first.', 'error')
    if (text.length > 1000) return addToast('Comment must be under 1000 characters.', 'error')
    if (!supabaseClient) return addToast('Database connection unavailable.', 'error')

    setPosting(true)
    try {
      const { data, error } = await supabaseClient.from('comments').insert([{
        indicator: ip,
        body: text,
        user_id: user.id,
        username: profile?.username || user.email?.split('@')[0] || 'contributor'
      }]).select('id, body, username, user_id, created_at').single()

      if (error) throw error
      setComments(prev => [data || { id: crypto.randomUUID(), body: text, username: profile?.username || 'contributor', user_id: user.id, created_at: new Date().toISOString() }, ...prev])
      setBody('')
      addToast('Comment posted.', 'success')
    } catch (err: any) {
      console.error(err)
      addToast('Failed to post comment: ' + err.message, 'error')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user || !supabaseClient) return
    setComments(prev => prev.filter(c => c.id !== id))
    void Promise.resolve(supabaseClient
      .from('comments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id))
      .catch((err: any) => console.error(err))
  }

  return (
    <div className="w-full">
      <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
        Comments{comments.length > 0 ? <span className="ml-2 text-base font-bold text-platinum-500">({comments.length})</span> : null}
      </h3>

      {user ? (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Share context about this indicator (e.g. seen scanning SSH, false positive on our network)..."
            className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 resize-none transition-all shadow-inner"
          ></textarea>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 tabular-nums">{body.length}/1000</span>
            <button
              onClick={handlePost}
              disabled={posting}
              className="px-5 py-2.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 uppercase tracking-wider"
            >
              {posting ? 'Posting...' : 'Post comment'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-6 text-sm text-slate-400">
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="font-semibold text-platinum-200 underline-offset-4 hover:underline"
          >
            Sign in
          </button>
          {' '}to join the discussion.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-5 animate-pulse">
              <div className="mb-2 h-3 w-28 rounded bg-slate-800" />
              <div className="h-3 w-3/4 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="truncate text-sm font-bold text-slate-200">@{c.username || 'contributor'}</span>
                  <span className="shrink-0 text-[11px] font-medium text-slate-500">{timeAgo(c.created_at || new Date().toISOString())}</span>
                </div>
                {user && c.user_id === user.id && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-red-400"
                  >
                    Delete
                  </button>
                )}
              </div>
              {/* Plain text only; React escapes the body, never injects HTML. */}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MalwareDescriptionBlock({ tag }: { tag: string }) {
  const desc = getMalwareDescription(tag) || getMalwareDescription('Malware');

  if (!desc) return null;

  // Severity tier drives the accent, so no category can introduce a new hue.
  const tier = categoryTier(tag)
  const accent = TIER_ACCENT[tier]

  return (
    <div className={`mt-5 p-4 rounded-xl bg-slate-950/40 border ${accent.card} shadow-inner`}>
      <div>
        <h4 className="text-slate-200 font-bold text-sm tracking-tight">
          {tag}
        </h4>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

export default function ReportScanner({ scanResult, isScanning, showReport, scanInput, addToast }: any) {
  const [reports, setReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [ipInfo, setIpInfo] = useState<any>(null)
  const [loadingIpInfo, setLoadingIpInfo] = useState(false)
  const [isDisputing, setIsDisputing] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [copied, setCopied] = useState(false)

  const { user } = useAuth()
  const reduce = useReducedMotion()

  const ip = scanResult?.ip || scanInput?.trim() || ''
  const isMalicious = scanResult?.isMalicious
  const isDisputed = scanResult?.isDisputed

  const type = scanResult
    ? isMalicious
      ? 'danger'
      : isDisputed
        ? 'disputed'
        : scanResult.type === 'invalid'
          ? 'warn'
          : 'safe'
    : null

  useEffect(() => {
    if (scanResult && (scanResult.isIP || scanResult.isIPv6 || scanResult.isDomain) && ip) {
      setLoadingReports(true)

      if (supabaseClient) {
        // Promise.resolve: the Supabase builder is only *thenable*, so a
        // trailing .catch is not on its type without a real Promise.
        void Promise.resolve(supabaseClient
          .from('reported_ips')
          .select('*')
          .eq('ip', ip)
          .order('created_at', { ascending: false })
          .limit(100))
          .then(({ data }) => {
            if (data) setReports(data)
            setLoadingReports(false)
          })
          .catch(() => setLoadingReports(false))
      } else {
        setLoadingReports(false)
      }

      if (scanResult.isIP || scanResult.isIPv6) {
        setLoadingIpInfo(true)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`, { signal: controller.signal })
          .then(r => r.json())
          .then(data => {
            clearTimeout(timeoutId)
            if (data && data.ip) {
              setIpInfo({
                country: data.country,
                city: data.city,
                isp: data.organization_name || data.organization,
                asn: data.asn ? `AS${data.asn}` : null,
                country_flag: data.country_code ? `https://flagcdn.com/w20/${data.country_code.toLowerCase()}.png` : null
              })
            } else {
              setIpInfo(null)
            }
            setLoadingIpInfo(false)
          })
          .catch((err) => {
            clearTimeout(timeoutId)
            console.error("IP lookup failed or timed out:", err);
            setIpInfo(null)
            setLoadingIpInfo(false)
          })
      } else {
        setLoadingIpInfo(false)
        setIpInfo(null)
      }
    } else {
      setReports([])
      setIpInfo(null)
    }
  }, [scanResult, ip])

  // Build external links
  let abuseHref = '#'
  let showAbuse = false
  if (scanResult) {
    const { isIP, isIPv6, isDomain } = scanResult
    if (isIP || isIPv6 || isDomain) {
      abuseHref = 'https://www.whois.com/whois/' + encodeURIComponent(ip)
      showAbuse = true
    }
  }

  const handleDispute = async () => {
    if (!user) return addToast('Please sign in to report a false positive.', 'error')
    if (!supabaseClient) return addToast('Database connection unavailable.', 'error')
    if (!disputeReason.trim()) return addToast('Please provide a reason.', 'error')
    if (disputeReason.length > 500) return addToast('Reason must be under 500 characters.', 'error')

    setIsDisputing(true)
    try {
      const alias = user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0]
      const safeReason = DOMPurify.sanitize(disputeReason.trim())
      const { error } = await supabaseClient.from('disputes').insert([{
        ip,
        reporter_alias: alias,
        reason: safeReason
      }])

      if (error) {
        if (error.code === '23505') {
          addToast('You have already disputed this indicator.', 'error')
        } else {
          throw error
        }
      } else {
        addToast('False positive report submitted! Thank you for helping the community.', 'success')
        setShowDisputeForm(false)
        setDisputeReason('')
      }
    } catch (err: any) {
      console.error(err)
      addToast('Failed to submit dispute: ' + err.message, 'error')
    } finally {
      setIsDisputing(false)
    }
  }



  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ip)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      addToast('Could not copy to clipboard.', 'error')
    }
  }

  const StatusIcon = type === 'danger' ? Bug : type === 'safe' ? ShieldCheck : type === 'disputed' ? ShieldAlert : AlertTriangle

  const confidence = computeConfidence(scanResult, reports.length)
  const tier = getConfidenceTier(confidence)
  const verdict = VERDICT_META[type || 'warn']

  // Count-up runs once per scan (re-targets whenever scanResult identity or the
  // derived confidence changes); reduced-motion snaps to the final value.
  const confidenceMv = useMotionValue(0)
  const confidenceDisplay = useTransform(confidenceMv, (v) => Math.round(v))
  useEffect(() => {
    if (reduce) {
      confidenceMv.set(confidence)
      return
    }
    const controls = animate(confidenceMv, confidence, { duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 })
    return () => controls.stop()
  }, [scanResult, confidence, reduce, confidenceMv])

  const scannedAt = useMemo(() => new Date(), [scanResult])
  const flaggedBy = type === 'danger' && scanResult?.sources?.length > 0 ? labelSources(scanResult.sources) : []
  const filledSegments = Math.max(confidence > 0 ? 1 : 0, Math.round((confidence / 100) * METER_SEGMENTS))

  if (!showReport) return null;

  return (
    <section className="py-12" id="report-section" aria-live="polite">
      <div className="mx-auto max-w-5xl px-6 lg:px-12 relative">
        <AnimatePresence mode="wait">
          {isScanning ? (
            <motion.div
              key="scanning"
              className="w-full min-h-[320px] flex flex-col items-center justify-center p-8 relative"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              <ScanPulse ip={ip} />
            </motion.div>
          ) : scanResult ? (
            <motion.div
              key="results-container"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="w-full space-y-12"
            >
              {/* Scan Result Card */}
              <motion.div
                className="relative w-full max-w-4xl mx-auto overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/70 to-slate-950/80 backdrop-blur-2xl font-sans shadow-glass-lux"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
              >
                {/* Status accent rail */}
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${verdict.rail} to-transparent`}></div>
                {/* Ambient verdict glow */}
                <div className={`pointer-events-none absolute -top-24 left-1/2 h-48 w-2/3 -translate-x-1/2 rounded-full opacity-30 blur-3xl ${verdict.glow}`}></div>

                {/* Verdict band */}
                <div className="relative p-6 md:p-8 border-b border-white/[0.06]">
                  <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
                    <div className="relative shrink-0">
                      {/* Pulse ring marks live danger only */}
                      {type === 'danger' && !reduce && (
                        <span className={`absolute inset-0 rounded-2xl animate-pulse-ring ${verdict.ring}`} aria-hidden="true" />
                      )}
                      <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border ${verdict.chip}`}>
                        <StatusIcon size={22} strokeWidth={2.2} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-platinum-500">Scan verdict</p>
                      <h3 className={`mt-1 text-xl md:text-[1.65rem] font-bold tracking-tight leading-snug ${verdict.text}`}>
                        {type === 'danger' ? 'Threat found in our database' : type === 'safe' ? 'No threat found in our database' : type === 'disputed' ? 'This indicator is currently disputed' : 'Invalid indicator format'}
                      </h3>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleCopy}
                          title="Copy to clipboard"
                          className="group inline-flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-slate-950/60 px-4 py-2.5 font-mono text-sm md:text-[0.95rem] tracking-tight text-platinum-200 break-all shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-white/15 hover:bg-slate-950 text-left"
                        >
                          <span className="break-all">{ip}</span>
                          {copied
                            ? <Check size={15} className="text-emerald-400 shrink-0" strokeWidth={2.5} />
                            : <Copy size={15} className="text-slate-500 group-hover:text-platinum-200 shrink-0 transition-colors" />}
                        </button>
                        <span className="text-xs font-medium text-platinum-500">
                          Scanned {scannedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          {' '}&#183;{' '}{type === 'danger'
                            ? `${flaggedBy.length} flagging feed${flaggedBy.length === 1 ? '' : 's'}`
                            : `${reports.length} community report${reports.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      {/* Which intel sources actually list this indicator. Neutral
                          platinum pills: a vendor name is provenance, not severity,
                          so it must not borrow the threat color scale. */}
                      {type === 'danger' && scanResult?.sources?.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Flagged by</span>
                          {flaggedBy.map((name) => (
                            <span
                              key={name}
                              className="inline-flex cursor-default items-center rounded-full border border-platinum-400/25 bg-platinum-400/[0.06] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-platinum-200 transition-colors hover:border-white/25 hover:text-white"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {scanResult && (scanResult.isIP || scanResult.isIPv6 || scanResult.isDomain) && (
                    <>
                      <div className="mt-7 flex items-end justify-between gap-4">
                        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-platinum-400">
                          <span>Confidence of Abuse</span>
                          <span className="cursor-help font-bold text-platinum-500 hover:text-platinum-200 transition-colors bg-white/[0.04] border border-white/10 rounded-full w-5 h-5 flex items-center justify-center text-xs" title="Weighted score derived from severity, number of threat feeds, subnet matches, and community reports.">?</span>
                        </div>
                        <div className="flex items-baseline gap-2.5">
                          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${tier.text}`}>{tier.label}</span>
                          <motion.span className={`font-display text-3xl md:text-4xl font-bold tabular-nums leading-none ${tier.text}`}>{confidenceDisplay}</motion.span>
                          <span className="text-base font-semibold text-platinum-500">%</span>
                        </div>
                      </div>
                      {/* Segmented detection meter: 20 ticks, colored by tier */}
                      <div className="mt-4 flex w-full gap-[3px]" role="img" aria-label={`Confidence of abuse ${confidence} percent, ${tier.label}`}>
                        {Array.from({ length: METER_SEGMENTS }, (_, i) => (
                          <motion.div
                            key={i}
                            initial={reduce ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: reduce ? 0 : 0.15 + i * 0.025, duration: 0.25 }}
                            className={`h-2.5 flex-1 rounded-full ${i < filledSegments ? `${tier.bar} ${tier.track}` : 'bg-white/[0.06]'}`}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Clean indicator — reassuring summary */}
                  {type === 'safe' && scanResult && (scanResult.isIP || scanResult.isIPv6 || scanResult.isDomain) && (
                    <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                      <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20 shrink-0 mt-0.5">
                        <ShieldCheck size={18} className="text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-bold text-sm tracking-tight">No malicious activity on record</h4>
                        <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                          This {scanResult.isDomain ? 'domain' : 'address'} was not found in any of our threat-intelligence feeds and has{reports.length === 0 ? ' no' : ` ${reports.length}`} community {reports.length === 1 ? 'report' : 'reports'}. A clean result is not a guarantee of safety. Always combine multiple signals before trusting an indicator.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Invalid indicator message */}
                  {type === 'warn' && (
                    <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-slate-500/5 border border-slate-500/20">
                      <AlertTriangle size={18} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-300 leading-relaxed">
                        The indicator you entered does not match a valid IPv4, IPv6, Domain, URL, or Hash format. Please check for typos and try again.
                      </p>
                    </div>
                  )}

                  {/* Related-infrastructure pivot match (subdomain / URL host) */}
                  {type === 'danger' && scanResult?.relatedMatch && (
                    <div className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
                      <ShieldAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {scanResult.relatedMatch.reason}:{' '}
                        <span className="font-mono font-bold text-rose-300 break-all">{scanResult.relatedMatch.indicator}</span>.
                        The exact indicator is not listed, but it belongs to known malicious infrastructure.
                      </p>
                    </div>
                  )}

                  {/* Malicious subnet (CIDR range) match */}
                  {type === 'danger' && scanResult?.matchedCidr && !scanResult?.relatedMatch && (
                    <div className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
                      <ShieldAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-300 leading-relaxed">
                        Listed via malicious subnet{' '}
                        <span className="font-mono font-bold text-rose-300 break-all">{scanResult.matchedCidr}</span>.
                        This address falls inside a range flagged by threat-intelligence feeds (e.g. Spamhaus, FireHOL).
                      </p>
                    </div>
                  )}

                  {/* Threat Tags and Severity */}
                  {type === 'danger' && (scanResult?.tags?.length > 0 || scanResult?.riskScore) && (
                    <div className="mt-5 flex flex-col gap-4 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center">
                      {scanResult?.riskScore && scanResult.riskScore !== 'Low' && (
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Severity</span>
                          <span className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                            scanResult.riskScore.toLowerCase() === 'high' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' :
                            scanResult.riskScore.toLowerCase() === 'medium' ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' :
                            'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
                          }`}>
                            {scanResult.riskScore}
                          </span>
                        </div>
                      )}

                      {scanResult?.tags && scanResult.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Known Threats</span>
                          {scanResult.tags.map((tag: string) => (
                            <span key={tag} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-semibold text-platinum-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Malware Descriptions */}
                  {type === 'danger' && scanResult?.tags?.length > 0 && (
                    <div className="flex flex-col">
                      {scanResult.tags.map((tag: string) => (
                        <MalwareDescriptionBlock key={`desc-${tag}`} tag={tag} />
                      ))}
                    </div>
                  )}

                  {/* Hash Simple Text */}
                  {type === 'danger' && scanResult?.isHash && (
                    <p className="mt-5 text-slate-300 text-sm leading-relaxed font-medium">This is a malicious hash found in our feed.</p>
                  )}
                </div>

                {/* Body / Metadata Section: equal-height intel cells */}
                {scanResult && (scanResult.isIP || scanResult.isIPv6 || scanResult.isDomain) && (
                  <div className="grid grid-cols-1 gap-px bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3">
                    {scanResult.isDomain ? (
                      <div className="bg-slate-950/30 px-6 py-5 md:px-8 md:col-span-2 lg:col-span-3">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Domain Name</div>
                        <div className="break-all text-sm font-medium text-slate-100">{ip}</div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-slate-950/30 px-6 py-5 md:px-8">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">ISP</div>
                          <div className="text-sm font-medium text-slate-100">{loadingIpInfo ? 'Loading…' : (ipInfo?.isp || 'N/A')}</div>
                        </div>
                        <div className="bg-slate-950/30 px-6 py-5 md:px-8">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">ASN</div>
                          <div className="font-mono text-sm text-slate-100">{loadingIpInfo ? 'Loading…' : (ipInfo?.asn || 'N/A')}</div>
                        </div>
                        <div className="bg-slate-950/30 px-6 py-5 md:px-8">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Country</div>
                          <div className="flex items-center gap-2.5 text-sm font-medium text-slate-100">
                            {ipInfo?.country_flag && <img src={ipInfo.country_flag} className="w-5 rounded-sm border border-white/10 object-cover shadow-sm" alt="Flag" />}
                            {loadingIpInfo ? 'Loading…' : (ipInfo?.country || 'N/A')}
                          </div>
                        </div>
                        <div className="bg-slate-950/30 px-6 py-5 md:px-8">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">City</div>
                          <div className="text-sm font-medium text-slate-100">{loadingIpInfo ? 'Loading…' : (ipInfo?.city || 'N/A')}</div>
                        </div>
                        <div className="bg-slate-950/30 px-6 py-5 md:px-8">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Type</div>
                          <div className="font-mono text-sm text-slate-100">{scanResult.isIPv6 ? 'IPv6' : scanResult.isIP ? 'IPv4' : 'N/A'}</div>
                        </div>
                        {/* Filler for the 6th slot of the 3-col hairline grid, so
                            the container background never shows as a ghost cell. */}
                        <div className="hidden bg-slate-950/30 md:block" aria-hidden="true" />
                      </>
                    )}
                  </div>
                )}

                {/* Footer Section */}
                {type !== 'warn' && ((scanResult && (scanResult.isIP || scanResult.isIPv6 || scanResult.isDomain)) || (!scanResult?.isHash || showAbuse)) && (
                  <div className="relative p-6 md:p-8 bg-slate-950/30 border-t border-white/[0.06]">
                    {scanResult && (scanResult.isIP || scanResult.isIPv6) && (
                      <p className="mb-5 text-xs font-medium tracking-wide text-platinum-500">
                        IP info including ISP, Usage Type, and Location provided by Threatbase. Updated weekly.
                      </p>
                    )}
                    {scanResult && scanResult.isDomain && (
                      <p className="mb-5 text-xs font-medium tracking-wide text-platinum-500">
                        Domain information provided by Threatbase.
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* External whois CTA removed: the inline Registration
                          data section replaced it (its own failure state and
                          footer carry the whois.com link). */}
                      {!scanResult?.isHash && (
                        <button
                          onClick={() => setShowDisputeForm(true)}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-transparent px-4 py-3.5 text-[13px] font-semibold tracking-[0.06em] text-platinum-300 transition-all hover:border-white/20 hover:text-white active:translate-y-px"
                        >
                          <ShieldAlert size={15} strokeWidth={2.5} className="shrink-0" />
                          Report false positive
                        </button>
                      )}
                    </div>

                    {/* Dispute Form */}
                    {showDisputeForm && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-5 pt-5 border-t border-slate-800 overflow-hidden">
                        <h5 className="text-sm font-bold text-slate-300 mb-3">Why is this a false positive? <span className="text-rose-400">*</span></h5>
                        <textarea
                          value={disputeReason}
                          onChange={e => setDisputeReason(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 resize-none transition-all shadow-inner"
                          rows={3}
                          placeholder="Please provide details (e.g. 'This is a public DNS resolver', 'Internal proxy')..."
                        ></textarea>
                        <div className="flex items-center gap-3 mt-4 justify-end">
                          <button onClick={() => setShowDisputeForm(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider rounded-lg hover:bg-slate-800/50">Cancel</button>
                          <button onClick={handleDispute} disabled={isDisputing} className="px-5 py-2.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 uppercase tracking-wider">
                            {isDisputing ? 'Submitting...' : 'Submit Dispute'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>

              {scanResult && (scanResult.isIP || scanResult.isIPv6 || scanResult.isDomain) && (
                <WhoisSection scanResult={scanResult} ip={ip} abuseHref={abuseHref} />
              )}

              {scanResult && type !== 'warn' && ip && (
                <CommentsSection ip={ip} addToast={addToast} />
              )}

              {loadingReports ? (
                <div
                  className="w-full flex flex-col items-center justify-center py-20 bg-slate-900 rounded-2xl border border-slate-800"
                >
                  <div className="relative h-8 w-8 mb-4">
                    <div className="absolute inset-0 rounded-full border border-slate-800"></div>
                    <div className="absolute inset-0 rounded-full border border-slate-500 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="font-semibold tracking-wider text-[10px] text-slate-500 uppercase">Fetching community reports...</p>
                </div>
              ) : reports.length > 0 ? (
                <div className="w-full space-y-6">
                  <div>
                    <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
                      Community Reports for <span className="bg-gradient-to-r from-primary/80 to-primary bg-clip-text text-transparent font-mono break-all inline-block">{ip}</span>
                    </h3>
                    <p className="text-xs md:text-sm text-slate-400 leading-relaxed font-medium">
                      This IP address has been reported <span className="text-white font-bold">{reports.length.toLocaleString()}</span> times. First reported on <span className="text-slate-300 font-medium">{new Date(reports[reports.length - 1].created_at || Date.now()).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>, with the most recent report from <span className="text-slate-300 font-medium">{timeAgo(reports[0].created_at || new Date().toISOString())}</span>.
                    </p>
                  </div>

                  <div className="relative overflow-hidden bg-slate-900 border border-slate-800 border-l-2 border-l-orange-500 px-6 py-5 rounded-xl shadow-sm font-elegant">
                    <div className="space-y-1.5 relative z-10">
                      <strong className="text-orange-500 block text-[11px] uppercase tracking-widest font-bold">Active Threat Warning</strong>
                      <p className="text-slate-300 leading-relaxed text-xs">
                        Abusive activity was reported from this address within the past week. It may still be actively engaged in hostile operations.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left block md:table">
                        <thead className="hidden md:table-header-group text-[10px] uppercase bg-slate-950 text-slate-400 font-bold border-b border-slate-800 tracking-widest">
                          <tr>
                            <th className="px-6 py-5 w-[20%]">Reporter</th>
                            <th className="px-6 py-5 w-[25%]">
                              <div className="flex items-center gap-1.5">
                                IoA Timestamp (UTC)
                                <span className="text-primary text-[9px] font-bold bg-primary/10 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center cursor-help" title="Indicator of Attack timestamp">?</span>
                              </div>
                            </th>
                            <th className="px-6 py-5 w-[35%]">Comment</th>
                            <th className="px-6 py-5 text-right w-[20%]">Categories</th>
                          </tr>
                        </thead>
                        <tbody className="block md:table-row-group p-4 md:p-0 space-y-4 md:space-y-0 md:divide-y md:divide-slate-800">
                          {reports.map((row, idx) => {
                            const createdAt = row.created_at || new Date().toISOString();
                            const reporter = row.reporter_alias || 'Anonymous';
                            const comment = row.comment || 'No context provided.';
                            const categories = (row.category || 'Other').split(', ');

                            return (
                              <tr key={idx} className="block md:table-row bg-slate-950 md:bg-transparent hover:bg-slate-800/50 transition-colors group border border-slate-800 md:border-0 rounded-xl md:rounded-none p-4 md:p-0">
                                <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <Check size={14} className="text-primary shrink-0" strokeWidth={2.5} />
                                    <span className="font-bold text-slate-300">@{reporter}</span>
                                  </div>
                                </td>
                                <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 whitespace-nowrap text-slate-400">
                                  <div className="flex items-center gap-2 md:block">
                                    <div>{createdAt.replace('T', ' ').substring(0, 19)}</div>
                                    <div className="text-[10px] text-slate-500 font-medium md:mt-1">({timeAgo(createdAt)})</div>
                                  </div>
                                </td>
                                <td className="block md:table-cell px-0 py-3 md:px-6 md:py-4 text-slate-300 md:max-w-[300px] border-t border-b border-slate-800 md:border-0 my-3 md:my-0">
                                  <div className="leading-relaxed font-medium md:line-clamp-2" title={comment}>{comment}</div>
                                </td>
                                <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 text-right">
                                  <div className="flex flex-wrap md:justify-end gap-1.5 pt-1 md:pt-0">
                                    {categories.map((cat: string) => (
                                      <span key={cat} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${getCategoryColor(cat)}`}>
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  )
}


