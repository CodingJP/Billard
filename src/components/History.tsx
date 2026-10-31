import { useState } from 'react'
import { formatDate, formatRelative } from '../format.ts'
import { sortByPlayedAt } from '../lib/ratings.ts'
import type { AppState, Match, Player, RatingChange } from '../lib/types.ts'
import { Avatar, Badge, Button, Card, ConfirmButton, Delta, EmptyState, ErrorText, SectionTitle } from './ui.tsx'

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
    <Card className="divide-y divide-white/5 overflow-hidden">
      {list.map((m) => {
        const aWon = m.scoreA > m.scoreB
        const dA = delta(m.id, m.playerA)
        const dB = delta(m.id, m.playerB)
        const stage = m.stageId !== null ? stageNames?.get(m.stageId) : undefined
        return (
          <div key={m.id} className="px-4 py-3">
            <button className="block w-full text-left" onClick={() => onDelete && setOpenId(openId === m.id ? null : m.id)}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/40">
                <span className="whitespace-nowrap">
                  {formatDate(m.playedAt)} · {m.discipline} · Race to {m.raceTo}
                </span>
                {!m.rated && <Badge>ungewertet</Badge>}
                {stage && <Badge tone="good">{stage}</Badge>}
              </div>
              <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className={`truncate ${aWon ? 'font-semibold' : 'text-white/60'}`}>
                  {nameOf(players, m.playerA)} {dA !== null && <span className="text-xs"><Delta value={dA} /></span>}
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {m.scoreA} : {m.scoreB}
                </div>
                <div className={`truncate text-right ${!aWon ? 'font-semibold' : 'text-white/60'}`}>
                  {dB !== null && <span className="text-xs"><Delta value={dB} /></span>} {nameOf(players, m.playerB)}
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
}: {
  state: AppState
  changes: RatingChange[]
  stageNames: Map<number, string>
  onConfirm: (id: number) => Promise<void>
  onReject: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const [error, setError] = useState('')
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
            {forMe.map((m) => {
              const myScore = m.playerA === me.id ? m.scoreA : m.scoreB
              const theirScore = m.playerA === me.id ? m.scoreB : m.scoreA
              const opponent = nameOf(state.players, m.createdBy)
              const won = myScore > theirScore
              return (
                <Card key={m.id} className="p-4 ring-1 ring-amber-300/30">
                  <div className="flex items-center gap-3">
                    <Avatar name={opponent} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{opponent} hat eingetragen</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/50">
                        {m.discipline} · Race to {m.raceTo} · {formatRelative(m.playedAt)}
                        {!m.rated && <Badge>ungewertet</Badge>}
                        {m.stageId !== null && <Badge tone="good">{stageNames.get(m.stageId) ?? 'Wettkampf'}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="my-4 text-center">
                    <div className="text-4xl font-bold tabular-nums">
                      {myScore} : {theirScore}
                    </div>
                    <div className={`mt-1 text-sm ${won ? 'text-felt-400' : 'text-rose-300'}`}>
                      {won ? 'Du hast gewonnen' : 'Du hast verloren'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => run(() => onReject(m.id))}>
                      Stimmt nicht
                    </Button>
                    <Button className="flex-1" onClick={() => run(() => onConfirm(m.id))}>
                      Bestätigen
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {fromMe.length > 0 && (
        <section>
          <SectionTitle>Wartet auf deinen Gegner</SectionTitle>
          <Card className="divide-y divide-white/5">
            {fromMe.map((m) => {
              const opponentId = m.playerA === me.id ? m.playerB : m.playerA
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      gegen <span className="font-semibold">{nameOf(state.players, opponentId)}</span>
                    </div>
                    <div className="text-xs text-white/40">{formatRelative(m.playedAt)}</div>
                  </div>
                  <span className="font-bold tabular-nums">
                    {m.scoreA} : {m.scoreB}
                  </span>
                  <button className="text-xs text-white/40 hover:text-rose-300" onClick={() => run(() => onDelete(m.id))}>
                    Zurückziehen
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
