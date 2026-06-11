'use client'
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { cn } from '@/lib/utils'
import { Menu, X, ChevronRight, Shield, Server, Database, Lock, Network, Cloud, Activity, Globe, Search } from 'lucide-react'
import { useScroll, motion } from 'framer-motion'

export function HeroSection({ scanInput, setScanInput, handleScan }: any) {
    return (
        <>
            <HeroHeader />
            <main className="overflow-x-hidden pt-12">
                <section className="relative">
                    <div className="py-24 md:pb-32 lg:pb-36 lg:pt-32 relative">
                        <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12">
                            <div className="mx-auto max-w-2xl text-center lg:ml-0 lg:max-w-full lg:text-left">
                                <h1 className="mt-8 max-w-3xl text-balance text-5xl md:text-6xl font-semibold tracking-tight text-foreground lg:mt-16 xl:text-7xl">
                                    Enterprise Threat Intelligence
                                </h1>
                                <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
                                    A highly customizable, real-time database of malicious IPs, domains, and signatures to secure your infrastructure against emerging global threats.
                                </p>

                                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
                                    <div className="relative w-full max-w-md flex items-center">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                        <input 
                                            type="text" 
                                            placeholder="Scan IP, Domain, Hash (e.g. 223.252.176.131)" 
                                            className="h-12 w-full rounded-full border border-input bg-background pl-10 pr-32 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            value={scanInput}
                                            onChange={(e) => setScanInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                                        />
                                        <Button
                                            size="sm"
                                            className="absolute right-1 top-1 bottom-1 h-10 rounded-full px-6"
                                            onClick={handleScan}
                                        >
                                            Scan
                                        </Button>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="lg"
                                        className="h-12 rounded-full px-5 text-base"
                                        asChild
                                    >
                                        <a href="#feeds">Browse Feeds</a>
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="aspect-[2/3] absolute inset-1 overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
                            <img
                                className="size-full object-cover opacity-20 dark:opacity-40 pointer-events-none"
                                src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2070" 
                                alt="Server Infrastructure" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background to-background/20 lg:bg-gradient-to-r lg:from-background lg:to-background/20" />
                        </div>
                    </div>
                </section>
                <section className="bg-background pb-2 pt-12">
                    <div className="group relative m-auto max-w-7xl px-6">
                        <div className="flex flex-col items-center md:flex-row">
                            <div className="md:max-w-44 md:border-r md:pr-6 mb-6 md:mb-0">
                                <p className="text-center md:text-end text-sm text-muted-foreground font-medium">Trusted integrations</p>
                            </div>
                            <div className="relative py-6 md:w-[calc(100%-11rem)] overflow-hidden">
                                <InfiniteSlider
                                    speedOnHover={20}
                                    speed={40}
                                    gap={64}>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Shield size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">Firewalls</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Server size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">SIEM</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Database size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">Logstash</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Lock size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">EDR</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Network size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">DNS Sinkhole</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Cloud size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">Cloud WAF</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Activity size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">SOAR</span></div>
                                    <div className="flex items-center gap-2 text-muted-foreground"><Globe size={24}/> <span className="font-semibold tracking-wide uppercase text-sm">Proxies</span></div>
                                </InfiniteSlider>

                                <div className="bg-gradient-to-r from-background absolute inset-y-0 left-0 w-20 z-10 pointer-events-none"></div>
                                <div className="bg-gradient-to-l from-background absolute inset-y-0 right-0 w-20 z-10 pointer-events-none"></div>
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
    const { scrollYProgress } = useScroll()

    React.useEffect(() => {
        const unsubscribe = scrollYProgress.on('change', (latest) => {
            setScrolled(latest > 0.05)
        })
        return () => unsubscribe()
    }, [scrollYProgress])

    return (
        <header>
            <nav
                data-state={menuState && 'active'}
                className="group fixed z-50 w-full pt-2">
                <div className={cn('mx-auto max-w-7xl rounded-3xl px-6 transition-all duration-300 lg:px-12', scrolled && 'bg-background/80 backdrop-blur-2xl border shadow-sm')}>
                    <motion.div
                        className={cn('relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6', scrolled && 'lg:py-4')}>
                        <div className="flex w-full items-center justify-between gap-12 lg:w-auto">
                            <a
                                href="/"
                                aria-label="home"
                                className="flex items-center space-x-2 font-bold text-xl text-black dark:text-white">
                                Himalaya<span className="text-red-600">Feed</span>
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
                                                className="text-muted-foreground hover:text-foreground block duration-150">
                                                <span>{item.name}</span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                            <div className="lg:hidden">
                                <ul className="space-y-6 text-base font-medium">
                                    {menuItems.map((item, index) => (
                                        <li key={index}>
                                            <a
                                                href={item.href}
                                                onClick={() => setMenuState(false)}
                                                className="text-muted-foreground hover:text-foreground block duration-150">
                                                <span>{item.name}</span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                <Button
                                    asChild
                                    variant="outline"
                                    size="sm">
                                    <a href="https://github.com/kalidada18/himalayafeed" target="_blank" rel="noopener">
                                        <span>GitHub</span>
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </nav>
        </header>
    )
}
