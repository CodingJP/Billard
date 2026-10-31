import { useState } from 'react'
import { formatDate, formatRelative } from '../format.ts'
import { sortByPlayedAt } from '../lib/ratings.ts'
import type { NewChallengeInput } from '../api.ts'
import type { AppState, Challenge, Match, Player, RatingChange } from '../lib/types.ts'
import { ChallengeForm, ChallengeList } from './Challenges.tsx'
import { SwordsIcon, XIcon } from './icons.tsx'
import { toast } from '../toast.ts'
import { Badge, Ball, Button, Card, ConfirmButton, Delta, EmptyState, ErrorText, Label, SectionTitle, SlideToConfirm } from './ui.tsx'

const nameOf = (players: Player[], id: number) => players.find((p) => p.id === id)?.name ?? 'Unbekannt'

export function MatchList({
  matches,
  players,
  changes,
  stageNames,
  onDelete,
  limit,
}: {
  matches: Match[]
  players: Player[]
  changes: RatingChange[]
  stageNames?: Map<number, string>
  onDelete?: (id: number) => void
  limit?: number
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const confirmed = matches.filter((m) => m.status === 'confirmed')
  if (confirmed.length === 0) return <EmptyState title="Noch keine Spiele" text="Bestätigte Duelle erscheinen hier." />

  const delta = (matchId: number, playerId: number) => {
    const c = changes.find((x) => x.matchId === matchId && x.playerId === playerId)
    return c ? c.after - c.before : null
  }
  const list = sortByPlayedAt(confirmed).reverse().slice(0, limit)

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {list.map((m) => {
        const aWon = m.scoreA > m.scoreB
        const dA = delta(m.id, m.playerA)
        const dB = delta(m.id, m.playerB)
        const stage = m.stageId !== null ? stageNames?.get(m.stageId) : undefined
        return (
          <div key={m.id} className="px-4 py-3">
            <button className="block w-full text-left" onClick={() => onDelete && setOpenId(openId === m.id ? null : m.id)}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] font-medium text-muted">
                <span className="whitespace-nowrap">
                  {formatDate(m.playedAt)} · {m.discipline} · Race {m.raceTo}
                </span>
                {!m.rated && <Badge>ungewertet</Badge>}
                {stage && <Badge tone="good">{stage}</Badge>}
              </div>
              <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className={`flex min-w-0 items-center gap-2 ${aWon ? 'font-bold' : 'text-muted'}`}>
                  <span className="truncate">{nameOf(players, m.playerA)}</span>
                  {dA !== null && <Delta value={dA} />}
                </div>
                <div className="font-display text-[22px] leading-none font-bold tabular-nums">
                  {m.scoreA}
                  <span className="mx-1 text-muted">:</span>
                  {m.scoreB}
                </div>
                <div className={`flex min-w-0 items-center justify-end gap-2 ${!aWon ? 'font-bold' : 'text-muted'}`}>
                  {dB !== null && <Delta value={dB} />}
                  <span className="truncate">{nameOf(players, m.playerB)}</span>
                </div>
              </div>
            </button>
            {onDelete && openId === m.id && (
              <ConfirmButton className="mt-3 w-full" confirmLabel="Wirklich löschen" onConfirm={() => onDelete(m.id)}>
                Spiel löschen (Admin)
              </ConfirmButton>
            )}
          </div>
        )
      })}
    </Card>
  )
}

export function GamesScreen({
  state,
  changes,
  stageNames,
  onConfirm,
  onReject,
  onDelete,
  challenges,
}: {
  state: AppState
  changes: RatingChange[]
  stageNames: Map<number, string>
  onConfirm: (id: number) => Promise<void>
  onReject: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  challenges: {
    create: (input: NewChallengeInput) => Promise<void>
    accept: (id: number) => Promise<void>
    decline: (id: number) => Promise<void>
    cancel: (id: number) => Promise<void>
    play: (challenge: Challenge) => void
  }
}) {
  const [error, setError] = useState('')
  const [challenging, setChallenging] = useState(false)
  const me = state.me
  const pending = state.matches.filter((m) => m.status === 'pending')
  const forMe = pending.filter((m) => m.createdBy !== me.id && (m.playerA === me.id || m.playerB === me.id))
  const fromMe = pending.filter((m) => m.createdBy === me.id)

  const run = (fn: () => Promise<void>) => {
    setError('')
    fn().catch((e) => setError(e instanceof Error ? e.message : 'Fehler'))
  }

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {forMe.length > 0 && (
        <section>
          <SectionTitle>Wartet auf deine Bestätigung</SectionTitle>
          <div className="space-y-3">
            {forMe.map((m) => (
              <ConfirmCard
                key={m.id}
                match={m}
                meId={me.id}
                players={state.players}
                stage={m.stageId !== null ? (stageNames.get(m.stageId) ?? 'Wettkampf') : undefined}
                onConfirm={() =>
                  run(async () => {
                    await onConfirm(m.id)
                    toast('Ergebnis bestätigt. Rangliste aktualisiert.')
                  })
                }
                onReject={() =>
                  run(async () => {
                    await onReject(m.id)
                    toast('Ergebnis abgelehnt.')
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      <ChallengeList
        state={state}
        onAccept={(id) => run(() => challenges.accept(id))}
        onDecline={(id) => run(() => challenges.decline(id))}
        onCancel={(id) => run(() => challenges.cancel(id))}
        onPlay={challenges.play}
      />

      {challenging ? (
        <ChallengeForm
          players={state.players}
          meId={me.id}
          onCancel={() => setChallenging(false)}
          onSubmit={async (input) => {
            await challenges.create(input)
            setChallenging(false)
            toast('Herausforderung gesendet.')
          }}
        />
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setChallenging(true)}>
          <SwordsIcon size={18} /> Jemanden herausfordern
        </Button>
      )}

      {fromMe.length > 0 && (
        <section>
          <SectionTitle>Wartet auf deinen Gegner</SectionTitle>
          <Card className="divide-y divide-line">
            {fromMe.map((m) => {
              const opponentId = m.playerA === me.id ? m.playerB : m.playerA
              const myScore = m.playerA === me.id ? m.scoreA : m.scoreB
              const theirScore = m.playerA === me.id ? m.scoreB : m.scoreA
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <Ball id={opponentId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      gegen <span className="font-bold">{nameOf(state.players, opponentId)}</span>
                    </div>
                    <div className="font-mono text-[10.5px] text-muted">{formatRelative(m.playedAt)}</div>
                  </div>
                  <span className="font-display text-xl font-bold tabular-nums">
                    {myScore}:{theirScore}
                  </span>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-bad"
                    onClick={() => run(() => onDelete(m.id))}
                    aria-label="Zurückziehen"
                    title="Zurückziehen"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              )
            })}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Alle Spiele</SectionTitle>
        <MatchList
          matches={state.matches}
          players={state.players}
          changes={changes}
          stageNames={stageNames}
          onDelete={me.isAdmin ? (id) => run(() => onDelete(id)) : undefined}
        />
      </section>
    </div>
  )
}

function ConfirmCard({
  match: m,
  meId,
  players,
  stage,
  onConfirm,
  onReject,
}: {
  match: Match
  meId: number
  players: Player[]
  stage?: string
  onConfirm: () => void
  onReject: () => void
}) {
  const myScore = m.playerA === meId ? m.scoreA : m.scoreB
  const theirScore = m.playerA === meId ? m.scoreB : m.scoreA
  const opponent = nameOf(players, m.createdBy)
  const won = myScore > theirScore
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Ball id={m.createdBy} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{opponent} hat eingetragen</div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted">
            {m.discipline} · Race {m.raceTo} · {formatRelative(m.playedAt)}
            {!m.rated && <Badge>ungewertet</Badge>}
            {stage && <Badge tone="good">{stage}</Badge>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 px-4 pt-5 pb-2 text-center">
        <div>
          <div className="font-display text-[64px] leading-[0.85] font-extrabold tabular-nums">{myScore}</div>
          <Label className="mt-2">Du</Label>
        </div>
        <div className="pb-8 font-display text-4xl font-bold text-muted">:</div>
        <div>
          <div className="font-display text-[64px] leading-[0.85] font-extrabold text-muted tabular-nums">{theirScore}</div>
          <Label className="mt-2 truncate">{opponent}</Label>
        </div>
      </div>
      <p className={`pb-4 text-center text-sm font-bold ${won ? 'text-good' : 'text-bad'}`}>{won ? 'Du hast gewonnen' : 'Du hast verloren'}</p>
      <div className="space-y-2 px-3 pb-3">
        <SlideToConfirm label="Wischen zum Bestätigen" doneLabel="Bestätigt" onConfirm={onConfirm} />
        <button onClick={onReject} className="w-full rounded-xl py-2.5 text-sm font-semibold text-muted hover:text-bad">
          Stimmt nicht
        </button>
      </div>
    </Card>
  )
}
