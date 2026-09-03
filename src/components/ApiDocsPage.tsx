import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import IsoPageShell from './layout/IsoPageShell'
import { KeyRound, Gauge, Terminal, Copy, Check, ArrowRight, ShieldCheck, Globe } from 'lucide-react'
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
  const [copied, setCopied] = React.useState(false)

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
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            {filename || language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 md:py-1 text-[11px] font-bold text-slate-400 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-95"
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
                <span className="select-none pr-4 text-right text-slate-600 w-8 shrink-0">
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
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
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
      className="mb-8"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="icon-chip w-10 h-10">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{title}</h2>
      {children && <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">{children}</p>}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Code samples                                                        */
/* ------------------------------------------------------------------ */

const PYTHON_EXAMPLE = `import requests

# Your Threatbase API key (generate one from your Profile page)
API_KEY = "tb_api_xxxxxxxxxxxxxxxx"
BASE_URL = "${BASE_URL}/api/v1"

headers = {"x-api-key": API_KEY}

# 1. Scan an indicator (IP, domain, URL, or file hash)
def scan(indicator):
    resp = requests.get(
        f"{BASE_URL}/scan",
        headers=headers,
        params={"ip": indicator},
    )
    resp.raise_for_status()
    return resp.json()

# 2. Report a malicious IP to the community feed
def report(ip, category, comment):
    resp = requests.post(
        f"{BASE_URL}/report",
        headers=headers,
        json={"ip": ip, "category": category, "comment": comment},
    )
    resp.raise_for_status()
    return resp.json()

if __name__ == "__main__":
    result = scan("8.8.8.8")
    print("Malicious:", result["data"]["isMalicious"])
    print("Risk score:", result["data"]["riskScore"])

    report("45.155.205.233", "Brute-Force", "Repeated SSH login attempts")`

const CURL_SCAN = `curl "${BASE_URL}/api/v1/scan?ip=8.8.8.8" \\
  -H "x-api-key: tb_api_xxxxxxxxxxxxxxxx"`

const SCAN_RESPONSE = `{
  "success": true,
  "data": {
    "type": "ip",
    "ip": "45.155.205.233",
    "isMalicious": true,
    "riskScore": "High",
    "feedCount": 4,
    "isDisputed": false,
    "disputeCount": 0,
    "tags": ["Brute-Force", "C2"],
    "matchedCidr": "45.155.205.0/24"
  }
}`

const CURL_BATCH_SCAN = `curl -X POST "${BASE_URL}/api/v1/scan" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: tb_api_xxxxxxxxxxxxxxxx" \\
  -d '{
    "indicators": [
      { "type": "ipv4", "value": "8.8.8.8" },
      { "type": "domain", "value": "example.com" },
      { "type": "url", "value": "https://example.com/login" },
      { "type": "sha256", "value": "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f" }
    ]
  }'`

const BATCH_SCAN_RESPONSE = `{
  "results": [
    {
      "type": "ipv4",
      "value": "8.8.8.8",
      "malicious": false,
      "status": "clean",
      "riskScore": "Low",
      "feedCount": 1,
      "tags": [],
      "sources": []
    },
    {
      "type": "domain",
      "value": "example.com",
      "malicious": true,
      "status": "malicious",
      "riskScore": "High",
      "feedCount": 6,
      "tags": ["Phishing", "C2"],
      "sources": ["urlhaus", "phishtank"]
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
  -d '{"ip": "45.155.205.233", "category": "Brute-Force", "comment": "SSH brute force"}'`
const REPORT_RESPONSE = `{
  "success": true,
  "message": "IP reported successfully."
}`

const AUTH_HEADER_EXAMPLE = `x-api-key: tb_api_xxxxxxxxxxxxxxxx`

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ApiDocsPage() {
  const prefersReducedMotion = useReducedMotion()
  useSEO({
    title: 'API Documentation | Threatbase Threat Intelligence API',
    description:
      'Integrate real-time threat intelligence into your applications with the Threatbase API. Scan IPs, domains, URLs, and file hashes, and report malicious indicators programmatically.',
    path: '/api',
    keywords:
      'threat intelligence API, IP reputation API, scan IP API, report malicious IP, threatbase api, security api, IOC lookup api',
  })

  const scanParams: ParamRow[] = [
    {
      name: 'ip',
      type: 'string',
      required: true,
      desc: 'The indicator to scan. Accepts an IPv4/IPv6 address, domain, URL, or file hash. (Alias: indicator)',
    },
  ]

  const batchScanParams: ParamRow[] = [
    {
      name: 'indicators',
      type: 'array',
      required: true,
      desc: 'List of { type, value } objects to scan in one request. Maximum 100 per request.',
    },
    {
      name: 'indicators[].type',
      type: 'string',
      required: true,
      desc: 'One of: ipv4, ipv6, domain, url, md5, sha1, sha256. Each value is validated against its declared type.',
    },
    {
      name: 'indicators[].value',
      type: 'string',
      required: true,
      desc: 'The indicator. Defanged forms (hxxp://evil[.]com, 1.2.3[.]4) are accepted and normalized.',
    },
  ]

  const reportParams: ParamRow[] = [
    { name: 'ip', type: 'string', required: true, desc: 'The malicious IP address you are reporting.' },
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
      desc: 'A short description with supporting evidence for the report.',
    },
  ]

  return (
    <IsoPageShell color="207, 23, 51">
      {/* Hero */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-4xl text-center"
      >
        <div className="eyebrow mb-6">
          <Terminal className="h-3.5 w-3.5" />
          Developer API
        </div>

        <h1 className="mb-6 text-5xl font-extrabold tracking-tighter text-white drop-shadow-2xl md:text-7xl">
          The Threatbase <br />
          <span className="text-liquid-red text-metal">
            Threat Intelligence API.
          </span>
        </h1>

        <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl">
          Bring real-time threat intelligence straight into your applications, pipelines, and
          security tooling. Scan any indicator and report malicious activity with a single,
          authenticated HTTP request.
        </p>

        <div className="mb-16 inline-block rounded-2xl bg-gradient-to-r from-red-500/40 to-red-800/40 p-[1px] shadow-glow-ruby">
          <div className="rounded-2xl bg-slate-950/80 px-6 py-4 backdrop-blur-xl">
            <span className="font-mono text-xs sm:text-sm text-metal tracking-wide md:text-base">
              <span className="text-destructive">$</span> base url{' '}
              <span className="text-slate-200 break-all">{BASE_URL}/api/v1</span>
            </span>
          </div>
        </div>
      </motion.div>

      {/* Quick highlights */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mx-auto mb-28 flex flex-col sm:flex-row w-full max-w-4xl divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] glass-card"
      >
        {[
          { icon: Globe, title: 'REST + JSON', desc: 'Predictable HTTPS endpoints returning clean JSON.' },
          { icon: KeyRound, title: 'API Key Auth', desc: 'Simple x-api-key header authentication.' },
          { icon: Gauge, title: '1,000 / day', desc: 'Generous free per-key daily rate limit.' },
        ].map((f) => (
          <div
            key={f.title}
            className="flex-1 p-6 text-left"
          >
            <div className="icon-chip w-10 h-10 mb-4">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-base font-bold text-white">{f.title}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
          </div>
        ))}
      </motion.div>

      {/* Authentication */}
      <section className="mx-auto mb-28 w-full max-w-4xl">
        <SectionHeading icon={KeyRound} title="Authentication">
          Every request must be authenticated with an API key. Generate one for free from your{' '}
          <Link to="/profile" className="font-semibold text-red-400 underline-offset-4 hover:underline">
            Profile page
          </Link>{' '}
          under the <span className="font-semibold text-slate-300">API Keys</span> section, then pass
          it in the <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300 border border-white/10">x-api-key</code>{' '}
          header on every call.
        </SectionHeading>

        <div className="mb-6 flex flex-col md:flex-row gap-8 relative items-start">
          <div className="absolute top-8 left-0 right-0 h-px bg-white/5 hidden md:block" />
          {[
            { step: 'Sign in', desc: 'Log into Threatbase with Google or GitHub.' },
            { step: 'Generate a key', desc: 'Open your Profile and create a new API key.' },
            { step: 'Send the header', desc: 'Attach x-api-key to every request.' },
          ].map((s, i) => (
            <div
              key={s.step}
              className="flex-1 relative"
            >
              <div className="w-4 h-4 rounded-full bg-red-500 shadow-glow-ruby mb-4 relative z-10" />
              <h3 className="mb-2 text-base font-bold text-white">{s.step}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>

        <CodeBlock code={AUTH_HEADER_EXAMPLE} language="http" filename="Request header" />

        <div className="mt-8 flex items-start gap-3 glass-card bg-red-950/20 border-red-500/20 px-5 py-4 shadow-none">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm leading-relaxed text-red-100/80">
            Your key is shown only once at creation time and is stored hashed on our servers. Treat it
            like a password. Never embed it in client-side code or commit it to source control. Keys
            begin with the prefix <code className="font-mono text-red-300">tb_api_</code>.
          </p>
        </div>
      </section>

      {/* Rate limiting */}
      <section className="mx-auto mb-28 w-full max-w-4xl">
        <SectionHeading icon={Gauge} title="Rate Limiting">
          Each API key is limited to <span className="font-semibold text-white">1,000 requests per day</span>.
          The window resets at 00:00 UTC. Requests beyond the limit receive an HTTP{' '}
          <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-sm text-red-400 border border-white/10">429</code>{' '}
          response.
        </SectionHeading>

        <CodeBlock
          code={`{\n  "error": "Rate limit exceeded. Maximum 1000 requests per day."\n}`}
          language="json"
          filename="429 Too Many Requests"
        />
      </section>

      {/* Endpoints */}
      <section className="mx-auto mb-12 w-full max-w-4xl">
        <SectionHeading icon={Terminal} title="Endpoints" />
      </section>

      {/* GET /scan */}
      <section className="mx-auto mb-28 w-full max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3 glass-card px-5 py-4 shadow-none border-white/[0.04]">
          <MethodBadge method="GET" />
          <code className="font-mono text-sm font-semibold text-white sm:text-base">/api/v1/scan</code>
          <span className="text-sm text-slate-400">Scan an indicator against the live feeds.</span>
        </div>

        <div className="space-y-6">
          <ParamTable rows={scanParams} title="Query Parameters" />

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Example Request</p>
            <CodeBlock code={CURL_SCAN} language="bash" filename="cURL" />
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Example Response · 200 OK</p>
            <CodeBlock code={SCAN_RESPONSE} language="json" filename="200 OK" />
          </div>
        </div>
      </section>

      {/* POST /scan (batch) */}
      <section className="mx-auto mb-28 w-full max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3 glass-card px-5 py-4 shadow-none border-white/[0.04]">
          <MethodBadge method="POST" />
          <code className="font-mono text-sm font-semibold text-white sm:text-base">/api/v1/scan</code>
          <span className="text-sm text-slate-400">Scan up to 100 indicators in one request.</span>
        </div>

        <div className="space-y-6">
          <ParamTable rows={batchScanParams} title="JSON Body Parameters" />

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Example Request</p>
            <CodeBlock code={CURL_BATCH_SCAN} language="bash" filename="cURL" />
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Example Response · 200 OK</p>
            <CodeBlock code={BATCH_SCAN_RESPONSE} language="json" filename="200 OK" />
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Per-Item Errors</p>
            <p className="mb-3 max-w-2xl text-sm leading-relaxed text-slate-400">
              A malformed indicator never fails the batch. It comes back as a{' '}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-platinum-300 border border-white/10">status: "error"</code>{' '}
              entry, so you always get one result per submitted indicator. Structural problems (invalid JSON, an empty or oversized array) return a 400 instead.
            </p>
            <CodeBlock code={BATCH_ERROR_RESPONSE} language="json" filename="200 OK" />
          </div>
        </div>
      </section>

      {/* POST /report */}
      <section className="mx-auto mb-28 w-full max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3 glass-card px-5 py-4 shadow-none border-white/[0.04]">
          <MethodBadge method="POST" />
          <code className="font-mono text-sm font-semibold text-white sm:text-base">/api/v1/report</code>
          <span className="text-sm text-slate-400">Submit a malicious IP to the community feed.</span>
        </div>

        <div className="space-y-6">
          <ParamTable rows={reportParams} title="JSON Body Parameters" />

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Example Request</p>
            <CodeBlock code={CURL_REPORT} language="bash" filename="cURL" />
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Example Response · 200 OK</p>
            <CodeBlock code={REPORT_RESPONSE} language="json" filename="200 OK" />
          </div>
        </div>
      </section>

      {/* Python quickstart */}
      <section className="mx-auto mb-28 w-full max-w-4xl">
        <SectionHeading icon={Terminal} title="Python Example">
          A complete, copy-paste script that scans an indicator and reports a malicious IP using the{' '}
          <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-sm text-platinum-300 border border-white/10">requests</code>{' '}
          library.
        </SectionHeading>

        <CodeBlock code={PYTHON_EXAMPLE} language="python" filename="threatbase_client.py" />
      </section>

      {/* CTA */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] glass-card p-10 text-center shadow-glass-lux md:p-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-red-900/10" />
        <div className="relative z-10">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Ready to build?
          </h2>
          <p className="mx-auto mb-8 max-w-xl leading-relaxed text-slate-300">
            Generate your API key and start integrating real-time threat intelligence into your stack
            in minutes.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/profile"
              className="group inline-flex items-center gap-2 rounded-2xl bg-red-600 px-7 py-3 text-sm font-semibold text-white transition-all hover:bg-red-500 shadow-glow-ruby"
            >
              <KeyRound className="h-4 w-4" />
              Get your API key
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl border border-platinum-400/20 bg-white/[0.03] backdrop-blur-md text-platinum-300 font-semibold text-sm transition-all hover:border-platinum-400/40 hover:bg-white/[0.06] hover:text-white"
            >
              Learn more
            </Link>
          </div>
        </div>
      </motion.div>
    </IsoPageShell>
  )
}
