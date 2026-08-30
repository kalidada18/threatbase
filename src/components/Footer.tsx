import { Footer7 } from './ui/footer-7'
import { FaGithub } from 'react-icons/fa'

const BASE = import.meta.env.BASE_URL

export default function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] overflow-hidden">
      {/* Premium gradient separator */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
      <div className="relative z-10 bg-white/[0.02] backdrop-blur-md">
        <Footer7 
        logo={{
          url: "/",
          src: `${BASE}img/logo.png`,
          alt: "Threatbase Logo",
          title: "Threatbase",
        }}
        description="Advanced threat intelligence platform. Special thanks to all open-source intelligence contributors including Spamhaus, FireHOL, AbuseIPDB, Emerging Threats, and the wider infosec community."
        sections={[
          {
            title: "Product",
            links: [
              { name: "Dashboard", href: "/#stats" },
              { name: "Threat Feeds", href: "/#feeds" },
              { name: "Report IP", href: "/report" },
              { name: "Reporting Policy", href: "/policy" },
            ],
          },
          {
            title: "Resources",
            links: [
              { name: "GitHub", href: "https://github.com/kalidada18/threatbase" },
              { name: "stats.json", href: "https://github.com/kalidada18/threatbase/blob/main/ioc/stats.json" },
            ],
          },
        ]}
        socialLinks={[
          { icon: <FaGithub className="size-5" />, href: "https://github.com/kalidada18/threatbase", label: "GitHub" },
        ]}
        copyright={`© ${new Date().getFullYear()} Threatbase. Built By Curiosity.`}
        legalLinks={[
          { name: "Terms and Conditions", href: "/terms" },
          { name: "Privacy Policy", href: "/privacy" },
        ]}
      />
      </div>
    </footer>
  )
}
