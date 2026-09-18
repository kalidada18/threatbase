import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Bug, Upload, Download, X, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EASE_EXPO } from './motion/primitives'
import { parseBulkText, parseBulkFile, runBulkScan, bulkToCsv, beginBulkScan, fetchBulkQuota, BULK_MAX_ROWS, BULK_PRO_DAILY, BULK_FREE_ROWS, type BulkRow, type ParsedBulk, type BulkQuota } from '../lib/bulkScan'
import { labelSources } from './sourceLabels'
import { usePro } from '../usePro'

/**
 * Bulk IOC hunt: paste, load a CSV/TXT, or drop an Excel workbook — every
 * sheet cell is scanned against the same corpus the single Hunt reads
 * (lookup_intel_batch, one round trip per 500 rows), and verdicts export
 * back as a detailed CSV.
 * The ledger idiom is borrowed from FeedHealth's <ul divide-y> + status dots.
 */

const STATUS_META: Record<string, { label: string; dot: string; cls: string }> = {
  malicious: { label: 'Threat', dot: 'bg-red-400', cls: 'text-red-400' },
  clean: { label: 'Clean', dot: 'bg-emerald-400', cls: 'text-emerald-400' },
  disputed: { label: 'Disputed', dot: 'bg-amber-400', cls: 'text-amber-400' },
  error: { label: 'Error', dot: 'bg-slate-500', cls: 'text-slate-400' },
}

const FILTERS = ['all', 'malicious', 'disputed', 'clean', 'error'] as const
type Filter = (typeof FILTERS)[number]

const PREVIEW_ROWS = 200
const PAGE_ROWS = 1000

export default function BulkScanner({ addToast, onClose }: any) {
  const { status: proStatus } = usePro()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'input' | 'running' | 'done' | 'quota'>('input')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<BulkRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PREVIEW_ROWS)
  const abortRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  // Closing the panel mid-run must stop the scan: runBulkScan checks
  // abortRef at each batch boundary and between rows within one, and only
  // the Stop button used to set it.
  useEffect(() => () => { abortRef.current = true }, [])

  // Remaining allowance for today, read without consuming a scan. Null until
  // the first fetch resolves (and forced null while signed-out / still
  // resolving auth, so the pill never flashes a stale number across accounts).
  const [quota, setQuota] = useState<Omit<BulkQuota, 'scanId' | 'denied'> | null>(null)
  useEffect(() => {
    if (proStatus === 'signed-out' || proStatus === 'checking') { setQuota(null); return }
    let cancelled = false
    fetchBulkQuota().then((q) => { if (!cancelled) setQuota(q) }).catch(() => {})
    return () => { cancelled = true }
  }, [proStatus])

  // Pro gate: bulk hunt rides the same entitlement as the Pro feed URLs
  // (GET /api/me/pro). superadmin bypasses server-side inside that check.
  // 'checking' gets a neutral shell, not the paywall card — pre-fix paid
  // members saw "Bulk hunt is a Pro feature" flash on every open while the
  // /api/me/pro round-trip resolved (LandingSections ProBand uses the same
  // checking-gate idiom).
  if (proStatus === 'checking') {
    return (
      <section id="bulk-section" className="py-12 scroll-mt-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-12">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/70 to-slate-950/80 backdrop-blur-2xl shadow-glass-lux p-10 text-center">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/80 to-transparent" />
            <p role="status" className="text-sm text-slate-400">Checking your Pro status…</p>
          </div>
        </div>
      </section>
    )
  }
  // Bulk hunt is open to every signed-in account; only the tier's numbers
  // differ (db/bulk_quota.sql), so the ONE hard gate is being signed in — and
  // that gate is real regardless of this UI, since lookup_intel_batch is
  // granted to `authenticated` only. 'not-pro' and 'unavailable' fall through
  // to the scanner; the allowance and "left today" come from the quota.
  if (proStatus === 'signed-out') {
    return (
      <section id="bulk-section" className="py-12 scroll-mt-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-12">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/70 to-slate-950/80 backdrop-blur-2xl shadow-glass-lux p-10 text-center">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/80 to-transparent" />
            <span className="icon-chip mx-auto h-10 w-10"><Lock size={18} /></span>
            <h3 className="mt-4 text-lg font-bold text-white">Sign in to bulk hunt</h3>
            <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              Bulk / CSV hunt is free for signed-in accounts — up to {BULK_FREE_ROWS.toLocaleString()} indicators, once a day.
              Pro raises that to {BULK_PRO_DAILY} scans a day and the full {BULK_MAX_ROWS.toLocaleString()} indicators per run.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/profile" className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-[13px] font-semibold tracking-[0.06em] text-white transition-all hover:bg-red-400 active:translate-y-px shadow-glow-red cursor-pointer">
                Sign in
              </Link>
              <Link to="/pricing" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-5 py-2.5 text-[13px] font-semibold text-platinum-300 transition-all hover:border-white/20 hover:text-white cursor-pointer">
                See Pro
              </Link>
              <button type="button" onClick={onClose} className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const scanRows = async (p: ParsedBulk, sourceName?: string) => {
    if (p.valid.length === 0) { addToast(`No valid indicators found${sourceName ? ` in ${sourceName}` : ''}.`, 'error'); return }
    if (p.invalid.length > 0) addToast(`${p.invalid.length} unparseable row${p.invalid.length === 1 ? '' : 's'} skipped${sourceName ? ` (${sourceName})` : ''}.`, 'error')

    // Open a metered scan before touching the corpus. begin_bulk_scan() both
    // charges one of today's units and mints the scan_id the chunks must carry;
    // a denied result means the day's allowance is spent, so switch to the
    // reset / upgrade state without running anything.
    let q: BulkQuota | null
    try { q = await beginBulkScan() }
    catch { addToast('Could not start the scan — please try again.', 'error'); return }
    if (!q) { addToast('Scan engine unavailable.', 'error'); return }
    if (q.denied) {
      setQuota({ tier: q.tier, dailyLimit: q.dailyLimit, usedToday: q.usedToday, remaining: 0, maxRows: q.maxRows })
      setPhase('quota')
      return
    }

    // Free and Pro share this code; only the row budget differs. Cap the input
    // to the scan's budget so the DB never rejects a mid-file chunk on over-cap.
    const cap = q.maxRows > 0 ? q.maxRows : BULK_MAX_ROWS
    let valid = p.valid
    if (p.truncated || valid.length > cap) {
      if (valid.length > cap) valid = valid.slice(0, cap)
      addToast(`${q.tier === 'pro' ? 'Pro' : 'Free'} scans up to ${cap.toLocaleString()} indicators per run — kept the first ${valid.length.toLocaleString()}.`, 'error')
    }

    abortRef.current = false
    setPhase('running')
    setFilter('all')
    setLimit(PREVIEW_ROWS)
    setResults([])
    setProgress({ done: 0, total: valid.length })

    // Streaming: buffer rows and flush to state every 50 so verdicts appear
    // while the run works; the final set gets the dispute-annotated rows.
    let buf: BulkRow[] = []
    const rows = await runBulkScan(
      valid,
      q.scanId,
      (done, total) => { setProgress({ done, total }) },
      () => abortRef.current,
      (row) => {
        buf.push(row)
        if (buf.length >= 50) { const b = buf; buf = []; setResults((prev) => [...prev, ...b]) }
      },
    )
    setResults(rows)
    setPhase('done')
    // This scan spent one of today's units — refresh the "left today" line.
    fetchBulkQuota().then((nq) => setQuota(nq)).catch(() => {})
  }

  const start = async () => {
    let p: ParsedBulk
    try {
      p = await parseBulkText(text)
    } catch {
      return addToast('Could not parse that input.', 'error')
    }
    void scanRows(p)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      void scanRows(await parseBulkFile(file), file.name)
    } catch (err: any) {
      console.error(err)
      addToast(`Could not read ${file.name}.`, 'error')
    }
  }

  const downloadCsv = () => {
    const blob = new Blob([bulkToCsv(results)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'threatbase-bulk-scan.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const counts = {
    all: results.length,
    malicious: results.filter((r) => r.status === 'malicious').length,
    clean: results.filter((r) => r.status === 'clean').length,
    disputed: results.filter((r) => r.status === 'disputed').length,
    error: results.filter((r) => r.status === 'error').length,
  }
  const ranked = [
    ...results.filter((r) => r.status === 'malicious'),
    ...results.filter((r) => r.status === 'disputed'),
    ...results.filter((r) => r.status === 'error'),
    ...results.filter((r) => r.status === 'clean'),
  ]
  const shown = filter === 'all' ? ranked : ranked.filter((r) => r.status === filter)
  const visible = shown.slice(0, limit)
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  const filterChip = (f: Filter) => (
    <button
      key={f}
      type="button"
      onClick={() => { setFilter(f); setLimit(PREVIEW_ROWS) }}
      aria-pressed={filter === f}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 ${
        filter === f
          ? 'border-white/25 bg-white/[0.08] text-white'
          : 'border-white/[0.08] bg-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {f !== 'all' && <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[f].dot}`} aria-hidden="true" />}
      {f === 'all' ? 'All' : STATUS_META[f].label}
      <span className="tabular-nums text-slate-500">{counts[f as keyof typeof counts].toLocaleString()}</span>
    </button>
  )

  return (
    <section id="bulk-section" className="py-12 scroll-mt-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_EXPO }}
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/70 to-slate-950/80 backdrop-blur-2xl shadow-glass-lux"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/80 to-transparent" />
          <div className="p-6 md:p-8 border-b border-white/[0.06] flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-platinum-500">Bulk hunt</p>
              <h3 className="mt-1 text-xl md:text-[1.65rem] font-bold tracking-tight text-white">Scan a CSV or Excel of indicators</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xl">
                One IP / domain / URL / hash per cell or line — extra columns (dates, notes) are ignored.
              </p>
              {quota && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wider text-platinum-500">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                    {quota.remaining} of {quota.dailyLimit} {quota.tier === 'pro' ? 'Pro' : 'free'} scans left today
                  </span>
                  <span className="text-slate-600">resets 00:00 UTC · up to {quota.maxRows.toLocaleString()} indicators / run</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bulk hunt"
              className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 md:p-8">
            <AnimatePresence mode="wait" initial={false}>
              {phase === 'input' && (
                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_EXPO }}>
                  <label htmlFor="bulk-paste" className="block mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Paste indicators, load a file or drag one in</label>
                  {/* Drop zone wraps the textarea: dropping anywhere on it (or
                      the paste area) feeds the same handleFile as the picker. */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragging(false)
                      void handleFile(e.dataTransfer.files?.[0])
                    }}
                    className={`relative rounded-xl transition-colors ${dragging ? 'ring-2 ring-red-500/70' : ''}`}
                  >
                    <textarea
                      id="bulk-paste"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={8}
                      spellCheck={false}
                      placeholder={'Paste indicators to hunt…'}
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 resize-y shadow-inner"
                    />
                    {dragging && (
                      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-950/80 text-sm font-semibold uppercase tracking-widest text-red-300">
                        Drop CSV / Excel / TXT
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = '' }} />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-transparent px-4 py-3 text-[13px] font-semibold tracking-[0.06em] text-platinum-300 transition-all hover:border-white/20 hover:text-white active:translate-y-px cursor-pointer"
                    >
                      <Upload size={15} strokeWidth={2.5} /> CSV / Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => void start()}
                      disabled={!text.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-6 py-3 text-[13px] font-semibold tracking-[0.06em] text-white transition-all hover:bg-red-400 active:translate-y-px shadow-glow-red disabled:opacity-40 disabled:hover:bg-red-500 cursor-pointer"
                    >
                      <Bug size={15} strokeWidth={2.5} /> Scan pasted list
                    </button>
                  </div>
                </motion.div>
              )}

              {phase === 'running' && (
                <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_EXPO }}>
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-300">
                      Scanning {progress.done.toLocaleString()} / {progress.total.toLocaleString()}…
                    </span>
                    <button
                      type="button"
                      onClick={() => { abortRef.current = true }}
                      className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      Stop
                    </button>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-6">
                    <div className="h-full rounded-full bg-red-500 transition-all duration-300" style={{ width: `${pct}%` }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
                  </div>
                  <p className="mb-4 text-xs text-slate-500">The first row downloads the live feed (once per session); after that rows resolve almost instantly. Verdicts appear as they land — Stop keeps what is already scanned.</p>
                  <ul className="divide-y divide-white/[0.05] max-h-[320px] overflow-y-auto">
                    {results.slice(0, 50).map((r) => {
                      const s = STATUS_META[r.status]
                      return (
                        <li key={r.value} className="flex items-center gap-3 py-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200" title={r.error || r.value}>{r.value}</span>
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                </motion.div>
              )}

              {phase === 'done' && (
                <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_EXPO }}>
                  <div className="flex flex-wrap items-center gap-2 mb-5">
                    {FILTERS.map(filterChip)}
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-platinum-200 transition-colors hover:border-white/20 hover:text-white cursor-pointer"
                    >
                      <Download size={13} /> Download CSV
                    </button>
                  </div>

                  <ul className="divide-y divide-white/[0.05] max-h-[560px] overflow-y-auto">
                    {visible.map((r) => {
                      const s = STATUS_META[r.status]
                      const flagged = r.status === 'malicious' ? labelSources(r.sources) : []
                      return (
                        <li key={r.value} className="flex items-center gap-3 py-2.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200" title={r.error || r.value}>{r.value}</span>
                          {r.type !== 'IP Address' && <span className="hidden lg:inline shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-600">{r.type}</span>}
                          {r.status === 'malicious' && (
                            <span className="hidden md:inline shrink-0 text-[10px] font-medium text-platinum-500 truncate max-w-[16rem]" title={flagged.join(', ')}>
                              {flagged.slice(0, 3).join(', ')}{flagged.length > 3 ? ` +${flagged.length - 3}` : ''}
                            </span>
                          )}
                          {r.matchedCidr && <span className="hidden xl:inline shrink-0 font-mono text-[10px] text-rose-300/80" title={`Inside listed subnet ${r.matchedCidr}`}>{r.matchedCidr}</span>}
                          {r.status === 'disputed' && r.disputeCount >= 3 && <span className="shrink-0 text-[10px] font-medium text-amber-400/80 tabular-nums">{r.disputeCount} disputes</span>}
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {shown.length > limit && (
                    <button
                      type="button"
                      onClick={() => setLimit((v) => v + PAGE_ROWS)}
                      className="mt-3 text-xs font-bold uppercase tracking-wider text-platinum-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Show {Math.min(PAGE_ROWS, shown.length - limit).toLocaleString()} more ({(shown.length - limit).toLocaleString()} hidden)
                    </button>
                  )}
                  {shown.length === 0 && (
                    <p className="py-6 text-center text-sm text-slate-500">No {filter === 'all' ? 'results' : STATUS_META[filter].label.toLowerCase()} rows.</p>
                  )}
                  <div className="mt-6 pt-5 border-t border-white/[0.06] flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setPhase('input'); setResults([]) }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-3 text-[13px] font-semibold tracking-[0.06em] text-platinum-300 transition-all hover:border-white/20 hover:text-white cursor-pointer"
                    >
                      <ShieldCheck size={15} /> New bulk scan
                    </button>
                  </div>
                </motion.div>
              )}

              {phase === 'quota' && (
                <motion.div key="quota" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE_EXPO }}>
                  <div className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-8 text-center">
                    <span className="icon-chip mx-auto h-10 w-10"><Lock size={18} /></span>
                    <h3 className="mt-4 text-lg font-bold text-white">
                      {quota?.tier === 'pro' ? 'You’ve used all your bulk scans today' : 'That’s today’s free bulk scan'}
                    </h3>
                    <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                      {quota?.tier === 'pro'
                        ? `Pro includes ${quota?.dailyLimit ?? BULK_PRO_DAILY} bulk scans a day. Yours resets at 00:00 UTC.`
                        : `Free accounts get 1 bulk scan a day (up to ${BULK_FREE_ROWS.toLocaleString()} indicators). Pro raises it to ${BULK_PRO_DAILY} scans a day and the full ${BULK_MAX_ROWS.toLocaleString()} indicators per run.`}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      {quota?.tier !== 'pro' && (
                        <Link to="/pricing" className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-[13px] font-semibold tracking-[0.06em] text-white transition-all hover:bg-red-400 active:translate-y-px shadow-glow-red cursor-pointer">
                          See Pro
                        </Link>
                      )}
                      <button type="button" onClick={() => setPhase('input')} className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-[13px] font-semibold text-platinum-300 transition-all hover:border-white/20 hover:text-white cursor-pointer">
                        Back
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
