import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import supabaseClient from './supabaseClient'
import { ensureTurnstileLogin } from './lib/turnstile-gate'
import MfaChallengeModal from './components/MfaChallengeModal'


interface AuthContextType {
  user: User | null
  session: Session | null
  profile: any | null
  loading: boolean
  requiresMfa: boolean
  mfaVerified: () => void
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: (opts?: { scope: 'global' | 'local' }) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [requiresMfa, setRequiresMfa] = useState(false)

  const checkMfaLevel = async () => {
    if (!supabaseClient) return
    const { data, error } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      console.error('Error fetching MFA level:', error)
      return
    }
    if (data.nextLevel === 'aal2' && data.currentLevel === 'aal1') {
      setRequiresMfa(true)
    } else {
      setRequiresMfa(false)
    }
  }

  const mfaVerified = () => {
    setRequiresMfa(false)
    checkMfaLevel()
  }

  const fetchProfile = async (userId: string, userObj?: User) => {
    if (!supabaseClient) return null
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) {
        if (error.code === 'PGRST116') {
          // Profile row doesn't exist yet, auto-create it
          if (userObj) {
            try {
              const fallbackUsername = userObj.user_metadata?.user_name || userObj.user_metadata?.preferred_username || userObj.email?.split('@')[0] || `user_${Math.floor(Math.random()*10000)}`
              const baseUsername = fallbackUsername.replace(/[^a-zA-Z0-9_-]/g, '') || `user_${Math.floor(Math.random()*10000)}`
              
              const newProfile = {
                id: userObj.id,
                username: baseUsername,
                full_name: userObj.user_metadata?.full_name || null,
                avatar_url: userObj.user_metadata?.avatar_url || null,
              }
              
              const { data: inserted, error: insertError } = await supabaseClient
                .from('profiles')
                .insert([newProfile])
                .select()
                .single()
                
              if (!insertError && inserted) return inserted
              
              if (insertError?.code === '23505') { // unique violation
                const { data: inserted2, error: insertError2 } = await supabaseClient
                  .from('profiles')
                  .insert([{ ...newProfile, username: `${baseUsername}_${Math.floor(Math.random()*1000)}` }])
                  .select()
                  .single()
                if (!insertError2 && inserted2) return inserted2
              }
            } catch (err) {
              console.error('Error auto-creating profile:', err)
            }
          }
          return null
        }
        throw error
      }
      return data
    } catch (e) {
      console.error('Error fetching profile:', e)
      return null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id, user)
      setProfile(p)
    }
  }

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }

    // auth-js 2.116 delivers the current session to every new subscription as
    // a one-shot INITIAL_SESSION event, so the listener below already covers
    // boot. The getSession().then block this replaces ran the *same*
    // checkMfaLevel + fetchProfile chain on every logged-in load: two
    // serialized Supabase round-trips, twice, before first paint settled.
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession)
        const u = currentSession?.user ?? null
        setUser(u)
        if (u) {
          await checkMfaLevel()
          const p = await fetchProfile(u.id, u)
          setProfile(p)
        } else {
          setProfile(null)
          setRequiresMfa(false)
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    if (!supabaseClient) return
    const redirectTo = window.location.origin + import.meta.env.BASE_URL
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })
    if (error) throw error
  }

  const signInWithGithub = async () => {
    if (!supabaseClient) return
    const redirectTo = window.location.origin + import.meta.env.BASE_URL
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo,
        scopes: 'read:user user:email',
      },
    })
    if (error) throw error
  }

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabaseClient) return
    await ensureTurnstileLogin()
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signUpWithEmail = async (email: string, password: string) => {
    if (!supabaseClient) return
    await ensureTurnstileLogin()
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
    })
    if (error) throw error
  }

  // scope:'local' (default global in auth-js v2 revokes EVERY session on
  // every device — the MFA-dismiss button was wiping all logins, the
  // "logged out again and again" loop). Deliberate sign-outs stay global.
  const signOut = async (opts?: { scope: 'global' | 'local' }) => {
    if (!supabaseClient) return
    const { error } = await supabaseClient.auth.signOut(opts ?? { scope: 'global' })
    if (error) throw error
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        requiresMfa,
        mfaVerified,
        signInWithGoogle,
        signInWithGithub,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshProfile,
      }}
    >
      {requiresMfa ? <MfaChallengeModal /> : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
