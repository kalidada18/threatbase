import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import supabaseClient from './supabaseClient'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: any | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    if (!supabaseClient) return null
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) {
        if (error.code === 'PGRST116') {
          // Profile row doesn't exist yet, we will fallback to user_metadata
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
      const p = await fetchProfile(user.id)
      setProfile(p)
    }
  }

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }

    // Get initial session
    supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        const p = await fetchProfile(u.id)
        setProfile(p)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession)
        const u = currentSession?.user ?? null
        setUser(u)
        if (u) {
          const p = await fetchProfile(u.id)
          setProfile(p)
        } else {
          setProfile(null)
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

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabaseClient) return
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signUpWithEmail = async (email: string, password: string) => {
    if (!supabaseClient) return
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    if (!supabaseClient) return
    const { error } = await supabaseClient.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshProfile,
      }}
    >
      {children}
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
