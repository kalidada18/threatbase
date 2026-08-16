import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useSEO } from '@/useSEO'

export default function TermsPage() {
  const prefersReducedMotion = useReducedMotion()

  useSEO({
    title: 'Terms and Conditions | Threatbase',
    description: 'Terms and Conditions for Threatbase.',
    path: '/terms',
  })

  return (
    <main className="min-h-[100dvh] bg-[#050505] font-sans text-slate-300 selection:bg-red-500/30 pt-32 pb-32">
      <div className="mx-auto max-w-4xl px-6 lg:px-12 relative z-10">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1 text-[10px] font-bold tracking-widest text-red-400 uppercase">
            Legal Information
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white leading-[0.95] mb-6">
            Terms & Conditions.
          </h1>
          <p className="text-sm font-mono text-slate-500 mb-16 border-b border-white/5 pb-8">
            Effective Date: June 12, 2026
          </p>

          <div className="space-y-16 text-slate-400 leading-relaxed text-base md:text-lg max-w-[65ch]">
            
            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                1. Acceptance of Terms
              </h3>
              <p>By accessing or using Threatbase, you agree to be bound by these Terms and Conditions. If you do not agree, you must not use the Service.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                2. Description of Service
              </h3>
              <p>Threatbase is a free threat intelligence platform providing access to threat feeds, indicators of compromise (IOCs), and related security data. The Service is provided "as is" for informational, research, and defensive security purposes only.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                3. User Responsibilities
              </h3>
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span>You must comply with all applicable laws and regulations.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span>You may not use the Service for malicious purposes, to distribute malware, or to conduct unauthorized attacks.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span>You agree not to excessively scrape data, overload the Service, or attempt to reverse-engineer it.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span>Any contact information you provide must be accurate.</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                4. Intellectual Property
              </h3>
              <p>All content on the Site, unless otherwise noted, belongs to or is licensed to the operator of Threatbase. You may use the data feeds for personal, research, or internal security purposes, provided you give appropriate attribution where required and respect any source-specific licenses.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                5. Disclaimers & Liability
              </h3>
              <ul className="space-y-4">
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>The Service is provided <strong className="text-white">"AS IS"</strong> without any warranties.</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>Threat intelligence data may contain inaccuracies or delays. You use the Service entirely at your own risk.</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>In no event shall the operator be liable for any damages arising from your use of the Service.</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>The Site may contain links to third-party websites; we are not responsible for their content or practices.</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                6. Termination
              </h3>
              <p>We reserve the right to restrict or block access to the Service at any time, without notice, for any reason.</p>
            </section>

          </div>
        </motion.div>
      </div>
    </main>
  )
}
