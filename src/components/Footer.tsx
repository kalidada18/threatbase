import { Github, FileJson } from 'lucide-react'

const BASE = import.meta.env.BASE_URL

export default function Footer() {
  return (
    <footer className="border-t bg-muted/20 py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <div className="flex items-center gap-3 font-bold text-xl mb-2 text-black dark:text-white">
            <img src={`${BASE}img/himalayafeed.png`} alt="" className="w-8 h-8 rounded-full" aria-hidden="true" />
            <span>Himalaya<em className="text-red-600 not-italic">Feed</em></span>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Advanced Threat Intelligence Platform. Fully automated, zero infrastructure, zero cost.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
          <a 
            href="https://github.com/kalidada18/himalayafeed" 
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github size={16} /> GitHub
          </a>
          <a 
            href={`${BASE}ioc/stats.json`} 
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileJson size={16} /> stats.json
          </a>
          <span className="text-muted-foreground/60 ml-4">&copy; {new Date().getFullYear()} HimalayaFeed</span>
        </div>
      </div>
    </footer>
  )
}
