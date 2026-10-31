import { useState } from 'react'
import type { NewChallengeInput } from '../api.ts'
import { formatRelative } from '../format.ts'
import { DISCIPLINES, type AppState, type Challenge, type Discipline, type Player } from '../lib/types.ts'
import { inputClass, selectClass } from '../styles.ts'
import { SwordsIcon, XIcon } from './icons.tsx'
import { Badge, Ball, Button, Card, ErrorText, Label, SectionTitle, Segmented, Stepper } from './ui.tsx'

const nameOf = (players: Player[], id: number) => players.find((p) => p.id === id)?.name ?? 'Unbekannt'

export function ChallengeForm({
  players,
  meId,
  initialOpponent,
  onSubmit,
  onCancel,
}: {
  players: Player[]
  meId: number
  initialOpponent?: number
  onSubmit: (input: NewChallengeInput) => Promise<void>
  onCancel: () => void
}) {
  const [opponentId, setOpponentId] = useState<number | null>(initialOpponent ?? null)
  const [discipline, setDiscipline] = useState<Discipline>('8-Ball')
  const [raceTo, setRaceTo] = useState(5)
  const [rated, setRated] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (opponentId === null) return
    setBusy(true)
    setError('')
    try {
      await onSubmit({ opponentId, discipline, raceTo, rated, message: message.trim() || undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-2xl leading-none font-extrabold uppercase">Herausfordern</h3>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2" onClick={onCancel} aria-label="Abbrechen">
          <XIcon size={18} />
        </button>
      </div>
      {initialOpponent === undefined && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {players
            .filter((p) => p.id !== meId)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => setOpponentId(p.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold transition ${
                  opponentId === p.id ? 'border-strong bg-strong text-strong-fg' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <Ball id={p.id} size="sm" />
                {p.name}
              </button>
            ))}
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label>Disziplin</Label>
          <select id="challenge-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)} className={`${selectClass} mt-1.5`}>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Race to</Label>
          <div className="mt-1.5">
            <Stepper label="Race to" value={raceTo} min={1} max={25} onChange={setRaceTo} />
          </div>
        </div>
      </div>
      <Segmented
        value={rated ? 'rated' : 'casual'}
        onChange={(v) => setRated(v === 'rated')}
        options={[
          { value: 'rated', label: 'Gewertet' },
          { value: 'casual', label: 'Ungewertet' },
        ]}
      />
      <input
        id="challenge-message"
        className={inputClass}
        placeholder="Nachricht (optional), z. B. Heute 17 Uhr?"
        maxLength={140}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={opponentId === null || busy} onClick={submit}>
        <SwordsIcon size={18} />
        {busy ? 'Wird gesendet …' : 'Herausforderung senden'}
      </Button>
    </Card>
  )
}

export function ChallengeList({
  state,
  onAccept,
  onDecline,
  onCancel,
  onPlay,
}: {
  state: AppState
  onAccept: (id: number) => void
  onDecline: (id: number) => void
  onCancel: (id: number) => void
  onPlay: (challenge: Challenge) => void
}) {
  const me = state.me.id
  if (state.challenges.length === 0) return null
  const incoming = state.challenges.filter((c) => c.status === 'pending' && c.opponent === me)
  const accepted = state.challenges.filter((c) => c.status === 'accepted')
  const outgoing = state.challenges.filter((c) => c.status === 'pending' && c.challenger === me)
  if (incoming.length + accepted.length + outgoing.length === 0) return null

  const details = (c: Challenge) => (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted">
      {c.discipline} · Race to {c.raceTo} · {formatRelative(c.createdAt)}
      {!c.rated && <Badge>ungewertet</Badge>}
    </div>
  )

  return (
    <section className="space-y-3">
      <SectionTitle>Herausforderungen</SectionTitle>
      {incoming.map((c) => (
        <Card key={c.id} className="border-accent p-4 ring-1 ring-accent">
          <div className="flex items-center gap-3">
            <Ball id={c.challenger} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">{nameOf(state.players, c.challenger)} fordert dich heraus</div>
              {details(c)}
            </div>
          </div>
          {c.message && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">„{c.message}“</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => onDecline(c.id)}>
              Keine Zeit
            </Button>
            <Button className="flex-1" onClick={() => onAccept(c.id)}>
              Annehmen
            </Button>
          </div>
        </Card>
      ))}
      {accepted.map((c) => {
        const other = c.challenger === me ? c.opponent : c.challenger
        return (
          <Card key={c.id} className="flex items-center gap-3 p-4">
            <Ball id={other} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Duell gegen {nameOf(state.players, other)}</div>
              {details(c)}
            </div>
            <Button variant="accent" className="px-3 py-2 text-sm" onClick={() => onPlay(c)}>
              Ergebnis
            </Button>
          </Card>
        )
      })}
      {outgoing.map((c) => (
        <Card key={c.id} className="flex items-center gap-3 px-4 py-3">
          <Ball id={c.opponent} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate">
              Du forderst <span className="font-bold">{nameOf(state.players, c.opponent)}</span>
            </div>
            {details(c)}
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-bad"
            onClick={() => onCancel(c.id)}
            aria-label="Zurückziehen"
            title="Zurückziehen"
          >
            <XIcon size={16} />
          </button>
        </Card>
      ))}
    </section>
  )
}
