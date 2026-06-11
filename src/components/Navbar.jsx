import { useState, useCallback } from 'react'
import { Moon, Sun, Menu, X, LayoutDashboard, Server, TrendingUp, Flag, Github } from 'lucide-react'

export default function Navbar({ theme, toggleTheme, syncTime }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
    document.body.style.overflow = 'hidden'
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    document.body.style.overflow = ''
  }, [])

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a href="#" className="nav-brand" aria-label="HimalayaFeed Home">
            <img
              src="https://raw.githubusercontent.com/kalidada18/himalayafeed/main/img/himalayafeed.png"
              alt=""
              aria-hidden="true"
            />
            <span>Himalaya<em className="brand-accent">Feed</em></span>
          </a>

          <div className="nav-right">
            <ul className="nav-links" id="nav-links">
              <li><a href="#dashboard" className="active">Dashboard</a></li>
              <li><a href="#feeds">Threat Feeds</a></li>
              <li><a href="#analytics">Analytics</a></li>
              <li><a href="#report-ip">Report IP</a></li>
              <li><a href="https://github.com/kalidada18/himalayafeed" target="_blank" rel="noopener">GitHub</a></li>
            </ul>

            <div className="nav-status" aria-live="polite">
              <div className="nav-dot" aria-hidden="true"></div>
              <span id="sync-status">{syncTime}</span>
            </div>

            <button
              id="theme-toggle"
              className="theme-toggle-btn"
              aria-label="Toggle Theme"
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              id="mobile-menu-btn"
              className="hamburger"
              aria-label="Open Menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-drawer"
              onClick={openDrawer}
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <div
        id="mobile-overlay"
        className={`mobile-drawer-overlay${drawerOpen ? ' open' : ''}`}
        aria-hidden={!drawerOpen}
        onClick={(e) => { if (e.target === e.currentTarget) closeDrawer() }}
      >
        <nav id="mobile-drawer" className="mobile-drawer" aria-label="Mobile Navigation">
          <div className="mobile-drawer-header">
            <div className="nav-brand">
              <img
                src="https://raw.githubusercontent.com/kalidada18/himalayafeed/main/img/himalayafeed.png"
                alt=""
                aria-hidden="true"
              />
              <span>Himalaya<em className="brand-accent">Feed</em></span>
            </div>
            <button id="mobile-close-btn" className="mobile-drawer-close" aria-label="Close Menu" onClick={closeDrawer}>
              <X size={18} />
            </button>
          </div>

          <ul className="mobile-nav-links">
            <li><a href="#dashboard" className="mobile-link active" onClick={closeDrawer}><LayoutDashboard size={18} /> Dashboard</a></li>
            <li><a href="#feeds" className="mobile-link" onClick={closeDrawer}><Server size={18} /> Threat Feeds</a></li>
            <li><a href="#analytics" className="mobile-link" onClick={closeDrawer}><TrendingUp size={18} /> Analytics</a></li>
            <li><a href="#report-ip" className="mobile-link" onClick={closeDrawer}><Flag size={18} /> Report IP</a></li>
            <li><a href="https://github.com/kalidada18/himalayafeed" className="mobile-link" target="_blank" rel="noopener" onClick={closeDrawer}><Github size={18} /> GitHub</a></li>
          </ul>

          <div className="mobile-drawer-status" aria-live="polite">
            <div className="nav-dot" aria-hidden="true"></div>
            <span id="mobile-sync-status">{syncTime}</span>
          </div>
        </nav>
      </div>
    </>
  )
}
