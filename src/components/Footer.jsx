import { Github, FileJson } from 'lucide-react'

const BASE = import.meta.env.BASE_URL

export default function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-brand">
          <img src={`${BASE}img/himalayafeed.png`} alt="" aria-hidden="true" />
          <span>Himalaya<em className="brand-accent">Feed</em></span>
        </div>
        <p className="footer-desc">
          Advanced Threat Intelligence Platform. Fully automated, zero infrastructure, zero cost.
        </p>

        <div className="footer-links">
          <a href="https://github.com/kalidada18/himalayafeed"><Github size={14} /> GitHub</a>
          <a href={`${BASE}ioc/stats.json`}><FileJson size={14} /> stats.json</a>
          <span>&copy; 2025–2026 HimalayaFeed</span>
        </div>
      </div>
    </footer>
  )
}
