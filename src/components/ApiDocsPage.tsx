import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import IsoPageShell from './layout/IsoPageShell'
import {
  KeyRound, Gauge, Terminal, Copy, Check, ArrowRight, ShieldCheck, Globe,
  Zap, SearchX, CircleAlert, BookOpen, Layers, Radio,
} from 'lucide-react'
import { useSEO } from '@/useSEO'

const BASE_URL = 'https://threatbase.qzz.io'

/* ------------------------------------------------------------------ */
/* Lightweight, dependency-free syntax highlighter.                    */
/* Tokenizes a handful of languages just enough to colour code blocks. */
/* Token colours stay on the site ramp (ruby → vermilion → amber →     */
/* platinum → slate) plus the one sanctioned green, so a code block    */
/* never imports an editor theme's cold hues (tasteskill colour lock). */
/* ------------------------------------------------------------------ */

type Token = { text: string; cls: string }

const C = {
  comment: 'text-slate-500 italic',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  keyword: 'text-red-400',
  builtin: 'text-orange-300',
  property: 'text-platinum-300',
  punct: 'text-slate-500',
  plain: 'text-slate-200',
  method: 'text-red-300',
}

const PY_KEYWORDS = new Set([
  'import', 'from', 'as', 'def', 'return', 'if', 'else', 'elif', 'for', 'while',
  'in', 'not', 'and', 'or', 'with', 'try', 'except', 'raise', 'None', 'True',
  'False', 'print', 'class', 'pass', 'lambda',
])

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  const push = (text: string, cls: string) => text && tokens.push({ text, cls })

  if (lang === 'python' && /^\s*#/.test(line)) return [{ text: line, cls: C.comment }]
  if (lang === 'bash' && /^\s*#/.test(line)) return [{ text: line, cls: C.comment }]

  while (i < line.length) {
    const rest = line.slice(i)
    const strMatch = rest.match(/^([frb]?)(["'])(?:\\.|(?!\2).)*\2/)
    if (strMatch) {
      push(strMatch[0], C.string)
      i += strMatch[0].length
      continue
    }
    const numMatch = rest.match(/^\b\d+(\.\d+)?\b/)
    if (numMatch) {
      push(numMatch[0], C.number)
      i += numMatch[0].length
      continue
    }
    if (lang === 'http') {
      const verb = rest.match(/^\b[A-Z]+\b/)
      if (verb && HTTP_METHODS.has(verb[0])) {
        push(verb[0], C.keyword)
        i += verb[0].length
        continue
      }
    }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)
    if (word) {
      const w = word[0]
      const after = line[i + w.length]
      if (lang === 'python' && PY_KEYWORDS.has(w)) push(w, C.keyword)
      else if (after === '(') push(w, C.method)
      else if (line[i - 1] === '.') push(w, C.property)
      else push(w, C.plain)
      i += w.length
      continue
    }
    const ch = rest[0]
    if (/[{}[\]():,.;=<>+\-*/&|]/.test(ch)) push(ch, C.punct)
    else push(ch, C.plain)
    i += 1
  }
  return tokens
}

function highlightJson(line: string): Token[] {
  const tokens: Token[] = []
  const keyMatch = line.match(/^(\s*)("(?:\\.|[^"])*")(\s*:)/)
  let rest = line
  if (keyMatch) {
    const indent = keyMatch[1]
    tokens.push({ text: indent, cls: C.plain })
    tokens.push({ text: keyMatch[2], cls: C.property })
    tokens.push({ text: keyMatch[3], cls: C.punct })
    rest = line.slice(keyMatch[0].length)
  }
  const strVal = rest.match(/^(\s*)("(?:\\.|[^"])*")/)
  if (strVal) {
    tokens.push({ text: strVal[1], cls: C.plain })
    tokens.push({ text: strVal[2], cls: C.string })
    rest = rest.slice(strVal[0].length)
  } else {
    const boolNum = rest.match(/^(\s*)(true|false|null|-?\d+(\.\d+)?)/)
    if (boolNum) {
      tokens.push({ text: boolNum[1], cls: C.plain })
      tokens.push({ text: boolNum[2], cls: /true|false|null/.test(boolNum[2]) ? C.keyword : C.number })
      rest = rest.slice(boolNum[0].length)
    }
  }
  tokens.push({ text: rest, cls: C.punct })
  return tokens
}

interface CodeBlockProps {
  code: string
  language?: 'python' | 'bash' | 'json' | 'http' | 'text'
  filename?: string
}

function CodeBlock({ code, language = 'text', filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { }
  }

  const lines = code.replace(/\n$/, '').split('\n')

  return (
    <div className="group/code relative overflow-hidden glass-card shadow-glass-lux">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {filename || language}
        </span>
        <button
          onClick={handleCopy}
          aria-label="Copy code"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-bold text-slate-400 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-95 md:py-1"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-red-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="min-w-full py-4 font-mono text-[13px] leading-relaxed">
          {lines.map((line, idx) => {
            const tokens =
              language === 'json' ? highlightJson(line) : tokenizeLine(line, language)
            return (
              <div key={idx} className="flex px-4 hover:bg-white/[0.015]">
                <span className="w-8 shrink-0 select-none pr-4 text-right text-slate-500">
                  {idx + 1}
                </span>
                <code className="whitespace-pre">
                  {line.length === 0 ? (
                    <span> </span>
                  ) : (
                    tokens.map((t, ti) => (
                      <span key={ti} className={t.cls}>
                        {t.text}
                      </span>
                    ))
                  )}
                </code>
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  const styles =
    method === 'GET'
      ? 'text-platinum-200 bg-white/5 border-platinum-400/25'
      : 'text-red-300 bg-red-500/10 border-red-500/30'
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs font-bold tracking-wider ${styles}`}
    >
      {method}
    </span>
  )
}

interface ParamRow {
  name: string
  type: string
  required: boolean
  desc: string
}

function ParamTable({ rows, title }: { rows: ParamRow[]; title: string }) {
  return (
    <div className="overflow-hidden glass-card">
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-400">
        {title}
      </div>
      <div className="divide-y divide-white/[0.04]">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[180px_1fr]">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-sm font-semibold text-platinum-200">{r.name}</code>
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                {r.type}
              </span>
              {r.required ? (
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-300">
                  required
                </span>
              ) : (
                <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  optional
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-400">{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionHeading({
  id,
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  id?: string
  icon: React.ElementType
  eyebrow?: string
  title: string
  children?: React.ReactNode
}) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      id={id}
      className="mb-8 scroll-mt-28"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="icon-chip h-10 w-10">
          <Icon className="h-5 w-5" />
        </div>
        {eyebrow && (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-red-400/80">
            {eyebrow}
          </span>
        )}
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{title}</h2>
      {children && (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">{children}</p>
      )}
    </motion.div>
  )
}

/** A labelled endpoint header bar: method + path + one-line description. */
function EndpointBar({
  method,
  path,
  desc,
  pro,
}: {
  method: 'GET' | 'POST'
  path: string
  desc: string
  pro?: boolean
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.04] glass-card px-5 py-4">
      <MethodBadge method={method} />
      <code className="font-mono text-sm font-semibold text-white sm:text-base">{path}</code>
      {pro && (
        <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-300">
          key required
        </span>
      )}
      <span className="ml-auto text-sm text-slate-400">{desc}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scroll-spy for the in-page sidebar                                  */
/* ------------------------------------------------------------------ */

const NAV_SECTIONS = [
  { id: 'authentication', label: 'Authentication' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'scan', label: 'GET /scan' },
  { id: 'batch-scan', label: 'POST /scan' },
  { id: 'report', label: 'POST /report' },
  { id: 'lookup', label: 'GET /lookup' },
  { id: 'errors', label: 'Errors' },
  { id: 'quickstart', label: 'Quickstart' },
]

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [ids.join(',')])
  return active
}

function SideNav({ active }: { active: string }) {
  return (
    <nav aria-label="On this page" className="sticky top-28 hidden lg:block">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-slate-600">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-white/[0.06]">
        {NAV_SECTIONS.map((s) => {
          const on = active === s.id
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors ${
                  on
                    ? 'border-red-500 font-semibold text-white'
                    : 'border-transparent text-slate-500 hover:border-white/20 hover:text-slate-300'
                }`}
              >
                {s.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Code samples — verified against the live response shapes            */
/* ------------------------------------------------------------------ */

const PYTHON_EXAMPLE = `import requests

# Your Threatbase API key (generate one from your Profile page)
API_KEY = "tb_api_xxxxxxxxxxxxxxxx"
BASE_URL = "${BASE_URL}/api/v1"

headers = {"x-api-key": API_KEY}

# 1. Scan one indicator (IP, IPv6, domain, URL, or file hash)
def scan(indicator):
    resp = requests.get(
        f"{BASE_URL}/scan",
        headers=headers,
        params={"ip": indicator},
    )
    resp.raise_for_status()
    return resp.json()["data"]

# 2. Scan up to 100 typed indicators in a single call
def scan_batch(pairs):
    resp = requests.post(
        f"{BASE_URL}/scan",
        headers=headers,
        json={"indicators": [{"type": t, "value": v} for t, v in pairs]},
    )
    resp.raise_for_status()
    return resp.json()["results"]

# 3. Report a malicious IP to the community feed
def report(ip, category, comment):
    resp = requests.post(
        f"{BASE_URL}/report",
        headers=headers,
        json={"ip": ip, "category": category, "comment": comment},
    )
    resp.raise_for_status()
    return resp.json()

if __name__ == "__main__":
    verdict = scan("1.0.164.165")
    print("Malicious:", verdict["isMalicious"], "| risk:", verdict["riskScore"])
    print("Tags:", ", ".join(verdict["tags"]))

    hits = scan_batch([("ipv4", "8.8.8.8"), ("domain", "example.com")])
    print("Batch clean count:", sum(1 for h in hits if not h["malicious"]))`

const CURL_SCAN = `curl "${BASE_URL}/api/v1/scan?ip=1.0.164.165" \\
  -H "x-api-key: tb_api_xxxxxxxxxxxxxxxx"`

// Verbatim from a live /api/lookup for this listed indicator (same shape as
// the keyed /api/v1/scan), so copy-pasting the curl reproduces it exactly.
const SCAN_RESPONSE = `{
  "success": true,
  "data": {
    "type": "IP Address",
    "ip": "1.0.164.165",
    "isIP": true,
    "isDomain": false,
    "isHash": false,
    "isURL": false,
    "isIPv6": false,
    "isCIDR": false,
    "isMalicious": true,
    "riskScore": "High",
    "feedCount": 6,
    "isDisputed": false,
    "disputeCount": 0,
    "tags": ["Brute-Force", "Malicious"],
    "sources": [
      "blocklist_de",
      "blocklist_de_ssh",
      "firehol_level2",
      "ipsum",
      "romainmarcoux_outgoing_ab"
    ],
    "matchedCidr": null,
    "relatedMatch": null
  }
}`

// The same endpoint for an unlisted indicator: isMalicious flips false and the
// detection fields empty out. Copy-paste this curl and it is what you get.
const CURL_SCAN_CLEAN = `curl "${BASE_URL}/api/v1/scan?ip=8.8.8.8" \\
  -H "x-api-key: tb_api_xxxxxxxxxxxxxxxx"`

const SCAN_RESPONSE_CLEAN = `{
  "success": true,
  "data": {
    "type": "IP Address",
    "ip": "8.8.8.8",
    "isIP": true,
    "isDomain": false,
    "isHash": false,
    "isURL": false,
    "isIPv6": false,
    "isCIDR": false,
    "isMalicious": false,
    "riskScore": "Low",
    "feedCount": 1,
    "isDisputed": false,
    "disputeCount": 0,
    "tags": [],
    "sources": [],
    "matchedCidr": null,
    "relatedMatch": null
  }
}`

const CURL_BATCH_SCAN = `curl -X POST "${BASE_URL}/api/v1/scan" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: tb_api_xxxxxxxxxxxxxxxx" \\
  -d '{
    "indicators": [
      { "type": "ipv4", "value": "1.0.164.165" },
      { "type": "domain", "value": "example.com" }
    ]
  }'`

// Batch items carry value/malicious/status (not ip/isMalicious) and one entry
// is returned per submitted indicator. Values reflect the live corpus.
const BATCH_SCAN_RESPONSE = `{
  "results": [
    {
      "type": "ipv4",
      "value": "1.0.164.165",
      "malicious": true,
      "status": "malicious",
      "riskScore": "High",
      "feedCount": 6,
      "tags": ["Brute-Force", "Malicious"],
      "sources": [
        "blocklist_de",
        "blocklist_de_ssh",
        "firehol_level2",
        "ipsum",
        "romainmarcoux_outgoing_ab"
      ],
      "matchedCidr": null,
      "relatedMatch": null,
      "disputeCount": 0
    },
    {
      "type": "domain",
      "value": "example.com",
      "malicious": false,
      "status": "clean",
      "riskScore": "Low",
      "feedCount": 1,
      "tags": [],
      "sources": [],
      "matchedCidr": null,
      "relatedMatch": null,
      "disputeCount": 0
    }
  ],
  "total": 2
}`

const BATCH_ERROR_RESPONSE = `{
  "results": [
    {
      "type": "ipv4",
      "value": "999.1.1.1",
      "malicious": false,
      "status": "error",
      "error": "'999.1.1.1' is not a valid ipv4"
    }
  ],
  "total": 1
}`

const CURL_REPORT = `curl -X POST "${BASE_URL}/api/v1/report" \\
  -H "x-api-key: tb_api_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"ip": "45.155.205.233", "category": "Brute-Force", "comment": "Repeated SSH login attempts"}'`

const REPORT_RESPONSE = `{
  "success": true,
  "message": "IP reported successfully."
}`

const CURL_LOOKUP = `curl "${BASE_URL}/api/lookup?value=1.0.164.165"`

const AUTH_HEADER_EXAMPLE = `x-api-key: tb_api_xxxxxxxxxxxxxxxx`

const STATUS_CODES = [
  { code: '400', meaning: 'Bad request', detail: "Missing or oversized 'ip'/'value', invalid JSON body, an empty or >100-item indicators array, or a rejected report field (non-public IP, bad category, comment too long)." },
  { code: '401', meaning: 'Unauthorized', detail: "No x-api-key header, or the key is invalid or revoked. Also returned after 100 failed auth attempts from one IP in a day." },
  { code: '409', meaning: 'Conflict', detail: 'You have already reported this IP (deduped per key on ip + user).' },
  { code: '429', meaning: 'Rate limited', detail: 'Over your tier cap — 1,000 requests/day on Free, 20,000/day on Pro. The error quotes your own limit. The window resets at 00:00 UTC.' },
  { code: '503', meaning: 'Unavailable', detail: 'A server secret is missing, so authentication or reporting is temporarily disabled. Fail-closed by design.' },
]

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ApiDocsPage() {
  const prefersReducedMotion = useReducedMotion()
  const active = useScrollSpy(NAV_SECTIONS.map((s) => s.id))

  useSEO({
    title: 'API Documentation | Threatbase Threat Intelligence API',
    description:
      'Integrate real-time threat intelligence into your stack: scan IPs, domains, URLs, and hashes, and report malicious indicators programmatically via the Threatbase API.',
    path: '/api',
    keywords:
      'threat intelligence API, IP reputation API, scan IP API, report malicious IP, threatbase api, security api, IOC lookup api',
  })

  const scanParams: ParamRow[] = [
    {
      name: 'ip',
      type: 'string',
      required: true,
      desc: 'The indicator to scan. Auto-detected: IPv4, IPv6, CIDR, domain, URL, or MD5/SHA-1/SHA-256 hash. Defanged input (hxxp://evil[.]com, 1.2.3[.]4) is refanged first. (Alias: indicator)',
    },
  ]

  const batchScanParams: ParamRow[] = [
    {
      name: 'indicators',
      type: 'array',
      required: true,
      desc: 'List of { type, value } objects to scan in one request. 1–100 items; each value is charged against the daily quota.',
    },
    {
      name: 'indicators[].type',
      type: 'string',
      required: true,
      desc: 'One of: ipv4, ipv6, domain, url, md5, sha1, sha256. Each value is validated against its declared type (a mismatch is a per-item error).',
    },
    {
      name: 'indicators[].value',
      type: 'string',
      required: true,
      desc: 'The indicator. Defanged forms are accepted and normalized.',
    },
  ]

  const reportParams: ParamRow[] = [
    { name: 'ip', type: 'string', required: true, desc: 'The public IPv4/IPv6 address you are reporting. Loopback, private, and reserved ranges are rejected.' },
    {
      name: 'category',
      type: 'string',
      required: true,
      desc: 'Threat category, e.g. C2, Botnet, Brute-Force, Exploit, Spam, or Tor.',
    },
    {
      name: 'comment',
      type: 'string',
      required: true,
      desc: 'A short description with supporting evidence. HTML is stripped; capped at 500 characters.',
    },
  ]

  return (
    <IsoPageShell contentClassName="px-0">
      {/* Hero — editorial statement: the promise, left-aligned and full
          width, with the base URL and the two primary CTAs. */}
      <section className="mx-auto w-full max-w-6xl px-6">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-left"
        >
          <div className="eyebrow mb-6">
            <Terminal className="h-3.5 w-3.5" />
            Developer API
          </div>

          <h1 className="mb-6 text-[2.6rem] font-extrabold leading-[1.03] tracking-tighter text-white sm:text-6xl">
            The Threat Intelligence{' '}
            <span className="text-liquid-red">API, minus the noise.</span>
          </h1>

          <p className="mb-8 max-w-xl text-lg leading-relaxed text-slate-300">
            Scan any indicator and report malicious activity with a single
            authenticated HTTP request. Clean JSON, one header, no SDK.
          </p>

          <div className="mb-8 inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-xs text-slate-300 sm:text-sm">
            <span className="text-red-500">$</span>
            <span className="text-slate-500">base url</span>
            <span className="whitespace-nowrap text-slate-100">{BASE_URL}/api/v1</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/profile"
              className="group inline-flex items-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-glow-ruby transition-all hover:bg-red-500"
            >
              <KeyRound className="h-4 w-4" />
              Get your API key
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#scan"
              className="inline-flex items-center gap-2 rounded-2xl border border-platinum-400/20 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-platinum-300 backdrop-blur-md transition-all hover:border-platinum-400/40 hover:bg-white/[0.06] hover:text-white"
            >
              <BookOpen className="h-4 w-4" />
              Read the reference
            </a>
          </div>
        </motion.div>
      </section>

      {/* Quick highlights */}
      <motion.section
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto mt-24 mb-4 flex w-full max-w-6xl flex-col divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.06] glass-card sm:flex-row sm:divide-x sm:divide-y-0"
      >
        {[
          { icon: Globe, title: 'REST + JSON', desc: 'Predictable HTTPS endpoints returning one clean verdict object.' },
          { icon: KeyRound, title: 'One header', desc: 'Authenticate every call with an x-api-key you mint free.' },
          { icon: Gauge, title: '1K – 20K / day', desc: 'Free keys get 1,000/day, Pro keys 20,000. Batch charged per indicator.' },
          { icon: Radio, title: 'Live corpus', desc: 'Answers come from the same indexed data behind the Hunt.' },
        ].map((f) => (
          <div key={f.title} className="flex-1 p-6 text-left">
            <div className="icon-chip mb-4 h-10 w-10">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-base font-bold text-white">{f.title}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
          </div>
        ))}
      </motion.section>

      {/* Body: sticky sidebar + content column */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 lg:grid-cols-[200px_1fr]">
        <SideNav active={active} />

        <div className="min-w-0 max-w-3xl">
          {/* Authentication */}
          <section id="authentication" className="mb-24 scroll-mt-28">
            <SectionHeading icon={KeyRound} eyebrow="Getting started" title="Authentication">
              Every <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">/api/v1</code>{' '}
              request must carry an API key. Mint one for free from your{' '}
              <Link to="/profile" className="font-semibold text-red-400 underline-offset-4 hover:underline">
                Profile page
              </Link>{' '}
              under <span className="font-semibold text-slate-300">API Keys</span> (up to three per
              account), then pass it in the{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">x-api-key</code>{' '}
              header.
            </SectionHeading>

            <div className="relative mb-8 flex flex-col items-start gap-6 md:flex-row md:gap-8">
              <div className="absolute left-0 right-0 top-2 hidden h-px bg-white/5 md:block" />
              {[
                { step: 'Sign in', desc: 'Log into Threatbase with Google or GitHub.' },
                { step: 'Generate a key', desc: 'Open your Profile and create an API key — verify with a second factor.' },
                { step: 'Send the header', desc: 'Attach x-api-key to every request you make.' },
              ].map((s) => (
                <div key={s.step} className="relative flex-1">
                  <div className="relative z-10 mb-4 h-4 w-4 rounded-full bg-red-500 shadow-glow-ruby" />
                  <h3 className="mb-2 text-base font-bold text-white">{s.step}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{s.desc}</p>
                </div>
              ))}
            </div>

            <CodeBlock code={AUTH_HEADER_EXAMPLE} language="http" filename="Request header" />

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-950/20 px-5 py-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <p className="text-sm leading-relaxed text-red-100/80">
                Your key is shown only once at creation and is stored hashed on our servers — we
                keep the <code className="font-mono text-red-300">tb_api_</code> prefix and discard
                the rest. Treat it like a password: never embed it in client-side code or commit it
                to source control.
              </p>
            </div>
          </section>

          {/* Rate limits */}
          <section id="rate-limits" className="mb-24 scroll-mt-28">
            <SectionHeading icon={Gauge} eyebrow="Fair use" title="Rate Limits">
              Every validated key carries a daily quota that follows your plan:{' '}
              <span className="font-semibold text-white">1,000 requests/day on Free</span> and{' '}
              <span className="font-semibold text-white">20,000/day on Pro</span>, resetting at
              00:00 UTC. A batch{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">POST /scan</code>{' '}
              is charged <span className="font-semibold text-white">per indicator</span>, not per
              HTTP call. Failed-auth attempts are limited separately to 100 per IP per day.
            </SectionHeading>

            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { k: '1K / 20K', v: 'free / pro requests per day' },
                { k: '100', v: 'indicators / batch' },
                { k: '255', v: 'chars / indicator' },
              ].map((s) => (
                <div key={s.v} className="rounded-xl border border-white/[0.06] glass-card p-5">
                  <div className="font-mono text-3xl font-extrabold text-white">{s.k}</div>
                  <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <CodeBlock
                code={`{\n  "error": "Rate limit exceeded. Maximum 1000 requests per day."\n}`}
                language="json"
                filename="429 Too Many Requests · free-tier key"
              />
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                The limit quoted inside the error always matches your key&apos;s tier — a Pro key
                over the wire sees{' '}
                <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-platinum-300">"Rate limit exceeded. Maximum 20000 requests per day."</code>
              </p>
            </div>
          </section>

          {/* GET /scan */}
          <section id="scan" className="mb-24 scroll-mt-28">
            <SectionHeading icon={SearchX} eyebrow="Reference" title="Scan one indicator">
              Enrich a single IP, IPv6, CIDR, domain, URL, or file hash against the live corpus.
              The endpoint auto-detects the type and echoes it back in{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">data.type</code>.
            </SectionHeading>

            <EndpointBar method="GET" path="/api/v1/scan" desc="Scan a single indicator." pro />

            <div className="space-y-6">
              <ParamTable rows={scanParams} title="Query Parameters" />

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Request · listed indicator
                </p>
                <CodeBlock code={CURL_SCAN} language="bash" filename="cURL" />
              </div>

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Response · 200 OK
                </p>
                <CodeBlock code={SCAN_RESPONSE} language="json" filename="200 OK" />
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Unlisted indicator → clean verdict
                </p>
                <p className="mb-4 max-w-2xl text-sm leading-relaxed text-slate-400">
                  The same call on an indicator the corpus has never seen returns{' '}
                  <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-emerald-300">isMalicious: false</code>{' '}
                  with empty <code className="font-mono text-xs text-slate-400">tags</code>,{' '}
                  <code className="font-mono text-xs text-slate-400">sources</code>, and a{' '}
                  <code className="font-mono text-xs text-slate-400">Low</code> risk score — this is
                  exactly what the curl below produces.
                </p>
                <CodeBlock code={CURL_SCAN_CLEAN} language="bash" filename="cURL" />
                <div className="mt-4">
                  <CodeBlock code={SCAN_RESPONSE_CLEAN} language="json" filename="200 OK" />
                </div>
              </div>

              <FieldLegend />
            </div>
          </section>

          {/* POST /scan batch */}
          <section id="batch-scan" className="mb-24 scroll-mt-28">
            <SectionHeading icon={Layers} eyebrow="Reference" title="Batch scan">
              Scan up to 100 typed indicators in one request. Batch items use a leaner shape —{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">value</code>,{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">malicious</code>,{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">status</code>{' '}
              — and you always get one result per submitted indicator.
            </SectionHeading>

            <EndpointBar method="POST" path="/api/v1/scan" desc="Scan up to 100 indicators." pro />

            <div className="space-y-6">
              <ParamTable rows={batchScanParams} title="JSON Body Parameters" />

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Request
                </p>
                <CodeBlock code={CURL_BATCH_SCAN} language="bash" filename="cURL" />
              </div>

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Response · 200 OK
                </p>
                <CodeBlock code={BATCH_SCAN_RESPONSE} language="json" filename="200 OK" />
              </div>

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Per-item errors
                </p>
                <p className="mb-3 max-w-2xl text-sm leading-relaxed text-slate-400">
                  A malformed indicator never fails the batch — it comes back as a{' '}
                  <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-platinum-300">status: "error"</code>{' '}
                  entry. Only structural problems (invalid JSON, an empty or oversized array) return
                  a 400 for the whole request.
                </p>
                <CodeBlock code={BATCH_ERROR_RESPONSE} language="json" filename="200 OK" />
              </div>
            </div>
          </section>

          {/* POST /report */}
          <section id="report" className="mb-24 scroll-mt-28">
            <SectionHeading icon={ShieldCheck} eyebrow="Reference" title="Report an indicator">
              Submit a malicious IP to the community feed. Reports are validated, attributed to
              your key, deduplicated per account, and folded into the corpus after review.
            </SectionHeading>

            <EndpointBar method="POST" path="/api/v1/report" desc="Report a malicious IP." pro />

            <div className="space-y-6">
              <ParamTable rows={reportParams} title="JSON Body Parameters" />

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Request
                </p>
                <CodeBlock code={CURL_REPORT} language="bash" filename="cURL" />
              </div>

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Response · 200 OK
                </p>
                <CodeBlock code={REPORT_RESPONSE} language="json" filename="200 OK" />
              </div>

              <p className="text-sm leading-relaxed text-slate-400">
                Reporting the same IP again with the same key returns{' '}
                <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-amber-300">409</code>{' '}
                <span className="font-mono text-xs text-slate-500">"You have already reported this IP."</span>
              </p>
            </div>
          </section>

          {/* GET /lookup (free) */}
          <section id="lookup" className="mb-24 scroll-mt-28">
            <SectionHeading icon={Globe} eyebrow="No key" title="Free public lookup">
              The endpoint powering the free Hunt box. Browsers cannot hold a secret, so this one
              answer stays unauthenticated on purpose — rate-limited per network (500/day). The
              documented, keyed API above is <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">/api/v1</code>.
            </SectionHeading>

            <EndpointBar method="GET" path="/api/lookup" desc="Public, no API key." />

            <div className="space-y-6">
              <ParamTable
                title="Query Parameters"
                rows={[
                  { name: 'value', type: 'string', required: true, desc: 'The indicator to check. Same auto-detection and refanging as /api/v1/scan.' },
                ]}
              />
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Request
                </p>
                <CodeBlock code={CURL_LOOKUP} language="bash" filename="cURL" />
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Example Response · 200 OK
                </p>
                <CodeBlock code={SCAN_RESPONSE} language="json" filename="200 OK" />
              </div>
            </div>
          </section>

          {/* Errors */}
          <section id="errors" className="mb-24 scroll-mt-28">
            <SectionHeading icon={CircleAlert} eyebrow="Reference" title="Errors & status codes">
              Errors are JSON objects with a single{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">error</code>{' '}
              string. Every message below is emitted verbatim by the API.
            </SectionHeading>

            <div className="overflow-hidden glass-card">
              <div className="hidden grid-cols-[80px_150px_1fr] gap-4 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-400 sm:grid">
                <span>Code</span>
                <span>Meaning</span>
                <span>When it happens</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {STATUS_CODES.map((e) => (
                  <div key={e.code} className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[80px_150px_1fr] sm:gap-4">
                    <code className="font-mono text-sm font-bold text-red-300">{e.code}</code>
                    <span className="text-sm font-semibold text-slate-200">{e.meaning}</span>
                    <p className="text-sm leading-relaxed text-slate-400">{e.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Quickstart */}
          <section id="quickstart" className="mb-12 scroll-mt-28">
            <SectionHeading icon={Zap} eyebrow="Quickstart" title="Python example">
              A copy-paste script that scans an indicator, runs a batch, and reports a malicious IP
              with the{' '}
              <code className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300">requests</code>{' '}
              library.
            </SectionHeading>
            <CodeBlock code={PYTHON_EXAMPLE} language="python" filename="threatbase_client.py" />
          </section>
        </div>
      </div>

      {/* CTA */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative mx-auto mt-24 w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/[0.06] glass-card px-6 py-12 text-center shadow-glass-lux md:px-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-red-900/10" />
        <div className="relative z-10">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Ready to build?
          </h2>
          <p className="mx-auto mb-8 max-w-xl leading-relaxed text-slate-300">
            Generate your API key and start integrating real-time threat intelligence into your
            stack in minutes.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/profile"
              className="group inline-flex items-center gap-2 rounded-2xl bg-red-600 px-7 py-3 text-sm font-semibold text-white shadow-glow-ruby transition-all hover:bg-red-500"
            >
              <KeyRound className="h-4 w-4" />
              Get your API key
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center gap-2 rounded-2xl border border-platinum-400/20 bg-white/[0.03] px-7 py-3 text-sm font-semibold text-platinum-300 backdrop-blur-md transition-all hover:border-platinum-400/40 hover:bg-white/[0.06] hover:text-white"
            >
              Learn more
            </Link>
          </div>
        </div>
      </motion.div>
    </IsoPageShell>
  )
}

/** Compact legend for the verdict object's non-obvious fields. */
function FieldLegend() {
  const rows = [
    { name: 'type', desc: 'Human label from auto-detection: "IP Address", "IPv6 Address", "CIDR Block", "Domain", "URL", "File Hash", or "invalid".' },
    { name: 'riskScore', desc: '"High" (score ≥ 90), "Medium" (≥ 60), or "Low".' },
    { name: 'isDisputed', desc: 'True once 3+ community disputes are open — this flips isMalicious to false even when listed.' },
    { name: 'matchedCidr', desc: 'The listed CIDR that contained your IP, when detection came from a range rather than an exact hit.' },
    { name: 'relatedMatch', desc: 'Set when the hit is inferred — e.g. a subdomain of a listed domain, or a URL hosted on a listed IP.' },
  ]
  return (
    <div className="overflow-hidden glass-card">
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-400">
        Response fields
      </div>
      <div className="divide-y divide-white/[0.04]">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[160px_1fr]">
            <code className="font-mono text-sm font-semibold text-platinum-200">{r.name}</code>
            <p className="text-sm leading-relaxed text-slate-400">{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
