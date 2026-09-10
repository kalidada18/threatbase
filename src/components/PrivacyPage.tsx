import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useSEO } from '@/useSEO'

export default function PrivacyPage() {
  const prefersReducedMotion = useReducedMotion()

  useSEO({
    title: 'Privacy Policy | Threatbase',
    description: 'How Threatbase handles your data: optional accounts for reporting, what the browser stores, security cookies, and why the IP feeds contain only public threat intelligence.',
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
                  <span><strong className="text-white font-semibold">Optional Accounts</strong>: Browsing the feeds and the scanner requires no account. An optional account (email, or Google/GitHub sign-in, with multi-factor support) exists only for submitting reports and appearing on the leaderboard. Your auth session token is stored in this browser's local storage; account details are processed by our backend provider, Supabase.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-red-500" aria-hidden="true" />
                  <span><strong className="text-white font-semibold">Threat Data</strong>: Feeds and IOCs are publicly available security indicators and generally do not contain personal information.</span>
                </li>
              </ul>
              <p className="mt-6 text-slate-500">Apart from the optional account email above, we do not collect personal data such as names or private contact details.</p>
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
                  <span>To protect the Service against abuse (bot verification and rate limiting).</span>
                </li>
                <li className="flex items-center gap-4">
                  <div className="h-1 w-1 bg-red-500 rounded-full shrink-0" />
                  <span>We do not sell or rent personal data to third parties.</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                4. Storage and Cookies
              </h3>
              <p className="mb-4">The following is what this site actually stores in your browser and device. All of it is first-party and strictly necessary for the features described:</p>
              <ul className="space-y-3 list-disc pl-6 text-base md:text-lg">
                <li><strong className="text-white font-semibold">Recent hunts</strong> (localStorage key <code className="font-mono text-sm">tb:recent</code>) — your last 5 lookups, so the console can show them back to you. Cleared anytime.</li>
                <li><strong className="text-white font-semibold">Human-verification flag</strong> (sessionStorage key <code className="font-mono text-sm">human_verified</code>) — remembers the bot check for the current tab only.</li>
                <li><strong className="text-white font-semibold">IP prefill</strong> (sessionStorage key <code className="font-mono text-sm">tb:ip_prefill</code>) — a one-shot hint used to suggest your own IP in the scanner; never sent anywhere but this page.</li>
                <li><strong className="text-white font-semibold">Login session</strong> (localStorage, <code className="font-mono text-sm">sb-*-auth-token</code>) — written only when you sign in, by our backend provider Supabase.</li>
                <li><strong className="text-white font-semibold">Security cookies</strong> — Cloudflare sets <code className="font-mono text-sm">cf_clearance</code>/<code className="font-mono text-sm">__cf_bm</code> when the Turnstile check runs, to distinguish humans from bots.</li>
              </ul>
              <p className="mt-6">We do not use tracking, analytics, or advertising cookies, so no consent banner is required.</p>
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
              <p>The Site relies on a small number of processors: Cloudflare (website hosting, edge logs, and Turnstile bot verification), Supabase (authentication and community report storage for the optional account), and GitHub (source code and the public feed mirrors). Their privacy practices are governed by their own policies.</p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                7. Your Rights &amp; Contact
              </h3>
              <p>Threatbase is operated by the Threatbase project team. You may request access to, correction of, or deletion of any personal data we hold about you — in practice, that means the email tied to an optional account — by contacting <a href="mailto:threatbasepro@gmail.com" className="text-red-400 hover:text-red-300 underline underline-offset-4">threatbasepro@gmail.com</a>. We retain account data only as long as your account exists; Cloudflare edge logs follow its standard short retention. As stated above, we do not sell or share personal data for advertising, so no “Do Not Sell” mechanism applies.</p>
            </section>

          </div>
        </motion.div>
      </div>
    </main>
  )
}
