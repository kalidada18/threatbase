import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'
import './HowItWorks.css'

/**
 * How It Works — pure 2D animated loop: CSS keyframes + inline SVG only.
 * No framer-motion, no WebGL. All motion runs off one 9s master cycle
 * (--hiw-cycle in HowItWorks.css); each card activates for a third of it
 * via staggered negative delays. Colors are literal there too — accent
 * red matches the site, green marks the defense step.
 */
export default function HowItWorks() {
  return (
    <Section id="how-it-works" className="overflow-hidden" containerClassName="relative z-10">
      <SectionHeading
        title="How it works"
        subtitle="A simple loop that turns individual observations into collective defense."
      />

      <div className="hiw-flow">
        {/* Step 1 — sweeping lens over an indicator list */}
        <div className="hiw-card">
          <span className="hiw-tag">Scan</span>
          <h3>Scan &amp; Investigate</h3>
          <p>Query any IP, domain, URL or hash against aggregated threat feeds in real time.</p>
          <svg className="hiw-icon" viewBox="0 0 220 110" fill="none" aria-hidden>
            <rect x="24" y="26" width="172" height="26" rx="6" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.1)" />
            <text x="34" y="44" fill="#94a3b8" fontSize="13" fontFamily="ui-monospace,monospace">203.0.113.66</text>
            <rect className="hiw-caret" x="132" y="33" width="8" height="13" rx="2" fill="#ef4444" />
            <g fill="rgba(255,255,255,0.18)">
              <circle cx="44" cy="80" r="5" />
              <circle cx="68" cy="80" r="5" />
              <circle cx="92" cy="80" r="5" />
            </g>
            <circle className="hiw-ping" cx="152" cy="80" r="5" fill="#ef4444" />
            <g className="hiw-lens">
              <circle cx="60" cy="80" r="13" stroke="#ef4444" strokeWidth="3" fill="rgba(239,68,68,0.07)" />
              <line x1="69" y1="89" x2="79" y2="99" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
            </g>
          </svg>
        </div>

        <div className="hiw-link" aria-hidden />

        {/* Step 2 — severity gauge fills to 87 (CRITICAL) */}
        <div className="hiw-card">
          <span className="hiw-tag">Analyze</span>
          <h3>Analyze Threats</h3>
          <p>Severity scoring, geolocation, ISP attribution and corroborating evidence.</p>
          <div className="hiw-gauge-wrap">
            <svg className="hiw-icon" viewBox="0 0 220 110" fill="none" aria-hidden>
              <path d="M52 84 A58 58 0 0 1 168 84" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round" />
              <path className="hiw-arc" d="M52 84 A58 58 0 0 1 168 84" stroke="#ef4444" strokeWidth="10" strokeLinecap="round" />
              <g className="hiw-needle">
                <line x1="110" y1="84" x2="110" y2="38" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
              </g>
              <circle cx="110" cy="84" r="6" fill="#fff" />
            </svg>
            <div className="hiw-num" role="img" aria-label="Severity 87" />
            <div className="hiw-crit" aria-hidden>CRITICAL</div>
          </div>
        </div>

        <div className="hiw-link" aria-hidden />

        {/* Step 3 — observation packets charge a defended shield */}
        <div className="hiw-card">
          <span className="hiw-tag">Defend</span>
          <h3>Defend Together</h3>
          <p>Report threats, download blocklists, deploy feeds to your firewall and SIEM.</p>
          <svg className="hiw-icon" viewBox="0 0 220 110" fill="none" aria-hidden>
            <g stroke="rgba(255,255,255,0.18)" fill="rgba(0,0,0,0.35)">
              <rect x="26" y="30" width="52" height="8" rx="4" />
              <rect x="26" y="46" width="52" height="8" rx="4" />
              <rect x="26" y="62" width="52" height="8" rx="4" />
            </g>
            <circle className="hiw-pkt" cx="92" cy="34" r="4" fill="#ef4444" />
            <circle className="hiw-pkt hiw-p2" cx="92" cy="50" r="4" fill="#ef4444" />
            <circle className="hiw-pkt hiw-p3" cx="92" cy="66" r="4" fill="#ef4444" />
            <path className="hiw-shield" d="M150 24l34 12v26c0 22-14 34-34 42-20-8-34-20-34-42V36z" />
            <path className="hiw-check" d="M136 56l10 10 20-22" />
          </svg>
        </div>
      </div>
    </Section>
  )
}
