import QRCode from 'qrcode'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import { inputClass } from '../styles.ts'
import { KeyIcon, LogOutIcon, QrIcon } from './icons.tsx'
import { Button, Card, ErrorText, SectionTitle } from './ui.tsx'

export function InviteCard({ appName }: { appName: string }) {
  const [url, setUrl] = useState('')
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api
      .invite()
      .then(async ({ joinUrl }) => {
        setUrl(joinUrl)
        setQr(await QRCode.toDataURL(joinUrl, { margin: 1, width: 480, color: { dark: '#14213d', light: '#ffffff' } }))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Fehler'))
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section>
      <SectionTitle>Einladung (Admin)</SectionTitle>
      <Card className="p-5 text-center">
        <ErrorText>{error}</ErrorText>
        {qr && (
          <>
            <div className="mx-auto w-full max-w-[240px] rounded-2xl border border-line bg-white p-3">
              <img src={qr} alt="QR-Code zur Registrierung" className="w-full" />
              <p className="mt-2 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-[#14213d] uppercase">{appName} · Scannen und mitspielen</p>
            </div>
            <p className="mt-4 text-sm text-muted">
              Druck den Code aus und häng ihn an den Tisch. Wer ihn scannt, kann ein Konto erstellen.
            </p>
            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-left font-mono text-xs break-all text-muted select-all">{url}</p>
            <Button variant="ghost" className="mt-3 w-full" onClick={copy}>
              <QrIcon size={18} />
              {copied ? 'Kopiert' : 'Link kopieren'}
            </Button>
          </>
        )}
      </Card>
    </section>
  )
}

export function AccountCard({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.changePassword(current, next)
      setMessage('Passwort geändert.')
      setCurrent('')
      setNext('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    }
  }

  return (
    <section className="space-y-3">
      <SectionTitle>Konto</SectionTitle>
      {open ? (
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3">
            <input id="current-password" type="password" autoComplete="current-password" className={inputClass} placeholder="Aktuelles Passwort" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <input id="new-password" type="password" autoComplete="new-password" className={inputClass} placeholder="Neues Passwort (mind. 8 Zeichen)" value={next} onChange={(e) => setNext(e.target.value)} />
            <ErrorText>{error}</ErrorText>
            {message && <p className="text-sm font-semibold text-good">{message}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
                Schließen
              </Button>
              <Button type="submit" className="flex-1" disabled={!current || !next}>
                Speichern
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
          <KeyIcon size={18} />
          Passwort ändern
        </Button>
      )}
      <Button variant="danger" className="w-full" onClick={onLogout}>
        <LogOutIcon size={18} />
        Abmelden
      </Button>
    </section>
  )
}
