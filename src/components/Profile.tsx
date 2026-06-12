import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Globe, Edit3, Save, Copy, Check, ExternalLink, ArrowLeft, Loader2
} from 'lucide-react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import supabaseClient from '../supabaseClient'
import { Button } from '@/components/ui/button'
import { fmt, timeAgo } from '../utils'

const getUserBadges = (profile: any, reportsCount: number, joinIndex: number | null) => {
  const badges = [];

  // 1. Join Order Badges (First, Second, Third Blood)
  if (joinIndex === 0) {
    badges.push({
      id: 'first-blood',
      name: 'First Blood',
      desc: 'First user to join ThreatBase',
      style: 'from-rose-500/20 to-red-600/30 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    });
  } else if (joinIndex === 1) {
    badges.push({
      id: 'second-blood',
      name: 'Second Blood',
      desc: 'Second user to join ThreatBase',
      style: 'from-orange-500/20 to-amber-600/30 text-orange-400 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" fill="currentColor" fillOpacity="0.2" />
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    });
  } else if (joinIndex === 2) {
    badges.push({
      id: 'third-blood',
      name: 'Third Blood',
      desc: 'Third user to join ThreatBase',
      style: 'from-amber-500/20 to-yellow-600/30 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    });
  }

  // 2. Activity Badges (Legend, Elite, Pro, Defender, Initiate)
  if (reportsCount >= 500) {
    badges.push({
      id: 'legend',
      name: 'Legend',
      desc: 'Submitted 500+ threat reports',
      style: 'from-yellow-300/20 via-amber-400/20 to-yellow-600/30 text-yellow-400 border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.25)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    });
  } else if (reportsCount >= 300) {
    badges.push({
      id: 'elite',
      name: 'Elite',
      desc: 'Submitted 300+ threat reports',
      style: 'from-purple-500/20 to-fuchsia-600/30 text-purple-400 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.25)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 12l10 10 10-10L12 2z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 2L2 12l10 10 10-10L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    });
  } else if (reportsCount >= 100) {
    badges.push({
      id: 'pro',
      name: 'Pro',
      desc: 'Submitted 100+ threat reports',
      style: 'from-cyan-500/20 to-blue-600/30 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.25)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" fillOpacity="0.2" />
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    });
  } else if (reportsCount >= 50) {
    badges.push({
      id: 'defender',
      name: 'Defender',
      desc: 'Submitted 50+ threat reports',
      style: 'from-emerald-500/20 to-teal-600/30 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.25)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    });
  } else {
    badges.push({
      id: 'initiate',
      name: 'Initiate',
      desc: 'Starting threat intelligence contributor',
      style: 'from-slate-800/40 to-slate-900/40 text-slate-400 border-slate-800',
      icon: (
        <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1" />
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    });
  }

  // 3. Community Helper Badge
  const isHelper = profile?.is_helper === true || 
                   profile?.role === 'helper' || 
                   profile?.username === 'kalidada18' || 
                   profile?.username?.toLowerCase().includes('admin') ||
                   profile?.username?.toLowerCase().includes('helper') ||
                   profile?.bio?.toLowerCase().includes('helper') ||
                   profile?.bio?.toLowerCase().includes('moderator');
  if (isHelper) {
    badges.push({
      id: 'helper',
      name: 'Community Helper',
      desc: 'Recognized community helper',
      style: 'from-pink-500/20 to-rose-600/30 text-pink-400 border-pink-500/30 shadow-[0_0_15px_rgba(244,63,94,0.25)]',
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" fillOpacity="0.2" />
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    });
  }

  return badges;
}

export default function Profile({ addToast }: any) {
  const navigate = useNavigate()
  const { username: paramUsername } = useParams<{ username?: string }>()
  const { user, profile: authProfile, loading: authLoading, refreshProfile, signOut } = useAuth()

  // Profile Data
  const [viewedProfile, setViewedProfile] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [profileNotFound, setProfileNotFound] = useState(false)
  const isOwnProfile = !paramUsername || (authProfile?.username === paramUsername)

  // Profile Edit fields
  const [editUsername, setEditUsername] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Submissions state
  const [reports, setReports] = useState<any[]>([])
  const [reportsCount, setReportsCount] = useState(0)
  const [loadingReports, setLoadingReports] = useState(true)
  const [copiedIp, setCopiedIp] = useState<string | null>(null)
  
  // Join index for badges
  const [joinIndex, setJoinIndex] = useState<number | null>(null)

  // Account Deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Block anonymous access if trying to view own profile
  useEffect(() => {
    if (!authLoading && !paramUsername && !user) {
      addToast('Please sign in to access your profile account', 'error')
      navigate('/')
    }
  }, [user, authLoading, paramUsername, navigate, addToast])

  // Fetch Public or Private Profile
  useEffect(() => {
    async function loadProfile() {
      if (authLoading) return
      
      if (!paramUsername) {
        if (user) {
          setViewedProfile(authProfile)
          setLoadingProfile(false)
        }
        return
      }

      setLoadingProfile(true)
      try {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('username', paramUsername)
          .single()

        if (error) throw error
        setViewedProfile(data)
      } catch (err) {
        console.error('Failed to load profile:', err)
        setProfileNotFound(true)
      } finally {
        setLoadingProfile(false)
      }
    }
    loadProfile()
  }, [paramUsername, authLoading, authProfile, user])

  // Sync state values on profile load for editing
  useEffect(() => {
    if (isOwnProfile) {
      if (authProfile) {
        setEditUsername(authProfile.username || '')
        setEditBio(authProfile.bio || '')
        setEditWebsite(authProfile.website || '')
      } else if (user) {
        const fallback = user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
        setEditUsername(fallback.replace(/[^a-zA-Z0-9_-]/g, ''))
      }
    }
  }, [authProfile, user, isOwnProfile])

  // Fetch reports submitted by this user
  useEffect(() => {
    async function loadReports() {
      const targetUsername = paramUsername || authProfile?.username || user?.email?.split('@')[0]
      if (!supabaseClient || !targetUsername || loadingProfile) {
        if (!loadingProfile) setLoadingReports(false)
        return
      }
      setLoadingReports(true)
      try {
        const { data, error, count } = await supabaseClient
          .from('reported_ips')
          .select('*', { count: 'exact' })
          .eq('reporter_alias', targetUsername)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (data) {
          setReports(data)
          setReportsCount(count || data.length)
        }
      } catch (err) {
        console.error('Failed to load user reports:', err)
      } finally {
        setLoadingReports(false)
      }
    }

    loadReports()
  }, [paramUsername, authProfile, user, loadingProfile])

  // Fetch join order to identify First/Second/Third Blood
  useEffect(() => {
    async function loadJoinOrder() {
      if (!supabaseClient || !viewedProfile?.id) return
      try {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('id')
          .order('created_at', { ascending: true })
        if (error) throw error
        if (data) {
          const idx = data.findIndex((p: any) => p.id === viewedProfile.id)
          if (idx !== -1) {
            setJoinIndex(idx)
          }
        }
      } catch (err) {
        console.error('Failed to load join order:', err)
      }
    }
    loadJoinOrder()
  }, [viewedProfile])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseClient || !user) return

    if (editUsername.trim().length < 3) {
      addToast('Username alias must be at least 3 characters long', 'error')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabaseClient
        .from('profiles')
        .upsert({
          id: user.id,
          username: editUsername.trim(),
          bio: editBio.trim() || null,
          website: editWebsite.trim() || null,
          full_name: authProfile?.full_name || user.user_metadata?.full_name || null,
          avatar_url: authProfile?.avatar_url || user.user_metadata?.avatar_url || null,
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

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'delete my account' || !supabaseClient || !user) return
    setDeleting(true)
    try {
      const { error } = await supabaseClient.rpc('delete_user')
      if (error) throw error

      addToast('Your account and profile have been permanently deleted.', 'success')
      await signOut()
      navigate('/')
    } catch (err: any) {
      console.error('Failed to delete account:', err)
      addToast('Failed to delete account: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
      setDeleteInput('')
    }
  }

  if (authLoading || loadingProfile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F19] text-slate-400">
        <Loader2 className="animate-spin text-slate-600 mb-4" size={24} />
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-500">Loading Profile...</p>
      </div>
    )
  }

  if (profileNotFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F19] text-slate-400">
        <h2 className="text-2xl font-bold text-white mb-2">Profile Not Found</h2>
        <p className="text-sm text-slate-500">The user you are looking for does not exist.</p>
        <Button onClick={() => navigate(-1)} className="mt-6 border border-white/10 bg-white/5 hover:bg-white/10 text-white" variant="outline">
          Go Back
        </Button>
      </div>
    )
  }

  const activeProfile = viewedProfile || authProfile || { user_metadata: user?.user_metadata, email: user?.email }
  const usernameDisplay = activeProfile?.username || editUsername || activeProfile?.email?.split('@')[0]

  const getCategoryColor = (cat: string) => {
    if (!cat) return 'text-slate-300'
    if (cat.includes('Brute')) return 'text-orange-400'
    if (cat.includes('Malware')) return 'text-red-400'
    if (cat.includes('DDoS')) return 'text-purple-400'
    if (cat.includes('Phish')) return 'text-blue-400'
    if (cat.includes('Scan')) return 'text-cyan-400'
    if (cat.includes('Exploit')) return 'text-amber-400'
    return 'text-slate-300'
  }

  return (
    <main className="min-h-screen pt-28 pb-24 relative bg-[#0B0F19] font-sans selection:bg-slate-800">
      <div className="mx-auto max-w-5xl px-6 relative z-10 space-y-6">
        
        {/* Navigation back */}
        <button 
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* Profile Card Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/[0.05] bg-black/40 backdrop-blur-md p-6 md:p-10 relative overflow-hidden"
        >
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
              {/* Profile Avatar */}
              <img 
                src={activeProfile?.avatar_url || activeProfile?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} 
                alt="Profile Avatar"
                className="w-24 h-24 rounded-full object-cover border border-white/10"
              />
              
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row items-center gap-3">
                  <h2 className="text-2xl font-bold text-white tracking-tight">{activeProfile?.full_name || activeProfile?.user_metadata?.full_name || 'Anonymous'}</h2>
                </div>
                
                {/* Earned Badges Row */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
                  {getUserBadges(activeProfile, reportsCount, joinIndex).map((badge) => (
                    <div
                      key={badge.id}
                      title={badge.desc}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border bg-gradient-to-r ${badge.style} cursor-help transition-all duration-300 hover:scale-[1.03] select-none`}
                    >
                      {badge.icon}
                      <span>
                        {badge.name}
                      </span>
                    </div>
                  ))}
                </div>
                
                <p className="text-sm font-semibold text-slate-500 font-mono">@{usernameDisplay}</p>
                
                {(activeProfile?.bio || editBio) && (
                  <p className="text-sm text-slate-400 max-w-lg leading-relaxed">{activeProfile?.bio || editBio}</p>
                )}

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 pt-2 text-[11px] font-medium text-slate-500">
                  {isOwnProfile && <span className="flex items-center gap-1.5">{activeProfile?.email}</span>}
                  {(activeProfile?.website || editWebsite) && (
                    <a 
                      href={activeProfile?.website || editWebsite} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
                    >
                      <Globe size={12} /> {(activeProfile?.website || editWebsite).replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {activeProfile?.created_at && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      Joined {new Date(activeProfile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center md:text-right flex-shrink-0">
              <div className="text-5xl font-light text-white tracking-tighter">
                {fmt(reportsCount)}
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mt-2">
                Intel Reports
              </p>
              
              {isOwnProfile && !isEditing && (
                <Button 
                  onClick={() => setIsEditing(true)}
                  className="mt-6 w-full border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                  variant="ghost"
                  size="sm"
                >
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Edit profile form sliding drawer */}
        <AnimatePresence>
          {isEditing && isOwnProfile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-white/[0.05] bg-black/40 p-6">
                <form onSubmit={handleSaveProfile} className="space-y-5 max-w-2xl">
                  <h3 className="text-sm font-semibold text-white">
                    Profile Settings
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-slate-400" htmlFor="prof-username">
                        Username Alias
                      </label>
                      <input
                        type="text"
                        id="prof-username"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                        className="w-full h-10 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400 transition-colors"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-slate-400" htmlFor="prof-website">
                        Website URL
                      </label>
                      <input
                        type="url"
                        id="prof-website"
                        value={editWebsite}
                        onChange={(e) => setEditWebsite(e.target.value)}
                        placeholder="https://"
                        className="w-full h-10 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-semibold text-slate-400" htmlFor="prof-bio">
                        Bio
                      </label>
                      <span className="text-[10px] text-slate-600">{editBio.length}/160</span>
                    </div>
                    <textarea
                      id="prof-bio"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value.substring(0, 160))}
                      className="w-full h-20 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400 transition-colors resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button 
                      type="submit"
                      className="h-9 px-6 rounded-md bg-white hover:bg-slate-200 text-black text-xs font-semibold"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button 
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="h-9 px-6 rounded-md bg-transparent hover:bg-white/5 text-slate-300 text-xs font-semibold border border-white/10"
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-white/[0.05] bg-black/40 flex flex-col overflow-hidden"
        >
          <div className="p-5 border-b border-white/[0.05] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Submissions Log
            </h3>
          </div>

          <div className="overflow-x-auto min-h-[200px]">
            {loadingReports ? (
              <div className="py-24 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="animate-spin mb-3" size={20} />
                <p className="text-xs">Loading records...</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="py-24 text-center text-slate-500 flex flex-col items-center">
                <p className="text-sm text-slate-400">No submissions found for this user.</p>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase text-slate-500 font-semibold border-b border-white/[0.05]">
                  <tr>
                    <th className="px-6 py-4 font-normal">Indicator</th>
                    <th className="px-6 py-4 font-normal">Category</th>
                    <th className="px-6 py-4 font-normal">Context</th>
                    <th className="px-6 py-4 text-right font-normal">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {reports.map((row) => (
                    <tr 
                      key={row.id || row.created_at} 
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-mono text-slate-200 flex items-center gap-2">
                          <span>{row.ip}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyIp(row.ip)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-white"
                          >
                            {copiedIp === row.ip ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {(row.category || 'Other').split(', ').map((cat: string) => (
                            <span key={cat} className={`text-[11px] ${getCategoryColor(cat)}`}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 max-w-sm truncate">
                        {row.comment || <span className="text-slate-600 italic">No context</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-right whitespace-nowrap">
                        {timeAgo(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>

        {/* Danger Zone */}
        {isOwnProfile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-red-500/10 bg-red-500/5 p-6 md:p-8"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-red-400">
                  Delete Account
                </h3>
                <p className="text-xs text-slate-400 max-w-md">
                  Permanently remove your profile and detach your alias from all logs.
                </p>
              </div>
              
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="outline"
                className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded text-xs"
              >
                Delete Account
              </Button>
            </div>
          </motion.div>
        )}

      </div>

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md rounded-xl border border-white/10 bg-[#0B0F19] p-6 md:p-8 shadow-2xl"
            >
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold text-white">Delete Account</h4>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                    This action is permanent. Any reports associated with <span className="text-white font-mono">@{usernameDisplay}</span> will be detached.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">
                    Type "delete my account" to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    className="w-full h-10 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <Button 
                    onClick={handleDeleteAccount}
                    className="h-10 flex-1 rounded-md bg-red-500 hover:bg-red-600 text-white text-sm font-semibold"
                    disabled={deleteInput !== 'delete my account' || deleting}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteInput('')
                    }}
                    className="h-10 flex-1 rounded-md bg-transparent hover:bg-white/5 border border-white/10 text-white text-sm font-semibold"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
