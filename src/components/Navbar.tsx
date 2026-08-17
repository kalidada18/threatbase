import React from 'react'
import { Menu, X, Github, LogIn, LogOut, User as UserIcon, ChevronDown, Heart } from 'lucide-react'
import { useScroll, motion, AnimatePresence, useMotionValueEvent } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const menuItems = [
    { name: 'Dashboard', href: '/#stats' },
    { name: 'About Us', href: '/about' },
    { name: 'Threat Feeds', href: '/#feeds' },
    { name: 'Report IP', href: '/report' },
    { name: 'API Docs', href: '/api' },
    { name: 'Top Contributors', href: '/contributors' }
]

export default function Navbar() {
    const navigate = useNavigate()
    const location = useLocation()
    const isReportActive = location.pathname === '/report'
    const { user, profile, loading, signInWithGoogle, signInWithGithub, signOut } = useAuth()
    const [dropdownOpen, setDropdownOpen] = React.useState(false)
    const [menuState, setMenuState] = React.useState(false)
    const [scrolled, setScrolled] = React.useState(false)
    const [hidden, setHidden] = React.useState(false)
    const { scrollY } = useScroll()

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious() || 0
        setScrolled(latest > 50)
        if (latest > previous && latest > 150) {
            setHidden(true)
        } else {
            setHidden(false)
        }
    })

    const handleSignOut = async () => {
        try {
            await signOut()
            setDropdownOpen(false)
            navigate('/')
        } catch (e) {
            console.error('Sign out failed:', e)
        }
    }

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
                    "group fixed z-50 transition-all duration-300 w-full",
                    scrolled
                        ? "bg-[#080b12]/80 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/40 py-2"
                        : "bg-transparent border-b border-transparent py-3.5"
                )}
            >
                <div className="w-full px-4 lg:px-8">
                    <div className="relative flex flex-wrap items-center justify-between">
                        <div className="flex w-full items-center justify-between gap-10 xl:w-auto">
                            <Link
                                to="/"
                                aria-label="home"
                                className="flex items-center gap-2.5 group relative z-10">
                                <img
                                    src="/img/logo.png"
                                    alt="Threatbase"
                                    className="w-11 h-11 md:w-12 md:h-12 rounded-full object-cover ring-1 ring-white/10 transition-transform duration-500 ease-out group-hover:scale-[1.08] group-hover:rotate-6"
                                />
                                <span className="font-display text-[1.35rem] font-bold tracking-tight text-white">
                                    <span className="text-metal">Threat</span><span className="text-red-500">base</span>
                                </span>
                            </Link>

                            <button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState === true ? 'Close Menu' : 'Open Menu'}
                                aria-expanded={menuState}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 xl:hidden text-foreground">
                                <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>

                            {/* Full nav only from xl up: six labels + wordmark + the action
                                cluster measure wider than 1024px, which used to wrap the bar
                                onto a second line between lg and xl. */}
                            <div className="hidden xl:block">
                                <ul className="flex items-center gap-1 text-sm font-medium">
                                    {menuItems.map((item, index) => {
                                        const isActive = item.name === 'Report IP' && isReportActive
                                        return (
                                            <li key={index} className="flex items-center">
                                                <Link
                                                    to={item.href}
                                                    className={cn(
                                                        "transition-colors duration-200 tracking-tight font-semibold text-[0.9rem] px-3 py-2 rounded-full whitespace-nowrap",
                                                        isActive
                                                            ? "bg-red-500/10 text-white ring-1 ring-red-500/20"
                                                            : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
                                                    )}>
                                                    {item.name}
                                                </Link>
                                            </li>
                                        )
                                    })}

                                </ul>
                            </div>
                        </div>

                        <div className="bg-black/95 backdrop-blur-xl border border-white/10 group-data-[state=active]:flex xl:group-data-[state=active]:flex mb-4 hidden w-full flex-col xl:flex-row flex-wrap items-center justify-center xl:justify-end space-y-8 xl:space-y-0 rounded-3xl p-6 shadow-2xl max-h-[calc(100dvh-6rem)] overflow-y-auto xl:max-h-none xl:overflow-visible md:flex-nowrap xl:m-0 xl:flex xl:w-fit xl:gap-6 xl:border-transparent xl:bg-transparent xl:p-0 xl:shadow-none mt-4 xl:mt-0 transition-all duration-300">
                            <div className="xl:hidden w-full">
                                <ul className="space-y-2 text-base font-medium">
                                    {menuItems.map((item, index) => {
                                        const isActive = item.name === 'Report IP' && isReportActive
                                        return (
                                            <li key={index}>
                                                <Link
                                                    to={item.href}
                                                    onClick={() => setMenuState(false)}
                                                    className={cn(
                                                        "flex min-h-[44px] items-center justify-center transition-all duration-200 px-4 py-2.5 rounded-xl text-center",
                                                        isActive ? "bg-white/10 text-white font-bold" : "text-slate-400 hover:text-white hover:bg-white/5 font-semibold"
                                                    )}>
                                                    {item.name}
                                                </Link>
                                            </li>
                                        )
                                    })}

                                </ul>
                            </div>

                            <div className="flex w-full flex-col space-y-4 sm:flex-row sm:items-center sm:justify-center xl:justify-end sm:gap-4 sm:space-y-0 md:w-fit relative mt-6 xl:mt-0">
                                {/* Secondary utilities: labelled in the mobile panel, icon-only
                                    from xl so the desktop bar stays on one line. */}
                                <Button
                                    asChild
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 hover:text-white rounded-full px-5 xl:px-0 xl:w-10 h-10 transition-all duration-300 gap-2 text-xs font-semibold"
                                    size="sm">
                                    <Link to="/thanks" onClick={() => setMenuState(false)} title="Thanks" aria-label="Thanks">
                                        <Heart size={14} className="text-destructive fill-red-400/20" />
                                        <span className="xl:hidden">Thanks</span>
                                    </Link>
                                </Button>
                                <Button
                                    asChild
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 hover:text-white rounded-full px-5 xl:px-0 xl:w-10 h-10 transition-all duration-300 gap-2 text-xs font-semibold"
                                    size="sm">
                                    <a href="https://github.com/kalidada18/threatbase" target="_blank" rel="noopener noreferrer" title="Star us on GitHub" aria-label="Star us on GitHub">
                                        <Github size={14} />
                                        <span className="xl:hidden">Star us</span>
                                    </a>
                                </Button>

                                 {loading ? (
                                     <div className="h-9 w-9 rounded-full border border-white/5 bg-black/60 animate-pulse" />
                                 ) : user ? (
                                    <div className="relative">
                                        <button
                                            onClick={() => setDropdownOpen(!dropdownOpen)}
                                            className="flex items-center gap-2.5 p-1 pr-3 rounded-full border border-white/10 bg-slate-900/40 backdrop-blur-md hover:bg-slate-800/60 hover:border-white/20 transition-all duration-300 focus:outline-none select-none active:scale-[0.98] cursor-pointer"
                                        >
                                            {(profile?.avatar_url || user.user_metadata?.avatar_url) ? (
                                                <img
                                                    src={profile?.avatar_url || user.user_metadata?.avatar_url}
                                                    alt="User avatar"
                                                    className="w-7 h-7 rounded-full object-cover border border-white/20"
                                                />
                                            ) : (
                                                <span className="w-7 h-7 rounded-full border border-white/20 bg-slate-800 flex items-center justify-center text-slate-300">
                                                    <UserIcon size={14} />
                                                </span>
                                            )}
                                            <span className="text-xs font-bold text-slate-300 block">
                                                My Account
                                            </span>
                                            <ChevronDown size={12} className={cn("text-slate-500 transition-transform duration-300", dropdownOpen && "rotate-180")} />
                                        </button>

                                        {/* Dropdown Menu */}
                                        <AnimatePresence>
                                            {dropdownOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                                                    
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="absolute right-0 mt-2.5 w-48 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-2.5 shadow-xl shadow-black/40 ring-1 ring-white/5 z-50 flex flex-col gap-1 select-none"
                                                    >
                                                        <div className="px-3 py-2 border-b border-white/5 mb-1 text-left">
                                                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Logged In As</p>
                                                            <p className="text-xs font-bold text-white truncate mt-0.5">{profile?.full_name || user.user_metadata?.full_name || 'Defender'}</p>
                                                            <p className="text-[10px] text-slate-500 truncate font-semibold mt-0.5">{user.email}</p>
                                                        </div>

                                                        <Link
                                                            to="/profile"
                                                            onClick={() => setDropdownOpen(false)}
                                                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                                                        >
                                                            <UserIcon size={14} className="text-slate-500" />
                                                            My Account
                                                        </Link>

                                                        <button
                                                            onClick={handleSignOut}
                                                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all text-left cursor-pointer"
                                                        >
                                                            <LogOut size={14} className="text-rose-400/80" />
                                                            Sign Out
                                                        </button>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2.5">
                                        <Button
                                            onClick={() => { signInWithGoogle(); setMenuState(false) }}
                                            className="rounded-full px-4 h-9 gap-2 text-xs font-bold bg-white text-slate-800 hover:bg-slate-100 hover:text-black transition-all duration-300 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-[0.96] border border-transparent"
                                            size="sm" title="Sign In with Google">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                            </svg>
                                            <span className="hidden sm:inline tracking-wide">Google</span>
                                        </Button>
                                        <Button
                                            onClick={() => { signInWithGithub(); setMenuState(false) }}
                                            className="rounded-full px-4 h-9 gap-2 text-xs font-bold bg-[#181a1f]/80 backdrop-blur-md text-white hover:bg-[#24292e] transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] active:scale-[0.96] border border-white/5 hover:border-white/10"
                                            size="sm" title="Sign In with GitHub">
                                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                                            </svg>
                                            <span className="hidden sm:inline tracking-wide">GitHub</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.nav>
        </header>
    )
}
