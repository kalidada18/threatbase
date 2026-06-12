import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bug, ShieldCheck, Copy, Check, ExternalLink, 
  Mail, Terminal, Info, CornerDownRight
} from 'lucide-react'
import { useAuth } from '../AuthContext'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import supabaseClient from '../supabaseClient'

export default function ReportBug({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const { user, profile } = useAuth()
  
  // Streamlined Form fields
  const [alias, setAlias] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  
  // Agreement state
  const [agreementChecked, setAgreementChecked] = useState(false)
  
  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [copiedMarkdown, setCopiedMarkdown] = useState(false)

  // Auto-populate alias from auth context
  useEffect(() => {
    if (profile?.username) {
      setAlias(profile.username)
    } else if (user) {
      const fallback = user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
      setAlias(fallback.replace(/[^a-zA-Z0-9_-]/g, ''))
    }
  }, [profile, user])

  // Compute live markdown representation of the report from the single message field
  const generateMarkdownReport = () => {
    return `### 🛡️ ETHICAL DISCLOSURE: GOOD GUY BUG REPORT

**Reporter:** @${alias || 'anonymous'}
**Contact Info:** ${contact || 'Not provided'}

---

#### 📝 Bug Details
${message || '*(Please enter your bug details in the message field)*'}

---
*Reported responsibly via ThreatBase "Good Guy" disclosure program.*`
  }

  const isFormValid = () => {
    return message.trim().length > 0 && agreementChecked
  }

  const handleCopyMarkdown = () => {
    const md = generateMarkdownReport()
    navigator.clipboard.writeText(md)
    setCopiedMarkdown(true)
    addToast('Markdown report copied to clipboard!', 'success')
    setTimeout(() => setCopiedMarkdown(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid()) {
      addToast('Please write a bug message and accept the ethical agreement', 'error')
      return
    }

    setIsSubmitting(true)
    
    try {
      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('bug_reports')
          .insert([{
            reporter: alias.trim() || 'anonymous',
            contact: contact.trim() || null,
            title: `Bug Report by @${alias || 'anonymous'}`,
            description: message.trim(),
            severity: 'unspecified',
            component: 'unspecified',
            steps: 'Provided in main message',
            poc: null
          }])
        
        if (error) {
          console.warn('Supabase bug_reports insert failed:', error.message)
        }
      }
    } catch (dbErr) {
      console.warn('Database connection error:', dbErr)
    }

    setIsSubmitting(false)
    setSubmitSuccess(true)
    addToast('Bug report successfully generated!', 'success')
  }

  // Pre-filled links
  const gitHubIssueUrl = () => {
    const baseUrl = 'https://github.com/kalidada18/threatbase/issues/new'
    const bodyText = encodeURIComponent(generateMarkdownReport())
    const titleText = encodeURIComponent(`[BUG] Security/Bug Report by @${alias || 'anonymous'}`)
    return `${baseUrl}?title=${titleText}&body=${bodyText}`
  }

  const mailToUrl = () => {
    const bodyText = encodeURIComponent(generateMarkdownReport())
    const subjectText = encodeURIComponent(`[ThreatBase Bug Report] From @${alias || 'anonymous'}`)
    return `mailto:developers@threatbase.org?subject=${subjectText}&body=${bodyText}`
  }

  return (
    <main className="bg-[#0B0F19] min-h-screen relative overflow-hidden font-sans pt-28 pb-24">
      {/* Dynamic Background Glows */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[10%] left-[5%] w-[45vw] h-[45vw] rounded-full bg-gradient-to-br from-rose-500/10 via-red-900/5 to-transparent blur-[120px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-tr from-blue-500/5 via-indigo-950/5 to-transparent blur-[140px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay"></div>
      </div>

      <div className="mx-auto max-w-7xl px-4 lg:px-8 relative z-10">
        <AnimatePresence mode="wait">
          {!submitSuccess ? (
            <motion.div
              key="bug-form-screen"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Column: Simple Message Input Form */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-widest mb-4">
                    <Bug size={12} /> Good Guy Program
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter">
                    Report a <span className="bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">Vulnerability</span>
                  </h1>
                  <p className="mt-3 text-slate-400 text-sm md:text-base leading-relaxed max-w-xl">
                    ThreatBase is built for defenders. If you've found a bug, alignment issue, or vulnerability, write a friendly message below to let the developers know.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-white/5 bg-slate-900/40 p-6 md:p-8 backdrop-blur-xl shadow-2xl relative">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="alias" className="text-xs font-bold text-slate-300">Reporter Alias</Label>
                      <Input
                        id="alias"
                        placeholder="e.g. DefenderX"
                        className="bg-black/60 border-white/10 text-white rounded-xl focus:border-rose-500/40 h-10 text-xs font-semibold"
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label htmlFor="contact" className="text-xs font-bold text-slate-300">Contact / Email (Optional)</Label>
                      <Input
                        id="contact"
                        type="text"
                        placeholder="e.g. keybase, github, email"
                        className="bg-black/60 border-white/10 text-white rounded-xl focus:border-rose-500/40 h-10 text-xs font-semibold"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="message" className="text-xs font-bold text-slate-300">Your Bug Message *</Label>
                    <Textarea
                      id="message"
                      placeholder="Describe the bug, tell us where it happened, or write the reproduction steps here..."
                      required
                      rows={8}
                      className="bg-black/60 border-white/10 text-slate-200 rounded-xl focus:border-rose-500/40 text-xs font-medium resize-none leading-relaxed"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>

                  {/* Ethical Agreement Checkbox */}
                  <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/5 mt-4">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={agreementChecked}
                        onChange={(e) => setAgreementChecked(e.target.checked)}
                        className="mt-1 accent-rose-500 rounded border-white/10 bg-black/40 h-4 w-4 cursor-pointer"
                      />
                      <span className="text-[11px] font-medium text-slate-300 leading-normal">
                        I am acting as a <strong className="text-rose-400">Good Guy</strong>. I agree to keep this report friendly, constructive, avoid taking actions that crash or vandalize the platform, and will share information to protect other defenders.
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting || !isFormValid()}
                      className="flex-1 bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-400 hover:to-orange-500 text-white font-bold h-11 rounded-full transition-all border border-rose-400/20 shadow-[0_0_15px_rgba(244,63,94,0.2)] disabled:opacity-40"
                    >
                      {isSubmitting ? 'Submitting...' : 'Generate Good Guy Report'}
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopyMarkdown}
                      className="border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 h-11 px-5 rounded-full transition-all font-semibold text-xs"
                    >
                      <Copy size={14} className="mr-1.5" />
                      Copy Markdown
                    </Button>
                  </div>
                </form>
              </div>

              {/* Right Column: Interactive Live Preview Panel */}
              <div className="lg:col-span-5 lg:sticky lg:top-28 space-y-6">
                <div className="rounded-2xl border border-white/5 bg-black/60 p-6 backdrop-blur-xl shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3.5">
                    <div className="flex items-center gap-2">
                      <Terminal size={14} className="text-rose-400" />
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Developer Message Preview</span>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 leading-relaxed max-h-[350px] overflow-y-auto pr-1 bg-black/30 p-4 rounded-xl border border-white/5 space-y-2 whitespace-pre-wrap select-text">
                    {generateMarkdownReport()}
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <Info size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      This preview updates in real-time as you write. Submitting will prepare direct quick-action links to GitHub issues or developer email!
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-900/20 p-6 backdrop-blur-xl space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-400" /> Responsible Disclosure
                  </h3>
                  <ul className="space-y-2.5 text-xs text-slate-400">
                    <li className="flex gap-2">
                      <CornerDownRight size={12} className="text-rose-500 flex-shrink-0 mt-0.5" />
                      <span>Zero-risk: Reports are processed with a supportive & positive attitude.</span>
                    </li>
                    <li className="flex gap-2">
                      <CornerDownRight size={12} className="text-rose-500 flex-shrink-0 mt-0.5" />
                      <span>Earn defenders' respect and recognition on the platform.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="bug-success-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="max-w-2xl mx-auto text-center space-y-8 py-12 flex flex-col items-center"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-rose-500/10 rounded-full blur-3xl w-48 h-48 mx-auto -translate-y-6" />
                <div className="relative bg-gradient-to-b from-white/10 to-white/5 p-6 rounded-full border border-rose-500/20 shadow-[0_0_45px_rgba(244,63,94,0.15)]">
                  <ShieldCheck size={72} className="text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]" />
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                  Thank You, Good Guy!
                </h1>
                <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                  Your bug message has been formatted. Help us finish the process by sending it using one of the actions below:
                </p>
              </div>

              {/* Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl text-left">
                <a 
                  href={gitHubIssueUrl()}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group p-5 rounded-2xl border border-white/5 bg-slate-900/40 hover:bg-slate-900/60 hover:border-rose-500/30 transition-all duration-300 flex flex-col justify-between h-40 shadow-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 group-hover:bg-rose-500/20 transition-all">
                      <ExternalLink size={20} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">GitHub Issues</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-rose-300 transition-colors">Submit on GitHub</h3>
                    <p className="text-[11px] text-slate-500 mt-1 leading-normal">Open a pre-filled issue containing your markdown report directly.</p>
                  </div>
                </a>

                <a 
                  href={mailToUrl()}
                  className="group p-5 rounded-2xl border border-white/5 bg-slate-900/40 hover:bg-slate-900/60 hover:border-orange-500/30 transition-all duration-300 flex flex-col justify-between h-40 shadow-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 group-hover:bg-orange-500/20 transition-all">
                      <Mail size={20} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Direct Email</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-orange-300 transition-colors">Email Developers</h3>
                    <p className="text-[11px] text-slate-500 mt-1 leading-normal">Send pre-formatted email report to the developer security team.</p>
                  </div>
                </a>
              </div>

              {/* Text Summary Card & Clipboard Option */}
              <div className="w-full max-w-xl bg-black/60 rounded-2xl border border-white/5 p-6 text-left space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Generated Message Markdown</span>
                  <Button
                    onClick={handleCopyMarkdown}
                    className="h-8 rounded-lg text-[10px] font-bold border-white/10 bg-white/5 hover:bg-white/10 hover:text-white px-3"
                    size="sm"
                  >
                    {copiedMarkdown ? (
                      <>
                        <Check size={12} className="text-emerald-400 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={12} className="mr-1" />
                        Copy Report
                      </>
                    )}
                  </Button>
                </div>
                <div className="text-[10px] font-mono text-slate-400 bg-black/30 p-3 rounded-lg border border-white/5 overflow-y-auto max-h-40 whitespace-pre-wrap select-text">
                  {generateMarkdownReport()}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  onClick={() => {
                    setSubmitSuccess(false)
                    setMessage('')
                  }}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-semibold px-6 rounded-full text-xs h-10 transition-all"
                >
                  Write Another Message
                </Button>
                
                <Button
                  asChild
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold px-6 rounded-full text-xs h-10 transition-all"
                >
                  <Link to="/">Go Back Dashboard</Link>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
