import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { Crown, Search, Loader2, Check } from 'lucide-react'

/**
 * Superadmin Pro-management panel (rendered inside Profile when
 * profile.role === 'superadmin'). Talks to /api/admin/pro which verifies the
 * caller's JWT server-side — this UI is convenience, not the security boundary.
 */
type AdminUser = { id: string; email: string | null; username: string | null; role: string; is_pro: boolean }

export default function ProAdminPanel() {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const headers = () => ({
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  })

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/admin/pro?q=${encodeURIComponent(query)}`, { headers: headers() })
      if (!r.ok) throw new Error(String(r.status))
      const body = await r.json()
      setUsers(body.users ?? [])
    } catch {
      setError('Search failed.')
      setUsers(null)
    } finally {
      setBusy(false)
    }
  }

  const setPro = async (u: AdminUser, pro: boolean) => {
    setRowBusy(u.id)
    setError(null)
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/admin/pro`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ user_id: u.id, pro }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, is_pro: pro } : x)))
    } catch {
      setError('Could not change Pro status.')
    } finally {
      setRowBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed">
        Grants Bulk hunt and Pro feed entitlements. Flip a user, then have them revoke + regenerate their key in
        Profile to reveal the Pro feed URL (runbook: <code>db/pro_admin.md</code>).
      </p>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="email or username fragment"
          spellCheck={false}
          className="flex-1 bg-slate-950/50 border border-white/[0.08] rounded-lg px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Find
        </button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {users && (
        <ul className="divide-y divide-white/[0.05]">
          {users.length === 0 && <li className="py-3 text-xs text-slate-500">No accounts match.</li>}
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-slate-200">{u.email || u.username || u.id}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {u.username ? `@${u.username} · ` : ''}{u.role}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void setPro(u, !u.is_pro)}
                disabled={rowBusy === u.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 ${
                  u.is_pro
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                {rowBusy === u.id ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : u.is_pro ? <Check size={11} /> : <Crown size={11} />}
                {u.is_pro ? 'Pro — revoke' : 'Grant Pro'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
