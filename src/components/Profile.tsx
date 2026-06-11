import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Shield, Mail, Globe, Calendar, Edit3, Save, AlertTriangle, 
  Trash2, ShieldCheck, Trophy, Star, Medal, ArrowLeft, Loader2, List, ShieldAlert,
  Copy, Check
} from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import supabaseClient from '../supabaseClient'
import { Button } from '@/components/ui/button'
import { fmt, timeAgo } from '../utils'

// Ranks based on number of reports
const getRankInfo = (count: number) => {
  if (count >= 50) {
    return {
      name: 'Elite Defender',
      color: 'from-amber-400 via-yellow-500 to-amber-600',
      badgeColor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      icon: <Trophy size={16} className="text-amber-400" />
    }
  }
  if (count >= 15) {
    return {
      name: 'Vanguard',
      color: 'from-purple-400 via-purple-500 to-indigo-600',
      badgeColor: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
      icon: <Star size={16} className="text-purple-400" />
    }
  }
  if (count >= 5) {
    return {
      name: 'Guardian',
      color: 'from-cyan-400 via-cyan-500 to-blue-600',
      badgeColor: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
      icon: <Shield size={16} className="text-cyan-400" />
    }
  }
  return {
    name: 'Initiate',
    color: 'from-slate-400 to-slate-600',
    badgeColor: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
    icon: <Medal size={16} className="text-slate-400" />
  }
}

export default function Profile({ addToast }: any) {
  const navigate = useNavigate()
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()

  // Profile Edit fields
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Submissions state
  const [myReports, setMyReports] = useState<any[]>([])
  const [reportsCount, setReportsCount] = useState(0)
  const [loadingReports, setLoadingReports] = useState(true)
  const [copiedIp, setCopiedIp] = useState<string | null>(null)

  // Block anonymous access
  useEffect(() => {
    if (!authLoading && !user) {
      addToast('Please sign in to access your profile account', 'error')
      navigate('/')
    }
  }, [user, authLoading, navigate, addToast])

  // Sync state values on profile load
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '')
      setBio(profile.bio || '')
      setWebsite(profile.website || '')
    } else if (user) {
      // Fallback pre-fill for new sign-ins
      const fallback = user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
      setUsername(fallback.replace(/[^a-zA-Z0-9_-]/g, ''))
    }
  }, [profile, user])

  // Fetch reports submitted by this user alias
  useEffect(() => {
    async function loadMyReports() {
      const activeUsername = profile?.username || user?.email?.split('@')[0]
      if (!supabaseClient || !activeUsername) {
        setLoadingReports(false)
        return
      }
      setLoadingReports(true)
      try {
        const { data, error, count } = await supabaseClient
          .from('reported_ips')
          .select('*', { count: 'exact' })
          .eq('reporter_alias', activeUsername)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (data) {
          setMyReports(data)
          setReportsCount(count || data.length)
        }
      } catch (err) {
        console.error('Failed to load user reports:', err)
      } finally {
        setLoadingReports(false)
      }
    }

    loadMyReports()
  }, [profile, user])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseClient || !user) return

    if (username.trim().length < 3) {
      addToast('Username alias must be at least 3 characters long', 'error')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabaseClient
        .from('profiles')
        .upsert({
          id: user.id,
          username: username.trim(),
          bio: bio.trim() || null,
          website: website.trim() || null,
          full_name: profile?.full_name || user.user_metadata?.full_name || null,
          avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      addToast('Account profile updated successfully!', 'success')
      await refreshProfile()
      setIsEditing(false)
    } catch (err: any) {
      console.error('Profile update error:', err)
      addToast('Failed to update profile: ' + (err.message || 'Username might be taken'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip)
    setCopiedIp(ip)
    addToast(`Copied ${ip} to clipboard!`, 'success')
    setTimeout(() => setCopiedIp(null), 1500)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F19] text-slate-400">
        <Loader2 className="animate-spin text-emerald-500 mb-4" size={36} />
        <p className="text-sm font-bold tracking-widest uppercase text-slate-500">Syncing Profile details...</p>
      </div>
    )
  }

  if (!user) return null

  const rank = getRankInfo(reportsCount)

  const getCategoryColor = (cat: string) => {
    if (cat.includes('Brute')) return 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
    if (cat.includes('Malware')) return 'bg-red-500/10 text-red-400 border border-red-500/20'
    if (cat.includes('DDoS')) return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    if (cat.includes('Phish')) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    if (cat.includes('Scan')) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
    if (cat.includes('Exploit')) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
    return 'bg-slate-500/10 text-slate-300 border border-slate-500/20'
  }

  return (
    <main className="min-h-screen pt-28 pb-24 relative bg-[#0B0F19] overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay"></div>

      <div className="mx-auto max-w-5xl px-6 relative z-10 space-y-8">
        
        {/* Navigation back */}
        <Link 
          to="/report" 
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Back to Threat Feed
        </Link>

        {/* Profile Card Summary */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/[0.06] bg-slate-900/40 backdrop-blur-xl p-6 md:p-8 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
          
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
              {/* Profile Avatar */}
              <img 
                src={profile.avatar_url || user.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} 
                alt="Profile Avatar"
                className="w-20 h-20 rounded-2xl object-cover border-2 border-white/10 shadow-xl"
              />
              
              <div className="space-y-2">
                <div className="flex flex-col md:flex-row items-center gap-2.5">
                  <h2 className="text-2xl font-black text-white">{profile?.full_name || user.user_metadata?.full_name || 'Anonymous Defender'}</h2>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${rank.badgeColor}`}>
                    {rank.icon}
                    <span>{rank.name}</span>
                  </span>
                </div>
                
                <p className="text-sm font-bold text-slate-400 font-mono">@{profile?.username || username || user.email?.split('@')[0]}</p>
                
                {(profile?.bio || bio) && (
                  <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">{profile?.bio || bio}</p>
                )}

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1.5 pt-2 text-[11px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5"><Mail size={12} /> {user.email}</span>
                  {(profile?.website || website) && (
                    <a 
                      href={profile?.website || website} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-1.5 text-cyan-400 hover:underline hover:text-cyan-300"
                    >
                      <Globe size={12} /> {(profile?.website || website).replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar size={12} /> Joined {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-center md:text-right flex-shrink-0">
              <div className="text-4xl font-black text-emerald-400 font-mono tracking-tight">
                {fmt(reportsCount)}
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1">
                Your Logged Intel
              </p>
              
              {!isEditing && (
                <Button 
                  onClick={() => setIsEditing(true)}
                  className="mt-5 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                  size="sm"
                >
                  <Edit3 size={11} className="mr-1.5" /> Edit Profile
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Edit profile form sliding drawer */}
        <AnimatePresence>
          {isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6 shadow-xl">
                <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white border-b border-white/5 pb-2">
                    Update Details
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="prof-username">
                        Username (Agent Alias)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-500 font-mono text-xs">@</span>
                        <input
                          type="text"
                          id="prof-username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                          placeholder="alias"
                          className="w-full h-10 rounded-xl border border-white/5 bg-slate-950/60 pl-8 pr-4 text-xs font-semibold text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-emerald-500/30 focus-visible:ring-1 focus-visible:ring-emerald-500/20 transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="prof-website">
                        Website URL
                      </label>
                      <input
                        type="url"
                        id="prof-website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full h-10 rounded-xl border border-white/5 bg-slate-950/60 px-4 text-xs font-semibold text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-emerald-500/30 focus-visible:ring-1 focus-visible:ring-emerald-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="prof-bio">
                        Short Bio
                      </label>
                      <span className="text-[9px] font-mono font-bold text-slate-500">{bio.length} / 160</span>
                    </div>
                    <textarea
                      id="prof-bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.substring(0, 160))}
                      placeholder="Security researcher, web defender..."
                      className="w-full h-16 rounded-xl border border-white/5 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-emerald-500/30 focus-visible:ring-1 focus-visible:ring-emerald-500/20 transition-all resize-none leading-relaxed"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button 
                      type="submit"
                      className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 active:scale-95 shadow-md shadow-emerald-600/10 border border-emerald-500/10"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="animate-spin" size={12} />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save size={12} />
                          <span>Save Changes</span>
                        </>
                      )}
                    </Button>
                    <Button 
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="h-9 px-5 rounded-xl bg-slate-850 hover:bg-slate-850 text-slate-400 text-[10px] font-bold uppercase tracking-wider active:scale-95 border border-white/5"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User's Reports Table logs */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-white/[0.06] bg-slate-900/40 backdrop-blur-xl flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 md:px-6 border-b border-white/5 bg-slate-950/20 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <List size={14} className="text-emerald-400" /> Your Telemetry Logs
            </span>
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider font-mono">
              Filtered by @{profile?.username || username || user.email?.split('@')[0]}
            </span>
          </div>

          <div className="overflow-x-auto">
            {loadingReports ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="animate-spin text-emerald-500 mb-3" size={24} />
                <p className="text-[10px] tracking-wider text-slate-500 font-bold uppercase">Retrieving your feed...</p>
              </div>
            ) : myReports.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <ShieldAlert size={40} className="mx-auto mb-3 text-slate-600 opacity-40 animate-pulse" />
                <h4 className="text-white font-bold text-sm mb-1">No Submissions Recorded</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  You haven't reported any target IPs under your username alias @{profile?.username || username || user.email?.split('@')[0]} yet.
                </p>
                <Link 
                  to="/report" 
                  className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-cyan-400 hover:text-cyan-300 mt-4 hover:underline"
                >
                  Submit your first IP
                </Link>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="text-[9px] uppercase bg-white/[0.01] text-slate-500 font-bold border-b border-white/5 tracking-widest select-none">
                  <tr>
                    <th className="px-6 py-4.5">IP Address</th>
                    <th className="px-6 py-4.5">Category</th>
                    <th className="px-6 py-4.5">Context</th>
                    <th className="px-6 py-4.5 text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {myReports.map((row, idx) => (
                    <tr 
                      key={row.id || row.created_at} 
                      className="hover:bg-white/[0.01] transition-colors group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-200 flex items-center gap-2 text-sm">
                          <span>{row.ip}</span>
                          
                          <button
                            type="button"
                            onClick={() => handleCopyIp(row.ip)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 w-5 h-5 flex items-center justify-center"
                            title="Copy IP address"
                          >
                            {copiedIp === row.ip ? (
                              <Check size={11} className="text-emerald-400" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {row.category.split(', ').map((cat: string) => (
                            <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded text-[9.5px] font-bold tracking-wider ${getCategoryColor(cat)}`}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 max-w-[200px] sm:max-w-xs md:max-w-sm">
                        {row.comment ? (
                          <span className="flex items-start gap-1.5 text-slate-400">
                            <AlertTriangle size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
                            <span className="whitespace-normal leading-relaxed font-medium">{row.comment}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 italic text-[11px] font-medium">No Context Recorded</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium text-right group-hover:text-slate-400 transition-colors">
                        {timeAgo(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </div>
    </main>
  )
}
