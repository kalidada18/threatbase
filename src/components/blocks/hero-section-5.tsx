'use client'
import { motion } from 'framer-motion'
import ThreatMap from '../ThreatMap'
import { ChevronRight, Search } from 'lucide-react'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
}

export function HeroSection({ scanInput, setScanInput, handleScan }: any) {
    return (
            <div className="relative overflow-hidden w-full min-h-[100dvh] bg-app flex items-center">
                <ThreatMap />
                <div className="absolute inset-0 bg-gradient-to-b from-[#080b12]/10 via-[#080b12]/30 to-[#080b12] pointer-events-none z-0" />

                {/* pointer-events-none lets drag/hover pass through to the map
                    canvas behind it; interactive controls below re-enable events. */}
                <section className="relative z-10 w-full pt-24 pb-20 lg:pb-28 pointer-events-none">
                    <motion.div
                      /* max-w + padding mirror layout/Container so the headline shares
                         one optical left edge with every section heading below it. */
                      className="relative mx-auto flex max-w-7xl flex-col px-6 lg:px-12"
                      variants={stagger}
                      initial="hidden"
                      animate="show"
                    >
                        {/* Fully left-aligned — DESIGN_VARIANCE=8 means no centering */}
                        <div className="max-w-2xl lg:max-w-3xl text-left">

                            <motion.h1
                              variants={fadeUp}
                              className="text-balance font-display text-[2.6rem] leading-[1.04] sm:text-5xl md:text-6xl xl:text-7xl font-bold tracking-tight text-white"
                            >
                                Built for defenders.
                                <span className="block text-red-500">Powered by open intelligence.</span>
                            </motion.h1>

                            <motion.p
                              variants={fadeUp}
                              className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-slate-300/90"
                            >
                                Scan IPs, domains, and hashes against millions of live IOCs. Deploy blocklists instantly.
                            </motion.p>

                            <motion.div
                              variants={fadeUp}
                              className="mt-9 flex flex-col items-start gap-3.5 sm:flex-row w-full"
                            >
                                <div className="relative w-full max-w-md flex items-center group/search pointer-events-auto">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={18} />
                                    <input
                                        type="text"
                                        aria-label="Scan an IP, domain, URL, or hash"
                                        placeholder="Scan IP, domain, URL, or hash…"
                                        className="hero-scan-input h-14 w-full rounded-full border border-white/10 bg-slate-950/70 backdrop-blur-xl pl-12 pr-[6.5rem] text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-red-500/50 focus-visible:ring-2 focus-visible:ring-red-500/30 transition-all shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]"
                                        value={scanInput}
                                        onChange={(e) => setScanInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                                    />
                                    {/* Scan-line effect */}
                                    <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none opacity-0 group-focus-within/search:opacity-100 transition-opacity">
                                        <div className="scan-line absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent motion-reduce:hidden" />
                                    </div>
                                    <button
                                        id="scan-btn"
                                        type="button"
                                        className="absolute right-1.5 top-1.5 bottom-1.5 inline-flex items-center justify-center rounded-full px-6 sm:px-7 bg-red-500 hover:bg-red-400 text-white text-sm font-semibold shadow-glow-red transition-all duration-200 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                                        onClick={handleScan}
                                    >
                                        Scan
                                    </button>
                                </div>
                                <a
                                    href="#feeds"
                                    className="pointer-events-auto inline-flex h-14 items-center justify-center rounded-full px-7 text-sm font-semibold border border-white/10 bg-white/[0.04] backdrop-blur-md text-slate-200 hover:bg-white/[0.08] hover:text-white hover:border-white/20 transition-all duration-200 active:scale-[0.98] cursor-pointer"
                                >
                                    Browse feeds
                                    <ChevronRight size={16} className="ml-0.5" />
                                </a>
                            </motion.div>
                        </div>
                    </motion.div>
                </section>
            </div>
    )
}
