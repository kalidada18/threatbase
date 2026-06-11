'use client'
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { cn } from '@/lib/utils'
import ThreatMap from '../ThreatMap'
import { Menu, X, ChevronRight, Shield, Server, Database, Lock, Network, Cloud, Activity, Globe, Search, Flame, MailX, GlobeLock, Bug, ShieldAlert, ShieldBan, Zap, Key, Crosshair, ShieldCheck, Binary, Snowflake, Github } from 'lucide-react'
import { useScroll, motion, useMotionValueEvent } from 'framer-motion'

export function HeroSection({ scanInput, setScanInput, handleScan, statsData }: any) {
    return (
        <>
            <main className="relative overflow-hidden w-full min-h-[90vh] bg-slate-900 border-b border-white/10 shadow-2xl">
                <ThreatMap />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900 pointer-events-none z-0" />
                <section className="relative z-10 pt-16 md:pt-20">
                    <div className="py-12 md:pb-24 lg:pb-32 lg:pt-16 relative">
                        <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12">
                            <div className="mx-auto max-w-2xl text-center lg:ml-0 lg:max-w-full lg:text-left relative">
                                <div className="relative z-10">
                                    <h1 className="mt-8 max-w-3xl text-balance text-4xl md:text-5xl font-bold tracking-tight text-white lg:mt-12 xl:text-6xl drop-shadow-md">
                                        Built for Defenders <span className="block text-white/90 font-semibold mt-1">Powered by Open Intelligence</span>
                                    </h1>
                                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 drop-shadow">
                                        Access real-time threat data and indicators to proactively identify, investigate, and respond to cyber threats.
                                    </p>

                                    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
                                        <div className="relative w-full max-w-md flex items-center">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input 
                                                type="text" 
                                                placeholder="Scan IP, Domain, Hash (e.g. 223.252.176.131)" 
                                                className="h-14 w-full rounded-full border border-white/10 bg-slate-900/60 backdrop-blur-xl pl-12 pr-32 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-cyan-500/50 focus-visible:ring-1 focus-visible:ring-cyan-500/50 transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                                                value={scanInput}
                                                onChange={(e) => setScanInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                                            />
                                            <Button
                                                size="sm"
                                                className="absolute right-1.5 top-1.5 bottom-1.5 h-11 rounded-full px-7 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all border border-cyan-400/20"
                                                onClick={handleScan}
                                            >
                                                Scan
                                            </Button>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="lg"
                                            className="h-14 rounded-full px-8 text-base border-white/10 bg-slate-900/50 backdrop-blur-md text-slate-200 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300"
                                            asChild
                                        >
                                            <a href="#feeds">Browse Feeds</a>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                <section className="bg-white/30 dark:bg-slate-900/40 backdrop-blur-md border-y border-white/20 dark:border-white/10 pb-2 pt-12">
                    <div className="group relative m-auto max-w-7xl px-6">
                        <div className="flex flex-col items-center md:flex-row">
                            <div className="md:max-w-44 md:border-r md:pr-6 mb-6 md:mb-0">
                                <p className="text-center md:text-end text-sm text-slate-400 font-bold tracking-wider uppercase">Intelligence Sources</p>
                            </div>
                            <div className="relative py-6 md:w-[calc(100%-11rem)] overflow-hidden">
                                {(() => {
                                    const rawSources = statsData?.ips_per_source ? Object.keys(statsData.ips_per_source) : []
                                    const sources = rawSources.length > 0 
                                        ? rawSources.slice(0, 20)
                                        : []
                                        
                                    const fallbackSources = ['Honeypots', 'Dark Web', 'Malware Analysis', 'Sinkholes', 'OSINT', 'Sandboxes', 'Cloud Sensors', 'Spam Traps']
                                    const fallbackIcons = [Shield, Server, Database, Lock, Network, Cloud, Activity, Globe]
                                    
                                    const getSourceIcon = (sourceName: string) => {
                                        const s = sourceName.toLowerCase();
                                        if (s.includes('firehol')) return Flame;
                                        if (s.includes('spamhaus')) return MailX;
                                        if (s.includes('tor')) return GlobeLock;
                                        if (s.includes('feodo') || s.includes('bot')) return Bug;
                                        if (s.includes('abuseipdb')) return ShieldAlert;
                                        if (s.includes('blocklist_de')) return ShieldBan;
                                        if (s.includes('emerging')) return Zap;
                                        if (s.includes('bruteforce')) return Key;
                                        if (s.includes('cins')) return Crosshair;
                                        if (s.includes('dshield')) return ShieldCheck;
                                        if (s.includes('binary_defense')) return Binary;
                                        if (s.includes('greensnow')) return Snowflake;
                                        return Shield;
                                    }
                                    
                                    const displayItems = sources.length > 0 
                                        ? sources.map(s => ({ name: s.replace(/_/g, ' '), icon: getSourceIcon(s) }))
                                        : fallbackSources.map((s, i) => ({ name: s, icon: fallbackIcons[i % fallbackIcons.length] }))
                                    
                                    return (
                                        <InfiniteSlider
                                            speedOnHover={20}
                                            speed={40}
                                            gap={64}>
                                            {displayItems.map((item, idx) => {
                                                const Icon = item.icon
                                                return (
                                                    <div key={idx} className="flex items-center gap-2 text-slate-400">
                                                        <Icon size={24} className="text-slate-500" /> 
                                                        <span className="font-bold tracking-wide uppercase text-sm">{item.name}</span>
                                                    </div>
                                                )
                                            })}
                                        </InfiniteSlider>
                                    )
                                })()}

                                <div className="bg-gradient-to-r from-slate-900 absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"></div>
                                <div className="bg-gradient-to-l from-slate-900 absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"></div>
                                <ProgressiveBlur
                                    className="pointer-events-none absolute left-0 top-0 h-full w-20 z-20"
                                    direction="left"
                                    blurIntensity={1}
                                />
                                <ProgressiveBlur
                                    className="pointer-events-none absolute right-0 top-0 h-full w-20 z-20"
                                    direction="right"
                                    blurIntensity={1}
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}
