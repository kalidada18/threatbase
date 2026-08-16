import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useSEO } from '@/useSEO'

export default function PrivacyPage() {
  const prefersReducedMotion = useReducedMotion()

  useSEO({
    title: 'Privacy Policy | Threatbase',
    description: 'Privacy Policy for Threatbase.',
    path: '/privacy',
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
            Privacy Policy.
          </h1>
          <p className="text-sm font-mono text-slate-500 mb-16 border-b border-white/5 pb-8">
            Effective Date: June 12, 2026
          </p>

          <div className="space-y-16 text-slate-400 leading-relaxed text-base md:text-lg max-w-[65ch]">
            
            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                1. Introduction
              </h3>
              <p>This Privacy Policy explains how we collect, use, and protect information when you visit Threatbase.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                2. Information We Collect
              </h3>
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span><strong className="text-white font-semibold">Automatically Collected Data</strong>: We (or our hosting provider) may collect standard server logs such as IP address, browser type, operating system, access times, and referring pages.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span><strong className="text-white font-semibold">No User Accounts</strong>: The Service does not require registration or login to view data. Authenticaton may be used via trusted third-party providers (like Google) for submitting data, but we do not store sensitive personal passwords.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span><strong className="text-white font-semibold">Threat Data</strong>: Feeds and IOCs are publicly available security indicators and generally do not contain personal information.</span>
                </li>
              </ul>
              <p className="mt-6 text-slate-500">We do not intentionally collect personal data such as names or private email addresses.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                3. How We Use Information
              </h3>
              <ul className="space-y-4">
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>To operate, maintain, and improve the Service.</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>For security monitoring and analytics.</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>We do not sell or rent personal data to third parties.</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                4. Cookies and Tracking
              </h3>
              <p>The Site may use minimal cookies or local storage for basic functionality. We do not use extensive tracking or advertising cookies.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                5. Data Sharing
              </h3>
              <ul className="space-y-4">
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>Data may be disclosed if required by law or to protect the Service.</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>Threat intelligence data is publicly accessible as part of the feed.</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                6. Third-Party Services
              </h3>
              <p>The Site may link to or rely on third-party services (e.g., GitHub, Supabase). Their privacy practices are governed by their own policies.</p>
            </section>

          </div>
        </motion.div>
      </div>
    </main>
  )
}
