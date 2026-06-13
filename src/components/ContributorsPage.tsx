import React from 'react'
import { motion } from 'framer-motion'
import Leaderboard from './Leaderboard'
import { useSEO } from '../useSEO'
import { MatrixText } from '@/components/ui/matrix-text'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import AnoAI from '@/components/ui/animated-shader-background'

export default function ContributorsPage() {
  useSEO({
    title: 'Top Contributors — Threatbase Community Intel',
    description: 'View the top contributors who are defending networks globally by reporting threats.',
    path: '/contributors',
  })

  return (
    <main className="bg-[#0B0F19] min-h-screen">
      <div className="pt-28 pb-24 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay pointer-events-none z-10"></div>
        <div className="absolute inset-0 z-0 opacity-80 mix-blend-screen">
          <AnoAI />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F19]/20 via-[#0B0F19]/60 to-[#0B0F19] z-0 pointer-events-none"></div>

        <div className="mx-auto max-w-4xl px-4 lg:px-8 relative z-10 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center relative"
          >
            <h1 className="text-4xl md:text-5xl font-black flex items-center justify-center gap-2 text-white tracking-tighter pb-2">
              <span className="text-liquid-red drop-shadow-md">Top Contributors</span>
            </h1>
            <p className="mt-2 text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              Recognizing the community leaders who help defend networks globally.
            </p>
          </motion.div>

          <Card className="relative z-10 shadow-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-[40px] overflow-hidden rounded-2xl">
            <CardHeader className="pb-6 pt-6 px-6 border-b border-white/[0.05] bg-gradient-to-r from-white/[0.02] to-transparent">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-400 drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]">
                  <img src={`${import.meta.env.BASE_URL}img/community.png`} alt="Community Icon" className="w-10 h-10 object-contain drop-shadow-md" />
                </div>
                <div>
                  <CardTitle className="text-[22px] font-bold text-white tracking-wide drop-shadow-sm">Leaderboard</CardTitle>
                  <CardDescription className="text-slate-400 mt-0.5">Global threat intelligence leaders</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <div className="px-6 pb-6">
                <Leaderboard />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
