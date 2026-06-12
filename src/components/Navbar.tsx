import React from 'react'
import { Menu, X, Github, LogIn, LogOut, User as UserIcon, ChevronDown } from 'lucide-react'
import { useScroll, motion, AnimatePresence, useMotionValueEvent } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const menuItems = [
    { name: 'Dashboard', href: '/#dashboard' },
    { name: 'About Us', href: '/about' },
    { name: 'Threat Feeds', href: '/#feeds' },
    { name: 'Report IP', href: '/report' }
]

export default function Navbar() {
    const navigate = useNavigate()
    const location = useLocation()
    const isReportActive = location.pathname === '/report'
    const { user, profile, loading, signInWithGoogle, signOut } = useAuth()
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
                        ? "bg-[#0A0C10]/60 backdrop-blur-xl border-b border-white/[0.05] shadow-[0_8px_30px_rgb(0,0,0,0.5)] py-3" 
                        : "bg-transparent border-b border-transparent py-5"
                )}
            >
                <div className="w-full px-4 lg:px-8">
                    <div className="relative flex items-center justify-between">
                        <div className="flex w-full items-center justify-between gap-10 lg:w-auto">
                            <Link
                                to="/"
                                aria-label="home"
                                className="flex items-center group relative z-10">
                                <img 
                                    src={`${import.meta.env.BASE_URL}img/threatbase.png`} 
                                    alt="Threatbase" 
                                    className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.12] group-hover:rotate-6"
                                />
                            </Link>

                            <button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState === true ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden text-foreground">
                                <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>

                            <div className="hidden lg:block">
                                <ul className="flex gap-8 text-sm font-medium">
                                    {menuItems.map((item, index) => {
                                        const isActive = item.name === 'Report IP' && isReportActive
                                        return (
                                            <li key={index} className="flex items-center">
                                                <Link
                                                    to={item.href}
                                                    className={cn(
                                                        "transition-all duration-300 tracking-wide font-bold text-sm px-4 py-2 rounded-full",
                                                        isActive 
                                                            ? "bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                                                            : "text-slate-400 hover:text-white hover:bg-white/5"
                                                    )}>
                                                    {item.name}
                                                </Link>
                                            </li>
                                        )
                                    })}
                                    {user && (
                                        <li>
                                            <Link
                                                to="/profile"
                                                className="transition-all duration-300 tracking-wide font-bold text-sm px-4 py-2 rounded-full text-slate-400 hover:text-white hover:bg-white/5">
                                                My Account
                                            </Link>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </div>

                        <div className="bg-black/95 backdrop-blur-xl border border-white/10 group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl p-6 shadow-2xl md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
                            <div className="lg:hidden">
                                <ul className="space-y-6 text-base font-medium">
                                    {menuItems.map((item, index) => {
                                        const isActive = item.name === 'Report IP' && isReportActive
                                        return (
                                            <li key={index}>
                                                <Link
                                                    to={item.href}
                                                    onClick={() => setMenuState(false)}
                                                    className={cn(
                                                        "block transition-all duration-200 px-4 py-2 rounded-xl text-center",
                                                        isActive ? "bg-white/10 text-white font-bold" : "text-slate-400 hover:text-white hover:bg-white/5 font-semibold"
                                                    )}>
                                                    {item.name}
                                                </Link>
                                            </li>
                                        )
                                    })}
                                    {user && (
                                        <li>
                                            <Link
                                                to="/profile"
                                                onClick={() => setMenuState(false)}
                                                className="block transition-all duration-200 px-4 py-2 rounded-xl text-center text-slate-400 hover:text-white hover:bg-white/5 font-semibold">
                                                My Account
                                            </Link>
                                        </li>
                                    )}
                                </ul>
                            </div>
                            
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:items-center sm:gap-4 sm:space-y-0 md:w-fit relative">
                                <Button
                                    asChild
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 hover:text-white rounded-full px-5 h-10 transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] gap-2 text-xs font-semibold"
                                    size="sm">
                                    <a href="https://github.com/kalidada18/threatbase" target="_blank" rel="noopener noreferrer">
                                        <Github size={14} />
                                        GitHub
                                    </a>
                                </Button>

                                 {loading ? (
                                     <div className="h-9 w-9 rounded-full border border-white/5 bg-black/60 animate-pulse" />
                                 ) : user ? (
                                    <div className="relative">
                                        <button
                                            onClick={() => setDropdownOpen(!dropdownOpen)}
                                            className="flex items-center gap-2.5 p-1 pr-3 rounded-full border border-white/10 bg-black/80 hover:bg-black transition-all focus:outline-none select-none active:scale-[0.98] cursor-pointer"
                                        >
                                            <img
                                                src={profile?.avatar_url || user.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&auto=format&fit=crop&q=60'}
                                                alt="User Avatar"
                                                className="w-7 h-7 rounded-full object-cover border border-white/20"
                                            />
                                            <span className="text-xs font-bold text-slate-300 max-w-[85px] truncate block">
                                                @{profile?.username || user.email?.split('@')[0]}
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
                                                        className="absolute right-0 mt-2.5 w-48 rounded-2xl border border-white/10 bg-black/95 backdrop-blur-2xl p-2.5 shadow-2xl z-50 flex flex-col gap-1 select-none"
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
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.nav>
        </header>
    )
}
