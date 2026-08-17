import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Copy, Check, ArrowLeft, Loader2, Key, Trash2, AlertTriangle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import supabaseClient from '../supabaseClient'
import { Button } from '@/components/ui/button'
import { fmt, timeAgo, categoryTier, TIER_TEXT } from '../utils'
import { useSEO } from '../useSEO'
import MfaSetup from './MfaSetup'
import NotFound from './ui/not-found'

/**
 * Sanitise a user-supplied URL so it can never trigger script execution.
 * Only http: and https: protocols are allowed; everything else (javascript:,
 * data:, vbscript:, etc.) is stripped to '#'.
 */
const safeHref = (url: string | undefined | null): string => {
  if (!url) return '#'
  try {
    const parsed = new URL(url, 'https://placeholder.invalid')
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

/**
 * Royal medal hierarchy. One coherent metal ramp (gold → platinum → bronze →
 * steel) plus the single house accent (ruby). No candy colors — every tier
 * reads as a struck medal, keeping the page's accent lock intact.
 */
const TIER = {
  gold: 'from-amber-200/[0.18] to-amber-500/[0.06] text-amber-200 border-amber-300/25 shadow-[0_0_22px_-6px_rgba(245,200,90,0.4)]',
  platinum: 'from-platinum-200/[0.18] to-platinum-400/[0.06] text-platinum-200 border-platinum-300/25 shadow-[0_0_22px_-8px_rgba(205,211,222,0.35)]',
  bronze: 'from-orange-600/[0.16] to-amber-900/[0.08] text-orange-300 border-orange-600/25 shadow-[0_0_20px_-8px_rgba(234,140,70,0.3)]',
  ruby: 'from-red-500/[0.16] to-red-800/[0.1] text-red-300 border-red-500/30 shadow-[0_0_22px_-7px_rgba(207,23,51,0.45)]',
  steel: 'from-slate-300/[0.1] to-slate-500/[0.05] text-slate-200 border-slate-400/20 shadow-[0_0_18px_-9px_rgba(199,204,214,0.25)]',
  slate: 'from-slate-700/25 to-slate-800/20 text-slate-400 border-slate-600/25',
} as const

const getUserBadges = (profile: any, reportsCount: number, joinIndex: number | null) => {
  const badges = [];

  // 1. Join Order Badges (First, Second, Third Blood)
  if (joinIndex === 0) {
    badges.push({
      id: 'first-blood',
      name: 'First Blood',
      desc: 'First user to join ThreatBase',
      style: TIER.gold,
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
      style: TIER.platinum,
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
      style: TIER.bronze,
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
      style: TIER.gold,
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
      style: TIER.platinum,
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
      style: TIER.steel,
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
      style: TIER.steel,
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
      style: TIER.slate,
      icon: (
        <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    });
  }

  // 3. Community Helper Badge — granted only from trusted, server-controlled
  // fields. Never derived from user-editable bio/username text, which is
  // trivially spoofable by editing your own profile.
  const isHelper =
    profile?.is_helper === true ||
    profile?.role === 'helper' ||
    profile?.role === 'moderator' ||
    profile?.role === 'admin';
  if (isHelper) {
    badges.push({
      id: 'helper',
      name: 'Community Helper',
      desc: 'Recognized community helper',
      style: TIER.ruby,
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

// Derive up to two uppercase initials from a display name.
const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Avatar that renders the user's image when present, otherwise a stable
// initials placeholder. Also falls back to initials if the image fails to load.
function ProfileAvatar({ src, name }: { src?: string; name: string }) {
  const [errored, setErrored] = useState(false)
  const showImage = src && !errored

  return (
    <div className="relative shrink-0">
      {/* Cool platinum halo behind the medallion */}
      <div className="pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-b from-platinum-300/20 to-transparent blur-md" />
      <div className="relative w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-950 ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_30px_-12px_rgba(0,0,0,0.8)]">
        {showImage ? (
          <img
            src={src}
            alt={`${name}'s avatar`}
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-2xl font-semibold text-platinum-200 select-none tracking-tight">
            {getInitials(name)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Profile({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const navigate = useNavigate()
  const { username: paramUsername } = useParams<{ username?: string }>()
  const { user, profile: authProfile, loading: authLoading, refreshProfile, signOut } = useAuth()

  // Profile Data
  const [viewedProfile, setViewedProfile] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Resolve the signed-in user's own handle from their profile row, falling
  // back to OAuth metadata / email — the same precedence used elsewhere in this
  // component. Used to decide whether a visited /u/:username belongs to them.
  const ownUsername =
    authProfile?.username ||
    user?.user_metadata?.user_name ||
    user?.user_metadata?.preferred_username ||
    user?.email?.split('@')[0] ||
    null
  // Case-insensitive match: the DB stores usernames in the [A-Za-z0-9_-] charset,
  // so only case can legitimately differ between the stored handle and the URL —
  // lowercasing both sides avoids 403-ing an owner who reaches /u/<Name> vs the
  // stored <name>. This can only ever match your OWN handle, and the own view
  // renders authProfile (not a by-username fetch), so it can never leak data.
  const isOwnProfile =
    !paramUsername ||
    (!!ownUsername && ownUsername.toLowerCase() === paramUsername.toLowerCase())

  // Profiles are private to their owner. A /u/:username (or /profile/:username)
  // view that is NOT the current user's own profile is forbidden → render a 403
  // and never fetch that user's data. We can only decide this once auth has
  // finished resolving, so the owner never flashes a 403 on their own page.
  const isForbidden = !!paramUsername && !authLoading && !isOwnProfile

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

  // API Key state
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [loadingApiKeys, setLoadingApiKeys] = useState(false)
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)
  const [hasMfaEnrolled, setHasMfaEnrolled] = useState(false)

  // Block anonymous access if trying to view own profile
  useEffect(() => {
    if (!authLoading && !paramUsername && !user) {
      addToast('Please sign in to access your profile account', 'error')
      navigate('/')
    }
  }, [user, authLoading, paramUsername, navigate, addToast])

  // Load the current user's OWN profile. Other users' profiles are private:
  // they are gated to a 403 above and are never fetched here.
  useEffect(() => {
    async function loadProfile() {
      if (authLoading) return

      // Forbidden views (someone else's profile) render a 403 and must never
      // fetch that user's data over the network.
      if (isForbidden) {
        setViewedProfile(null)
        setLoadingProfile(false)
        return
      }

      // Every non-forbidden view is the user's OWN profile — with or without a
      // :username param. Render the in-memory authProfile (loaded by auth.uid()
      // in AuthContext) instead of querying by the URL handle: this avoids any
      // attacker-controlled lookup and preserves owner-only fields like email.
      if (user) {
        setViewedProfile(authProfile)
        setLoadingProfile(false)
      }
    }
    loadProfile()
  }, [authLoading, authProfile, user, isForbidden])

  // Sync state values on profile load for editing
  useEffect(() => {
    if (isOwnProfile) {
      if (authProfile) {
        setEditUsername(authProfile.username || '')
        setEditBio(authProfile.bio || '')
        setEditWebsite(authProfile.website || '')
      } else if (user) {
        const fallback = user.user_metadata?.user_name || user.user_metadata?.preferred_username || user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || ''
        setEditUsername(fallback.replace(/[^a-zA-Z0-9_-]/g, ''))
      }
    }
  }, [authProfile, user, isOwnProfile])

  // Fetch reports submitted by this user
  useEffect(() => {
    async function loadReports() {
      // Don't load (or expose) another user's submission log on a forbidden view.
      if (isForbidden) { setLoadingReports(false); return }
      // Non-forbidden ⇒ own profile; use the canonical own alias (not the URL
      // param, which may differ only by case).
      const targetUsername = authProfile?.username || user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || user?.email?.split('@')[0]
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
  }, [authProfile, user, loadingProfile, isForbidden])

  // Fetch join order to identify First/Second/Third Blood.
  // Only fetch the first 3 accounts ever created — avoids leaking every user ID.
  useEffect(() => {
    async function loadJoinOrder() {
      if (!supabaseClient || !viewedProfile?.id) return
      try {
        // Join-order badge needs only the first 3 account ids. profiles is
        // owner-only readable, so go through a security-definer RPC that returns
        // just those ids (no PII, no full-table read).
        const { data, error } = await supabaseClient
          .rpc('first_user_ids')
        if (error) throw error
        if (data) {
          const idx = data.findIndex((p: any) => p.id === viewedProfile.id)
          // idx will be 0, 1, 2 for the first three users, or -1 for everyone else
          setJoinIndex(idx !== -1 ? idx : null)
        }
      } catch (err) {
        console.error('Failed to load join order:', err)
      }
    }
    loadJoinOrder()
  }, [viewedProfile])

  // Fetch API Keys
  useEffect(() => {
    async function loadApiKeys() {
      if (!isOwnProfile || !user || !supabaseClient) return
      setLoadingApiKeys(true)
      try {
        const { data, error } = await supabaseClient
          .from('api_keys')
          .select('*')
          .eq('is_active', true)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (data) {
          setApiKeys(data)
        }
      } catch (err) {
        console.error('Failed to load API keys:', err)
      } finally {
        setLoadingApiKeys(false)
      }
    }
    loadApiKeys()
  }, [isOwnProfile, user, supabaseClient])

  // Check MFA enrollment status
  useEffect(() => {
    async function checkMfaStatus() {
      if (!isOwnProfile || !user || !supabaseClient) return
      try {
        const { data } = await supabaseClient.auth.mfa.listFactors()
        const verifiedFactor = data?.totp?.find((f) => f.status === 'verified')
        setHasMfaEnrolled(!!verifiedFactor)
      } catch (err) {
        console.error('Failed to check MFA status:', err)
      }
    }
    checkMfaStatus()
  }, [isOwnProfile, user, supabaseClient])

  const handleGenerateApiKey = async () => {
    if (!supabaseClient || !user) return
    setGeneratingKey(true)
    try {
      // 1. Generate Plain Text Key
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const randomStr = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const plainKey = `tb_api_${randomStr}`;

      // 2. Hash the key
      const encoder = new TextEncoder();
      const data = encoder.encode(plainKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 3. Insert into Supabase
      const { data: newKeyData, error } = await supabaseClient
        .from('api_keys')
        .insert([{ user_id: user.id, key_hash: hashHex, prefix: plainKey.substring(0, 15) }])
        .select()
        .single()

      if (error) {
        if (error.message?.includes('row-level security policy') || error.message?.includes('Enforce MFA')) {
          throw new Error('You must enable Two-Factor Authentication before generating API keys.')
        }
        throw error
      }

      setApiKeys([newKeyData, ...apiKeys])
      setNewlyGeneratedKey(plainKey)
      addToast('API Key generated successfully!', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to generate API Key', 'error')
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleRevokeApiKey = async (id: string) => {
    if (!supabaseClient || !user) return
    try {
      // Scope revocation to the current user's keys to prevent IDOR attacks
      const { error } = await supabaseClient
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      setApiKeys(apiKeys.filter(k => k.id !== id))
      addToast('API Key revoked successfully', 'success')
      setNewlyGeneratedKey(null)
    } catch (err: any) {
      addToast('Failed to revoke key: ' + err.message, 'error')
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseClient || !user) return

    if (editUsername.trim().length < 3) {
      addToast('Username alias must be at least 3 characters long', 'error')
      return
    }

    setSaving(true)

    // Validate website URL protocol before saving
    const trimmedWebsite = editWebsite.trim()
    if (trimmedWebsite && safeHref(trimmedWebsite) === '#') {
      addToast('Website URL must use http:// or https://', 'error')
      setSaving(false)
      return
    }

    try {
      // Rely on the DB UNIQUE constraint on username to prevent duplicates.
      // This eliminates the TOCTOU race condition of a separate check-then-insert.
      const { error } = await supabaseClient
        .from('profiles')
        .upsert({
          id: user.id,
          username: editUsername.trim(),
          bio: editBio.trim() || null,
          website: trimmedWebsite || null,
          full_name: authProfile?.full_name || user.user_metadata?.full_name || null,
          avatar_url: authProfile?.avatar_url || user.user_metadata?.avatar_url || null,
          updated_at: new Date().toISOString()
        })

      if (error) {
        // Handle unique constraint violation (username already taken)
        if (error.code === '23505') {
          addToast('This username alias is already taken by another user', 'error')
          setSaving(false)
          return
        }
        throw error
      }

      // SECURITY: The alias migration for reported_ips (renaming old reports to
      // the new username) MUST be handled by a server-side RPC function that
      // validates ownership via auth.uid(). We no longer do this client-side
      // because the anon key + permissive RLS could allow report hijacking.
      const oldUsername = authProfile?.username || user.email?.split('@')[0] || '';
      const newUsername = editUsername.trim();
      if (oldUsername && oldUsername !== newUsername) {
        const { error: migrateError } = await supabaseClient.rpc('migrate_reporter_alias', {
          p_old_alias: oldUsername,
          p_new_alias: newUsername,
        })
        if (migrateError) {
          console.error('Failed to migrate report alias (server-side):', migrateError)
        }
      }

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

  // Copy a secret (e.g. a freshly generated API key) WITHOUT echoing its value
  // into a toast. Toasts can be screenshotted, screen-recorded, or captured by
  // logging, so the plaintext key must never appear in user-facing chrome.
  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret)
    setCopiedIp(secret)
    addToast('API key copied to clipboard!', 'success')
    setTimeout(() => setCopiedIp(null), 1500)
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'delete my account' || !supabaseClient || !user) return
    setDeleting(true)
    try {
      // SECURITY: The delete_user RPC should handle reassigning reports to
      // 'deletedaccount' internally. We no longer do this client-side because
      // a malicious client could reassign any user's reports via the anon key.
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

  const activeProfile = viewedProfile || authProfile || { user_metadata: user?.user_metadata, email: user?.email }
  const usernameDisplay = activeProfile?.username || editUsername || activeProfile?.email?.split('@')[0] || 'User'

  useSEO({
    title: isForbidden ? 'Access Denied | Threatbase' : `${usernameDisplay}'s Profile | Threatbase`,
    description: isForbidden
      ? 'This profile is private to its owner.'
      : `View ${usernameDisplay}'s threat intelligence contributions, badges, and activity on Threatbase.`,
    path: `/u/${paramUsername || usernameDisplay}`,
    noindex: true,
  })

  // Wait for the session to resolve before deciding anything — prevents the
  // owner from flashing a 403 on their own profile during auth load.
  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-app text-slate-400">
        <Loader2 className="animate-spin text-red-400/70 mb-4" size={24} />
        <p className="text-[11px] font-semibold tracking-[0.24em] uppercase text-platinum-400">Loading Profile</p>
      </div>
    )
  }

  // 403 — you may only view your own profile.
  if (isForbidden) {
    return (
      <NotFound
        code="403"
        title="Access denied."
        description="This profile is private. You can only view your own Threatbase profile."
        cta="Return home"
        href="/"
      />
    )
  }

  if (loadingProfile) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-app text-slate-400">
        <Loader2 className="animate-spin text-red-400/70 mb-4" size={24} />
        <p className="text-[11px] font-semibold tracking-[0.24em] uppercase text-platinum-400">Loading Profile</p>
      </div>
    )
  }

  const getCategoryColor = (cat: string) => TIER_TEXT[categoryTier(cat)]

  return (
    <main className="min-h-[100dvh] pt-28 pb-24 relative bg-app font-sans">
      <div className="mx-auto max-w-5xl px-6 relative z-10 space-y-6 md:space-y-8">

        {/* Navigation back */}
        <button
          onClick={() => navigate(-1)}
          className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 hover:text-platinum-200 transition-colors"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" /> Back
        </button>

        {/* Profile Card Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 md:p-10 overflow-hidden"
        >
          {/* Top platinum sheen + ruby ambient corner — flagship depth */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ background: 'radial-gradient(120% 90% at 100% 0%, rgba(207, 23, 51, 0.08), transparent 55%)' }}
          />
          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
              {/* Profile Avatar */}
              <ProfileAvatar
                src={activeProfile?.avatar_url || activeProfile?.user_metadata?.avatar_url}
                name={activeProfile?.full_name || activeProfile?.user_metadata?.full_name || usernameDisplay}
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
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-[0.12em] border bg-gradient-to-b backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${badge.style} cursor-help transition-transform duration-300 hover:scale-[1.04] select-none`}
                    >
                      {badge.icon}
                      <span>
                        {badge.name}
                      </span>
                    </div>
                  ))}
                </div>
                
                <p className="text-sm font-semibold text-platinum-400 font-mono tracking-tight">@{usernameDisplay}</p>
                
                {(activeProfile?.bio || editBio) && (
                  <p className="text-sm text-slate-400 max-w-lg leading-relaxed">{activeProfile?.bio || editBio}</p>
                )}

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 pt-2 text-[11px] font-medium text-slate-500">
                  {isOwnProfile && <span className="flex items-center gap-1.5">{activeProfile?.email}</span>}
                  {(activeProfile?.website || editWebsite) && safeHref(activeProfile?.website || editWebsite) !== '#' && (
                    <a 
                      href={safeHref(activeProfile?.website || editWebsite)} 
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
              <div className="text-5xl md:text-6xl font-extralight text-metal tracking-tighter tabular-nums leading-none">
                {fmt(reportsCount)}
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-platinum-400 mt-3">
                Intel Reports
              </p>

              {isOwnProfile && !isEditing && (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="mt-6 w-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-platinum-200 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
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
              <div className="glass-card p-6 md:p-8">
                <form onSubmit={handleSaveProfile} className="space-y-5 max-w-2xl">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
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
                        className="w-full h-10 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15 transition-all"
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
                        className="w-full h-10 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15 transition-all"
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
                      className="w-full h-20 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15 transition-all resize-none"
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
          className="glass-card flex flex-col overflow-hidden"
        >
          <div className="relative px-6 py-5 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.03] to-transparent flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Submissions Log
            </h3>
            {!loadingReports && reports.length > 0 && (
              <span className="font-mono text-[11px] text-platinum-300 tabular-nums rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {fmt(reportsCount)}
              </span>
            )}
          </div>

          <div className="overflow-x-auto min-h-[200px]">
            {loadingReports ? (
              <div className="py-24 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="animate-spin text-red-400/70 mb-3" size={20} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-platinum-400">Loading Records</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="py-24 text-center text-slate-500 flex flex-col items-center">
                <p className="text-sm text-slate-400">No submissions found for this user.</p>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="hidden md:table-header-group text-[10px] uppercase text-slate-500 font-semibold border-b border-white/[0.05]">
                  <tr>
                    <th className="px-6 py-4 font-normal">Indicator</th>
                    <th className="px-6 py-4 font-normal">Category</th>
                    <th className="px-6 py-4 font-normal">Context</th>
                    <th className="px-6 py-4 text-right font-normal">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] md:divide-white/[0.02]">
                  {reports.map((row) => (
                    <tr
                      key={row.id || row.created_at}
                      className="block md:table-row px-4 py-3 md:p-0 hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="block md:table-cell md:px-6 py-1 md:py-4 md:whitespace-nowrap">
                        <div className="font-mono text-slate-200 flex items-center gap-2 break-all md:break-normal">
                          <span>{row.ip}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyIp(row.ip)}
                            className="p-2 -m-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-slate-500 hover:text-white"
                          >
                            {copiedIp === row.ip ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td className="block md:table-cell md:px-6 py-1 md:py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(row.category || 'Other').split(', ').map((cat: string) => (
                            <span key={cat} className={`inline-flex items-center rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[11px] font-medium ${getCategoryColor(cat)}`}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="block md:table-cell md:px-6 py-1 md:py-4 text-slate-400 md:max-w-sm md:truncate">
                        {row.comment || <span className="text-slate-600 italic">No context</span>}
                      </td>
                      <td className="block md:table-cell md:px-6 py-1 md:py-4 text-slate-500 md:text-right md:whitespace-nowrap">
                        {timeAgo(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>

        {/* Security Settings */}
        {isOwnProfile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-6"
          >
            {/* MFA Setup */}
            <MfaSetup addToast={addToast} />

            {/* API Keys Setup */}
            <div className="glass-card p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 tracking-tight">
                    <span className="icon-chip h-7 w-7"><Key size={14} /></span> API Access Keys
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg">
                    Generate an API key to securely interact with the Threatbase API. Your key will only be shown once.
                  </p>
                </div>
                <Button
                  onClick={handleGenerateApiKey}
                  disabled={generatingKey || apiKeys.length >= 3 || !hasMfaEnrolled}
                  title={!hasMfaEnrolled ? "Enable Two-Factor Authentication to generate API keys" : ""}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shrink-0 h-9 shadow-glow-ruby disabled:shadow-none disabled:opacity-50"
                >
                  {generatingKey ? 'Generating...' : 'Generate API Key'}
                </Button>
              </div>

              {!hasMfaEnrolled && (
                <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500/90 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle size={14} />
                  You must enable Two-Factor Authentication above before you can generate API keys.
                </div>
              )}

              {newlyGeneratedKey && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6 relative group overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10 blur-xl bg-primary w-24 h-24 rounded-full pointer-events-none" />
                  <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-2">
                    <AlertTriangle size={14} /> Please copy this key now. You will not be able to see it again!
                  </p>
                  <div className="flex items-center gap-2 bg-black/50 border border-primary/20 p-2 rounded">
                    <code className="text-sm text-slate-200 font-mono flex-1 select-all tracking-wide">{newlyGeneratedKey}</code>
                    <button
                      onClick={() => handleCopySecret(newlyGeneratedKey)}
                      className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors"
                      title="Copy API Key"
                    >
                      {copiedIp === newlyGeneratedKey ? <Check size={14} className="text-platinum-200" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {loadingApiKeys ? (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : apiKeys.length > 0 ? (
                <div className="space-y-3">
                  {apiKeys.map(key => (
                    <div key={key.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                      <div>
                        <code className="text-xs text-slate-300 font-mono bg-black/50 px-2 py-1 rounded">{key.prefix}•••••••••••••••••</code>
                        <p className="text-[10px] text-slate-500 mt-1.5">
                          Created {new Date(key.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeApiKey(key.id)}
                        className="h-8 border-white/10 text-xs text-slate-400 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 shrink-0"
                      >
                        <Trash2 size={12} className="mr-1.5" /> Revoke
                      </Button>
                    </div>
                  ))}
                  {apiKeys.length >= 3 && (
                    <p className="text-xs text-slate-500 italic mt-4">You have reached the maximum number of active API keys (3).</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 bg-white/[0.02] border border-white/[0.05] rounded-lg p-6 text-center">
                  You don't have any active API keys.
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Danger Zone */}
        {isOwnProfile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative overflow-hidden rounded-2xl border border-destructive/15 bg-destructive/[0.04] backdrop-blur-xl p-6 md:p-8"
          >
            <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(100% 80% at 0% 0%, rgba(207,23,51,0.06), transparent 60%)' }} />
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-destructive">
                  Delete Account
                </h3>
                <p className="text-xs text-slate-400 max-w-md">
                  Permanently remove your profile and detach your alias from all logs.
                </p>
              </div>
              
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="outline"
                className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-red-300 rounded text-xs"
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
              className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0f17] p-6 md:p-8 shadow-glass-lux"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive/40 to-transparent" />
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
                    className="w-full h-10 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white focus:outline-none focus:border-destructive/50 transition-colors"
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
