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
            <HeroHeader />
            <main className="relative overflow-hidden w-full min-h-[90vh] bg-slate-900 border-b border-white/10 shadow-2xl">
                <ThreatMap />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900 pointer-events-none z-0" />
                <section className="relative z-10 pt-16 md:pt-20">
                    <div className="py-12 md:pb-24 lg:pb-32 lg:pt-16 relative">
                        <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12">
                            <div className="mx-auto max-w-2xl text-center lg:ml-0 lg:max-w-full lg:text-left relative">
                                {/* Subtle radial gradient mask to improve text readability against the map dots */}
                                <div className="absolute -inset-x-10 -inset-y-10 z-0 bg-[radial-gradient(ellipse_at_center,rgba(15,23,42,0.85)_0%,rgba(15,23,42,0)_70%)] pointer-events-none lg:-inset-x-20 lg:-inset-y-20 rounded-full blur-2xl"></div>
                                
                                <div className="relative z-10">
                                    <h1 className="mt-8 max-w-4xl text-balance text-5xl md:text-6xl font-semibold tracking-tight text-white lg:mt-16 xl:text-7xl">
                                        Built for Defenders. <span className="block bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent mt-2 pb-2">Powered by Open Intelligence.</span>
                                    </h1>
                                    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
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

const menuItems = [
    { name: 'Dashboard', href: '#dashboard' },
    { name: 'Threat Feeds', href: '#feeds' },
    { name: 'Analytics', href: '#analytics' },
    { name: 'Report IP', href: '#report-ip' },
]

const HeroHeader = () => {
    const [menuState, setMenuState] = React.useState(false)
    const [scrolled, setScrolled] = React.useState(false)
    const [hidden, setHidden] = React.useState(false)
    const { scrollY } = useScroll()

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious()
        
        // Style changes when scrolled past top
        setScrolled(latest > 50)
        
        // Smart hide/reveal logic
        if (latest > previous && latest > 150) {
            setHidden(true)
        } else {
            setHidden(false)
        }
    })

    return (
        <header>
            <motion.nav
                variants={{
                    visible: { y: 0 },
                    hidden: { y: "-100%" }
                }}
                animate={hidden ? "hidden" : "visible"}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                data-state={menuState && 'active'}
                className={cn(
                    "group fixed inset-x-0 top-0 z-50 transition-all duration-500 border-b",
                    scrolled 
                        ? "bg-slate-950/60 backdrop-blur-2xl border-white/5 shadow-2xl py-3" 
                        : "bg-transparent border-transparent py-6"
                )}
            >
                <div className="mx-auto max-w-7xl px-6 lg:px-12">
                    <div className="relative flex items-center justify-between">
                        <div className="flex w-full items-center justify-between gap-10 lg:w-auto">
                            <a
                                href="/"
                                aria-label="home"
                                className="flex items-center font-bold text-2xl text-white tracking-tighter drop-shadow-md">
                                Himalaya<span className="text-red-500">Feed</span>
                            </a>

                            <button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden text-foreground">
                                <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>

                            <div className="hidden lg:block">
                                <ul className="flex gap-8 text-sm font-medium">
                                    {menuItems.map((item, index) => (
                                        <li key={index}>
                                            <a
                                                href={item.href}
                                                className="text-slate-300 hover:text-white transition-all duration-300 tracking-wide hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]">
                                                {item.name}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl p-6 shadow-2xl md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
                            <div className="lg:hidden">
                                <ul className="space-y-6 text-base font-medium">
                                    {menuItems.map((item, index) => (
                                        <li key={index}>
                                            <a
                                                href={item.href}
                                                onClick={() => setMenuState(false)}
                                                className="text-slate-400 hover:text-white block transition-colors duration-150">
                                                {item.name}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                <Button
                                    asChild
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 hover:text-white rounded-full px-6 h-10 transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] gap-2"
                                    size="sm">
                                    <a href="https://github.com/kalidada18/himalayafeed" target="_blank" rel="noopener noreferrer">
                                        <Github size={16} />
                                        GitHub
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.nav>
        </header>
    )
}
