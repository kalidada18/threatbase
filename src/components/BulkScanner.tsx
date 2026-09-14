import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Bug, Upload, Download, X } from 'lucide-react'
import { EASE_EXPO } from './motion/primitives'
import { parseBulkInput, runBulkScan, bulkToCsv, BULK_MAX_ROWS, type BulkRow } from '../lib/bulkScan'
import { labelSources } from './sourceLabels'

/**
 * Bulk IOC hunt: paste or load a CSV/TXT of indicators, scan them all against
 * the same client-side engine as the single Hunt (one feed download, then
 * ~sub-ms binary searches), and export the verdicts back as CSV.
 * The ledger idiom is borrowed from FeedHealth's <ul divide-y> + status dots.
 */

const STATUS_META: Record<string, { label: string; dot: string; cls: string }> = {
  malicious: { label: 'Threat', dot: 'bg-red-400', cls: 'text-red-400' },
  clean: { label: 'Clean', dot: 'bg-emerald-400', cls: 'text-emerald-400' },
  disputed: { label: 'Disputed', dot: 'bg-amber-400', cls: 'text-amber-400' },
  error: { label: 'Error', dot: 'bg-slate-500', cls: 'text-slate-400' },
}

const PREVIEW_ROWS = 100

export default function BulkScanner({ feedVersion, statsData, addToast, onClose }: any) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'input' | 'running' | 'done'>('input')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<BulkRow[]>([])
  const [showAll, setShowAll] = useState(false)
  const abortRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = phase === 'input' && text.trim() ? parseBulkInput(text) : null

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setText(await file.text())
    } catch {
      addToast('Could not read that file.', 'error')
    }
  }

  const start = async () => {
    const p = parseBulkInput(text)
    if (p.valid.length === 0) return addToast('No valid indicators found in that input.', 'error')
    if (p.invalid.length > 0) addToast(`Skipped ${p.invalid.length} invalid row${p.invalid.length === 1 ? '' : 's'}.`, 'success')
    if (p.truncated) addToast(`Capped at ${BULK_MAX_ROWS} rows. Split larger lists into multiple files.`, 'error')
    abortRef.current = false
    setPhase('running')
    setShowAll(false)
    setResults([])
    setProgress({ done: 0, total: p.valid.length })

    const rows = await runBulkScan(
      p.valid,
      feedVersion,
      statsData,
      (done, total) => { setProgress({ done, total }) },
      () => abortRef.current,
    )
    setResults(rows)
    setPhase('done')
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
  const visible = showAll ? ranked : ranked.slice(0, PREVIEW_ROWS)
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

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
              <h3 className="mt-1 text-xl md:text-[1.65rem] font-bold tracking-tight text-white">Scan a CSV of indicators</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xl">
                One IP (or domain / URL / hash) per line — extra columns are ignored. Up to {BULK_MAX_ROWS.toLocaleString()} rows per run.
              </p>
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
                  <label htmlFor="bulk-paste" className="block mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-platinum-500">Paste indicators or load a file</label>
                  <textarea
                    id="bulk-paste"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    placeholder={'45.9.148.102\n185.220.101.1\nhxxp://evil[.]com/path  ← defanged forms are refanged too\nmalicious-domain.xyz,2026-09-01'}
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 resize-y shadow-inner"
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-transparent px-4 py-3 text-[13px] font-semibold tracking-[0.06em] text-platinum-300 transition-all hover:border-white/20 hover:text-white active:translate-y-px cursor-pointer"
                    >
                      <Upload size={15} strokeWidth={2.5} /> Load CSV / TXT
                    </button>
                    <button
                      type="button"
                      onClick={start}
                      disabled={!parsed || parsed.valid.length === 0}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-6 py-3 text-[13px] font-semibold tracking-[0.06em] text-white transition-all hover:bg-red-400 active:translate-y-px shadow-glow-red disabled:opacity-40 disabled:hover:bg-red-500 cursor-pointer"
                    >
                      <Bug size={15} strokeWidth={2.5} /> Scan {parsed && parsed.valid.length > 0 ? `${parsed.valid.length.toLocaleString()}` : ''}
                    </button>
                    {parsed && (parsed.invalid.length > 0 || parsed.truncated) && (
                      <span className="text-xs font-medium text-slate-500">
                        {parsed.invalid.length > 0 && `${parsed.invalid.length} invalid row${parsed.invalid.length === 1 ? '' : 's'} will be skipped`}
                        {parsed.invalid.length > 0 && parsed.truncated && ' · '}
                        {parsed.truncated && `over ${BULK_MAX_ROWS.toLocaleString()} rows will be cut`}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

              {phase === 'running' && (
                <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_EXPO }} className="py-8">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-300" role="status">
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
                  <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-red-500 transition-all duration-300" style={{ width: `${pct}%` }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">The first row downloads the live feed (~50 MB, once per session); after that rows resolve almost instantly.</p>
                </motion.div>
              )}

              {phase === 'done' && (
                <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_EXPO }}>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-5 text-xs font-semibold uppercase tracking-[0.14em] tabular-nums">
                    <span className="flex items-center gap-1.5 text-red-400"><span className="h-2 w-2 rounded-full bg-red-400" />{counts.malicious} threats</span>
                    {counts.disputed > 0 && <span className="flex items-center gap-1.5 text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-400" />{counts.disputed} disputed</span>}
                    <span className="flex items-center gap-1.5 text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400" />{counts.clean} clean</span>
                    {counts.error > 0 && <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2 w-2 rounded-full bg-slate-500" />{counts.error} errors</span>}
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-platinum-200 normal-case transition-colors hover:border-white/20 hover:text-white cursor-pointer"
                    >
                      <Download size={13} /> Download CSV
                    </button>
                  </div>

                  <ul className="divide-y divide-white/[0.05] max-h-[520px] overflow-y-auto">
                    {visible.map((r) => {
                      const s = STATUS_META[r.status]
                      const flagged = r.status === 'malicious' ? labelSources(r.sources).slice(0, 3) : []
                      return (
                        <li key={r.value} className="flex items-center gap-3 py-2.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200" title={r.error || r.value}>{r.value}</span>
                          {flagged.length > 0 && (
                            <span className="hidden md:inline shrink-0 text-[10px] font-medium text-platinum-500 truncate max-w-[14rem]" title={labelSources(r.sources).join(', ')}>
                              {flagged.join(', ')}{r.sources.length > 3 ? ` +${labelSources(r.sources).length - 3}` : ''}
                            </span>
                          )}
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {ranked.length > PREVIEW_ROWS && (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-3 text-xs font-bold uppercase tracking-wider text-platinum-300 hover:text-white transition-colors cursor-pointer"
                    >
                      {showAll ? 'Show less' : `Show all ${ranked.length.toLocaleString()} rows`}
                    </button>
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
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
