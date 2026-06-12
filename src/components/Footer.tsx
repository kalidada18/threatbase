import { Footer7 } from './ui/footer-7'
import { FaGithub } from 'react-icons/fa'

const BASE = import.meta.env.BASE_URL

export default function Footer() {
  return (
    <footer className="relative border-t border-white/20 dark:border-white/10 overflow-hidden">
      <div className="relative z-10 bg-white/30 dark:bg-slate-900/40 backdrop-blur-md">
        <Footer7 
        logo={{
          url: "/",
          src: `${BASE}img/threatbase.png`,
          alt: "Threatbase Logo",
          title: "Threatbase",
        }}
        description="Advanced Threat Intelligence Platform. Fully automated, zero infrastructure, zero cost. Special thanks to all open-source intelligence contributors including Spamhaus, FireHOL, AbuseIPDB, Emerging Threats, and the wider infosec community."
        sections={[
          {
            title: "Product",
            links: [
              { name: "Dashboard", href: "/#dashboard" },
              { name: "Threat Feeds", href: "/#feeds" },
              { name: "Report IP", href: "/report" },
            ],
          },
          {
            title: "Resources",
            links: [
              { name: "GitHub", href: "https://github.com/kalidada18/threatbase" },
              { name: "stats.json", href: `${BASE}ioc/stats.json` },
            ],
          },
        ]}
        socialLinks={[
          { icon: <FaGithub className="size-5" />, href: "https://github.com/kalidada18/threatbase", label: "GitHub" },
        ]}
        copyright={`© ${new Date().getFullYear()} Threatbase. Built By Curiosity.`}
        legalLinks={[
          { name: "Terms and Conditions", href: "/terms.txt" },
          { name: "Privacy Policy", href: "/privacy.txt" },
        ]}
      />
      </div>
    </footer>
  )
}
