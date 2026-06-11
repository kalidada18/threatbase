import React from 'react'
import { Menu, X, Github } from 'lucide-react'
import { useScroll, motion, useMotionValueEvent } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

const menuItems = [
    { name: 'Dashboard', href: '/#dashboard' },
    { name: 'Threat Feeds', href: '/#feeds' },
    { name: 'Analytics', href: '/#analytics' },
    { name: 'Report IP', href: '/report' },
]

export default function Navbar() {
    const [menuState, setMenuState] = React.useState(false)
    const [scrolled, setScrolled] = React.useState(false)
    const [hidden, setHidden] = React.useState(false)
    const { scrollY } = useScroll()

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious() || 0
        
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
                    "group fixed inset-x-0 top-0 z-50 transition-all duration-300",
                    scrolled 
                        ? "bg-slate-950/80 backdrop-blur-2xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] py-3" 
                        : "bg-transparent border-b border-transparent py-3"
                )}
            >
                <div className="mx-auto max-w-7xl px-6 lg:px-12 w-full">
                    <div className="relative flex items-center justify-between">
                        <div className="flex w-full items-center justify-between gap-10 lg:w-auto">
                            <Link
                                to="/"
                                aria-label="home"
                                className="flex items-center group relative z-10">
                                <img 
                                    src={`${import.meta.env.BASE_URL}img/himalayafeed.png`} 
                                    alt="HimalayaFeed" 
                                    className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.12] group-hover:rotate-6"
                                />
                            </Link>

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
                                            <Link
                                                to={item.href}
                                                className="text-slate-300 hover:text-white transition-all duration-300 tracking-wide font-semibold hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]">
                                                {item.name}
                                            </Link>
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
                                            <Link
                                                to={item.href}
                                                onClick={() => setMenuState(false)}
                                                className="text-slate-400 hover:text-white block transition-colors duration-150">
                                                {item.name}
                                            </Link>
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
