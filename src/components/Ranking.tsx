import type { PlayerStats } from '../lib/types'
import { Avatar, Button, Card, Delta, EmptyState, Form } from './ui'

const MEDALS = ['🥇', '🥈', '🥉']

export function Ranking({
  rows,
  onSelect,
  onAddPlayers,
  onLoadDemo,
}: {
  rows: PlayerStats[]
  onSelect: (id: string) => void
  onAddPlayers: () => void
  onLoadDemo: () => void
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Noch keine Spieler"
        text="Lege deine Freunde als Spieler an oder schau dir erst die Demo-Gruppe an."
        action={
          <div className="flex flex-col gap-2">
            <Button onClick={onAddPlayers}>Spieler anlegen</Button>
            <Button variant="ghost" onClick={onLoadDemo}>
              Demo-Gruppe laden
            </Button>
          </div>
        }
      />
    )
  }

  return (
    <Card className="divide-y divide-white/5 overflow-hidden">
      {rows.map((s, i) => (
        <button
          key={s.player.id}
          onClick={() => onSelect(s.player.id)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <span className="w-7 text-center text-lg font-bold text-white/50">{MEDALS[i] ?? i + 1}</span>
          <Avatar name={s.player.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{s.player.name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
              <span className="whitespace-nowrap tabular-nums">
                {s.wins}–{s.losses}
              </span>
              <Form form={s.form} />
              {s.matches > 0 && s.matches < 10 && (
                <span className="rounded bg-amber-300/10 px-1.5 text-[10px] text-amber-300/80" title="Weniger als 10 Matches, Elo noch provisorisch">
                  neu
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums">{s.elo}</div>
            <div className="text-xs tabular-nums">{s.matches > 0 ? <Delta value={s.lastDelta} /> : '–'}</div>
          </div>
        </button>
      ))}
    </Card>
  )
}
