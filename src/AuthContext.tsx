import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import supabaseClient from './supabaseClient'
import { ensureTurnstileLogin } from './lib/turnstile-gate'
import { withTimeout } from './lib/withTimeout'
import { establishSession, endSession } from './lib/session'
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
  /** Set by signOut(), cleared on the next sign-in. auth-js fires the same
   *  SIGNED_OUT event for a deliberate sign-out and for a session expiring, so
   *  the event alone cannot tell them apart — and the profile guard must not
   *  scold someone for choosing to sign out. */
  signOutIntent: React.MutableRefObject<boolean>
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

  // The access token the tb_session cookie was last minted from. TOKEN_REFRESHED
  // fires on every tab focus and hands us a NEW access_token each time, so
  // without this the mirror would POST (and rotate the server session) on every
  // focus. Comparing the token means exactly one mint per real credential change.
  const handoffToken = React.useRef<string | null>(null)

  const checkMfaLevel = async () => {
    if (!supabaseClient) return
    try {
      // Bound: like the other MFA methods this takes no signal argument, and
      // it runs inside onAuthStateChange BEFORE setLoading(false) — a stall
      // here hangs the whole app on the boot loader, not just one panel. On
      // timeout the gate stays as-is: an aal1 session already passed login,
      // and the server-side AAL claim still applies.
      const { data, error } = await withTimeout(
        supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel(),
        15_000,
        'Checking your two-factor status',
      )
      if (error) {
        console.error('Error fetching MFA level:', error)
        return
      }
      if (data.nextLevel === 'aal2' && data.currentLevel === 'aal1') {
        setRequiresMfa(true)
      } else {
        setRequiresMfa(false)
      }
    } catch (err) {
      // withTimeout rejects rather than resolving with { error }; same
      // handling — never let this throw into the onAuthStateChange callback,
      // or setLoading(false) there is unreachable.
      console.error('Error fetching MFA level:', err)
    }
  }

  const mfaVerified = () => {
    setRequiresMfa(false)
    checkMfaLevel()
  }

  const fetchProfile = async (userId: string, userObj?: User) => {
    if (!supabaseClient) return null
    try {
      // Bounded: the outer catch below handles a *rejection*, but a stalled read
      // neither rejects nor resolves, so this function never returned and the
      // caller's `setLoading(false)` never ran — the session stayed on the
      // Navbar auth skeleton and Profile's full-screen "Loading Profile" until
      // a full reload. Must precede .single(), which finalises to a builder
      // that no longer carries abortSignal.
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .abortSignal(AbortSignal.timeout(15_000))
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
                .abortSignal(AbortSignal.timeout(15_000))
                .single()
                
              if (!insertError && inserted) return inserted
              
              if (insertError?.code === '23505') { // unique violation
                const { data: inserted2, error: insertError2 } = await supabaseClient
                  .from('profiles')
                  .insert([{ ...newProfile, username: `${baseUsername}_${Math.floor(Math.random()*1000)}` }])
                  .select()
                  .abortSignal(AbortSignal.timeout(15_000))
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
      (event, currentSession) => {
        setSession(currentSession)
        const u = currentSession?.user ?? null
        setUser(u)
        if (!u) {
          setProfile(null)
          setRequiresMfa(false)
          handoffToken.current = null
          setLoading(false)
          return
        }
        signOutIntent.current = false
        // NOTHING here may be awaited inside this callback.
        //
        // auth-js awaits the callback while still holding its session lock
        // (_notifyAllSubscribers, GoTrueClient.js). Both calls below acquire that
        // same lock: getAuthenticatorAssuranceLevel() goes through getSession(),
        // and the profiles read goes through supabase-js's _getAccessToken().
        // Awaiting them here deadlocks the two against each other — the callback
        // cannot return until their 15s abortSignals fire, and until it returns
        // the lock stays held. On the configured navigatorLock that is a real
        // Web Lock, so every getSession() in that 15s window queues behind it.
        // That is what pinned ReportIP's submit to its own 12s ceiling
        // ("Checking your session timed out after 12s") and failed comment
        // posting the same way — both lose the race against a 15s hold.
        //
        // auth-js only protects the INITIAL_SESSION path (its init notification
        // queue defers callbacks until initializePromise resolves). Every later
        // event — TOKEN_REFRESHED from auto-refresh or a focus/visibility regain —
        // fires with the lock genuinely held, which is why this is constant.
        //
        // setTimeout defers us off the callback, and so off the held lock, before
        // either call starts. Ordering is preserved: setLoading(false) still runs
        // only after both settle.
        setTimeout(() => {
          // The server-side session mirror, deliberately OUTSIDE the Promise.all
          // below. It is a detached, best-effort POST: boot must not wait on it,
          // and a failure must not clear the user's session — the app worked
          // before this cookie existed and still works if minting is down.
          //
          // It also must not be *awaited* anywhere in this callback for the
          // Web-Lock reason documented above; a plain fetch is not lock-guarded,
          // but keeping it unawaited means it can never reintroduce that bug.
          const accessToken = currentSession?.access_token
          if (accessToken && accessToken !== handoffToken.current) {
            handoffToken.current = accessToken
            void establishSession(accessToken, currentSession?.refresh_token).then((ok) => {
              // Reset on failure so the next auth event retries rather than
              // concluding forever that this token was already handed off.
              if (!ok) handoffToken.current = null
            })
          }
          // Independent round-trips: run them in parallel so boot (and every
          // TOKEN_REFRESHED) waits on the slower one, not their sum.
          void Promise.all([checkMfaLevel(), fetchProfile(u.id, u)]).then(
            ([, p]) => {
              setProfile(p)
              setLoading(false)
            },
            // Both helpers catch internally, so this should be unreachable — but
            // a rejection here would strand setLoading(false) exactly as the
            // deadlock did, and the boot loader would never clear.
            () => setLoading(false),
          )
        }, 0)
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

  const signOutIntent = React.useRef(false)

  // scope:'local' (default global in auth-js v2 revokes EVERY session on
  // every device — the MFA-dismiss button was wiping all logins, the
  // "logged out again and again" loop). Deliberate sign-outs stay global.
  const signOut = async (opts?: { scope: 'global' | 'local' }) => {
    if (!supabaseClient) return
    signOutIntent.current = true
    // Fire the mirrored revocation first and detached. It needs only the HttpOnly
    // cookie (not the JWT auth-js is about to destroy), and it must never be able
    // to block or fail the sign-out the visitor actually asked for. 'global' maps
    // to revoking every device, which is what "sign me out everywhere" means now
    // that a revocable session exists; 'local' (the MFA-dismiss path) maps to
    // this device only, preserving the behaviour that fixed the logout loop.
    //
    // Before, not after the await, on purpose: a detached fetch queued after a
    // successful sign-out can be cancelled by the navigation or reload the caller
    // performs next, which would leave a live session row behind a logged-out UI.
    // The failure mode of choosing this way round is milder — if auth.signOut()
    // then fails, other devices were revoked while this one stays signed in, and
    // the next auth event re-mints it. A credential that outlives a logout is the
    // one that must not happen.
    handoffToken.current = null
    void endSession((opts?.scope ?? 'global') === 'local' ? undefined : 'all')
    const { error } = await supabaseClient.auth.signOut(opts ?? { scope: 'global' })
    if (error) {
      // The sign-out failed, so the session is still live. Leaving the intent
      // set would silence the profile guard for a later expiry instead.
      signOutIntent.current = false
      throw error
    }
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
        signOutIntent,
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
