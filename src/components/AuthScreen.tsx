import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import type { AppState } from '../lib/types.ts'
import { inputClass } from '../styles.ts'
import { ArrowRightIcon } from './icons.tsx'
import { Ball, Button, ErrorText } from './ui.tsx'

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
      <div className="mb-8">
        <div className="mb-6 flex -space-x-3">
          <Ball id={1} size="lg" />
          <Ball id={10} size="lg" />
          <Ball id={8} size="lg" />
        </div>
        <p className="font-mono text-[10.5px] font-semibold tracking-[0.16em] text-muted uppercase">{appName}</p>
        <h1 className="mt-2 font-display text-[44px] leading-[0.9] font-extrabold uppercase">
          {registering ? 'Willkommen am Tisch' : 'Einloggen'}
        </h1>
        <p className="mt-3 text-sm text-muted">
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
        {registering && <p className="px-1 font-mono text-[11px] text-muted">Mind. 8 Zeichen · Username 3 bis 20 Zeichen</p>}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full py-4 text-base" disabled={busy || !username || !password || (registering && inviteValid === false)}>
          {busy ? 'Einen Moment …' : registering ? 'Konto erstellen' : 'Einloggen'}
          {!busy && <ArrowRightIcon size={18} />}
        </Button>
      </form>

      {inviteKey && (
        <button
          className="mt-6 text-center text-sm font-semibold text-muted underline underline-offset-4 hover:text-fg"
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
