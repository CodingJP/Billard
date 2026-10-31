import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { disablePush, enablePush, pushState, type PushState } from '../push.ts'
import { BellIcon, XIcon } from './icons.tsx'
import { Badge, Button, Card, ErrorText, SectionTitle } from './ui.tsx'

const DISMISS_KEY = 'billard:push-prompt-dismissed'

function usePushState() {
  const [state, setState] = useState<PushState | null>(null)
  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'))
  }, [])
  return [state, setState] as const
}

export function PushCard() {
  const [state, setState] = usePushState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tested, setTested] = useState(false)

  const toggle = async () => {
    setBusy(true)
    setError('')
    try {
      setState(state === 'on' ? await disablePush() : await enablePush())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push konnte nicht aktiviert werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionTitle>Benachrichtigungen</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-bold">
            <BellIcon size={18} /> Push-Nachrichten
          </span>
          {state === 'on' ? <Badge tone="good">an</Badge> : state === 'off' ? <Badge>aus</Badge> : null}
        </div>
        <p className="text-sm text-muted">
          Push bei Herausforderungen, Ergebnissen zum Bestätigen und neuen Wettkampf-Etappen.
        </p>
        {state === 'needs-install' && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            Auf dem iPhone: Tippe unten in Safari auf <b>Teilen</b> und dann <b>Zum Home-Bildschirm</b>. Öffne die App von dort, dann kannst du Push einschalten.
          </p>
        )}
        {state === 'unsupported' && <p className="text-sm text-muted">Dieser Browser unterstützt keine Push-Nachrichten.</p>}
        {state === 'denied' && (
          <p className="text-sm font-semibold text-bad">Benachrichtigungen sind blockiert. Erlaube sie in den Browser- oder Systemeinstellungen für diese Seite.</p>
        )}
        <ErrorText>{error}</ErrorText>
        {(state === 'on' || state === 'off') && (
          <div className="flex gap-2">
            <Button variant={state === 'on' ? 'ghost' : 'primary'} className="flex-1" disabled={busy} onClick={toggle}>
              {state === 'on' ? 'Push ausschalten' : 'Push einschalten'}
            </Button>
            {state === 'on' && (
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => api.pushTest().then(() => setTested(true))}
              >
                {tested ? 'Gesendet' : 'Test senden'}
              </Button>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

/** One-time hint on the start screen until push is on or the hint is dismissed. */
export function PushPrompt() {
  const [state, setState] = usePushState()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed || (state !== 'off' && state !== 'needs-install')) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <Card className="relative flex items-start gap-3 border-accent p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
        <BellIcon size={20} />
      </span>
      <button onClick={dismiss} className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Schließen">
        <XIcon size={16} />
      </button>
      <div className="min-w-0 flex-1 pr-6">
        <p className="font-bold">Verpasse keine Herausforderung</p>
        <p className="mt-0.5 text-sm text-muted">
          {state === 'needs-install'
            ? 'Füge die App über Teilen → Zum Home-Bildschirm hinzu, dann gibt es Push.'
            : 'Schalte Push ein und erfahre sofort, wenn dich jemand fordert.'}
        </p>
        {state === 'off' && (
          <div className="mt-3 flex gap-2">
            <Button className="px-3 py-2 text-sm" onClick={() => enablePush().then(setState).catch(() => {})}>
              Einschalten
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
