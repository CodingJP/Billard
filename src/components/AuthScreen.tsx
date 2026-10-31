import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import type { AppState } from '../lib/types.ts'
import { inputClass } from '../styles.ts'
import { Button, ErrorText } from './ui.tsx'

function inviteKeyFromUrl(): string | null {
  const url = new URL(window.location.href)
  return url.pathname.startsWith('/join') ? url.searchParams.get('key') : null
}

export function AuthScreen({ appName, onDone }: { appName: string; onDone: (s: AppState) => void }) {
  const [inviteKey] = useState(inviteKeyFromUrl)
  const [mode, setMode] = useState<'login' | 'register'>(inviteKey ? 'register' : 'login')
  const [inviteValid, setInviteValid] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!inviteKey) return
    api
      .checkInvite(inviteKey)
      .then((r) => setInviteValid(r.valid))
      .catch(() => setInviteValid(false))
  }, [inviteKey])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const state =
        mode === 'register' && inviteKey
          ? await api.register(inviteKey, username, password)
          : await api.login(username, password)
      window.history.replaceState(null, '', '/')
      onDone(state)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Etwas ist schiefgelaufen.')
    } finally {
      setBusy(false)
    }
  }

  const registering = mode === 'register'

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-10 text-center">
        <div className="relative mx-auto mb-5 h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-neutral-700 to-black shadow-[0_10px_40px_rgba(0,0,0,0.6)]" />
          <div className="absolute inset-[26%] flex items-center justify-center rounded-full bg-white text-xl font-black text-black">8</div>
          <div className="absolute top-[14%] left-[22%] h-3 w-5 rotate-[-30deg] rounded-full bg-white/25 blur-[1px]" />
        </div>
        <p className="text-xs font-semibold tracking-[0.3em] text-felt-400 uppercase">{appName}</p>
        <h1 className="mt-2 text-3xl font-bold">{registering ? 'Willkommen am Tisch' : 'Einloggen'}</h1>
        <p className="mt-2 text-sm text-white/60">
          {registering
            ? 'Wähle einen Username und ein Passwort. Mehr brauchst du nicht.'
            : 'Neu hier? Scanne den QR-Code am Billardtisch, um ein Konto zu erstellen.'}
        </p>
      </div>

      {registering && inviteValid === false && (
        <div className="mb-4">
          <ErrorText>Dieser Einladungs-Code ist ungültig oder abgelaufen. Scanne den aktuellen QR-Code.</ErrorText>
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <input
          id="username"
          className={inputClass}
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          id="password"
          className={inputClass}
          placeholder="Passwort"
          type="password"
          autoComplete={registering ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {registering && <p className="px-1 text-xs text-white/40">Mindestens 8 Zeichen. Username: 3 bis 20 Zeichen.</p>}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !username || !password || (registering && inviteValid === false)}>
          {busy ? 'Einen Moment …' : registering ? 'Konto erstellen' : 'Einloggen'}
        </Button>
      </form>

      {inviteKey && (
        <button
          className="mt-6 text-center text-sm text-felt-400"
          onClick={() => {
            setMode(registering ? 'login' : 'register')
            setError('')
          }}
        >
          {registering ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen'}
        </button>
      )}
    </div>
  )
}
