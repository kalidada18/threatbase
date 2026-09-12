import { motion, type Variants } from 'framer-motion'
import { FANOUT_ORDER, SourceTile, type RosterTile } from './SourceRoster'
import { labelSource } from './labels'

const consoleContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}
const consoleRow: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 28 } },
}

/** The live-investigation loading screen: the real fan-out roster as honestly
 *  PENDING tiles, staggered in, with a ruby scan-line sweeping the card. It
 *  never fakes completions — real states arrive only from d.evidence once the
 *  dossier lands. Cache hits (~100 ms) flash it briefly; that's honest. */
export default function InvestigationConsole({ q }: { q: string }) {
  const pending: RosterTile[] = FANOUT_ORDER.map((k) => ({ key: k, name: labelSource(k), state: 'pending' }))
  return (
    <div className="relative max-w-3xl mx-auto glass-card rounded-2xl p-5 overflow-hidden" aria-busy="true" aria-label="Investigating">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-platinum-500 mb-1">Deep Investigation</div>
      <div className="font-mono text-sm text-white break-all mb-4">{q}</div>
      <motion.ul
        variants={consoleContainer}
        initial="hidden"
        animate="show"
        className="flex flex-wrap gap-1.5"
      >
        {pending.map((t) => (
          <motion.li key={t.key} variants={consoleRow} className="flex">
            <SourceTile tile={t} />
          </motion.li>
        ))}
      </motion.ul>
      {/* ruby scan-line: the only motion that says "working" — reads, not lies */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 h-px bg-red-500/40"
        initial={{ top: 0, opacity: 0 }}
        animate={{ top: ['0%', '100%', '0%'], opacity: [0, 1, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
      />
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">querying intel sources</p>
    </div>
  )
}
