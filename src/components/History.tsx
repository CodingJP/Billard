import type { Match, Player, RatingChange } from '../lib/types'
import { sortByPlayedAt } from '../lib/ratings'
import { Card, Delta, EmptyState, formatDate } from './ui'

export function MatchList({
  matches,
  players,
  changes,
  onDelete,
  limit,
}: {
  matches: Match[]
  players: Player[]
  changes: RatingChange[]
  onDelete?: (id: string) => void
  limit?: number
}) {
  if (matches.length === 0) {
    return <EmptyState title="Noch keine Matches" text="Trag das erste Match über den Tab „+ Match“ ein." />
  }
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unbekannt'
  const delta = (matchId: string, playerId: string) => {
    const c = changes.find((x) => x.matchId === matchId && x.playerId === playerId)
    return c ? c.after - c.before : 0
  }
  const list = sortByPlayedAt(matches).reverse().slice(0, limit)

  return (
    <Card className="divide-y divide-white/5 overflow-hidden">
      {list.map((m) => {
        const aWon = m.scoreA > m.scoreB
        return (
          <div key={m.id} className="px-4 py-3">
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>
                {formatDate(m.playedAt)} · {m.discipline} · Race to {m.raceTo}
              </span>
              {onDelete && (
                <button
                  className="text-white/30 hover:text-rose-300"
                  onClick={() => {
                    if (confirm('Match löschen? Die Elo aller Spieler wird neu berechnet.')) onDelete(m.id)
                  }}
                >
                  Löschen
                </button>
              )}
            </div>
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className={`truncate ${aWon ? 'font-semibold' : 'text-white/60'}`}>
                {name(m.playerA)} <span className="text-xs"><Delta value={delta(m.id, m.playerA)} /></span>
              </div>
              <div className="text-lg font-bold tabular-nums">
                {m.scoreA} : {m.scoreB}
              </div>
              <div className={`truncate text-right ${!aWon ? 'font-semibold' : 'text-white/60'}`}>
                <span className="text-xs"><Delta value={delta(m.id, m.playerB)} /></span> {name(m.playerB)}
              </div>
            </div>
          </div>
        )
      })}
    </Card>
  )
}
