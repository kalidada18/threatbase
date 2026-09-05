import { Footer7 } from './ui/footer-7'

const BASE = import.meta.env.BASE_URL

const GithubIcon = () => (
  <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.087.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
)

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
              { name: "Dashboard", href: "/threatfeed" },
              { name: "Threat Feeds", href: "/threatfeed#feeds" },
              { name: "Report IP", href: "/report" },
              { name: "Hall of Shame", href: "/hall-of-shame" },
              { name: "Reporting Policy", href: "/policy" },
            ],
          },
          {
            title: "Resources",
            links: [
              { name: "GitHub", href: "https://github.com/kalidada18/threatbase" },
              { name: "Improvements", href: "/improvements" },
              { name: "stats.json", href: "https://github.com/kalidada18/threatbase/blob/main/ioc/stats.json" },
            ],
          },
        ]}
        socialLinks={[
          { icon: <GithubIcon />, href: "https://github.com/kalidada18/threatbase", label: "GitHub" },
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
