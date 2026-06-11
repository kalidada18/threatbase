import { Github, FileJson } from 'lucide-react'

const BASE = import.meta.env.BASE_URL

export default function Footer() {
  return (
    <footer className="border-t border-white/20 dark:border-white/10 bg-white/30 dark:bg-slate-900/40 backdrop-blur-md py-12 mt-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <div className="flex items-center gap-3 font-bold text-xl mb-2 text-black dark:text-white">
            <img src={`${BASE}img/himalayafeed.png`} alt="" className="w-8 h-8 rounded-full" aria-hidden="true" />
            <span>Himalaya<em className="text-red-600 not-italic">Feed</em></span>
          </div>
          <p className="text-sm text-slate-400 max-w-md leading-relaxed">
            Advanced Threat Intelligence Platform. Fully automated, zero infrastructure, zero cost.
          </p>
          <p className="text-xs text-slate-500 mt-3 max-w-md leading-relaxed font-medium">
            Special thanks to all open-source intelligence contributors including Spamhaus, FireHOL, AbuseIPDB, Emerging Threats, and the wider infosec community.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
          <a 
            href="https://github.com/kalidada18/himalayafeed" 
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors font-bold"
          >
            <Github size={16} /> GitHub
          </a>
          <a 
            href={`${BASE}ioc/stats.json`} 
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors font-bold"
          >
            <FileJson size={16} /> stats.json
          </a>
          <div className="flex flex-col items-center md:items-end text-slate-500 ml-0 md:ml-4 mt-4 md:mt-0">
            <span className="font-medium">&copy; {new Date().getFullYear()} HimalayaFeed</span>
            <span className="text-xs mt-1.5 font-bold tracking-widest uppercase bg-gradient-to-r from-red-500 to-purple-500 bg-clip-text text-transparent drop-shadow-sm">Built By Curiosity</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
