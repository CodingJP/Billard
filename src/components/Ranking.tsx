import type { PlayerStats } from '../lib/types.ts'
import { Avatar, Badge, Card, Delta, Form } from './ui.tsx'

const MEDALS = ['🥇', '🥈', '🥉']

export function Ranking({ rows, meId, onSelect }: { rows: PlayerStats[]; meId: number; onSelect: (id: number) => void }) {
  const showPodium = rows.length >= 3 && rows[0].matches > 0
  return (
    <div className="space-y-4">
      {showPodium && <Podium rows={rows} onSelect={onSelect} />}
      <Card className="divide-y divide-white/5 overflow-hidden">
        {rows.map((s, i) => (
          <button
            key={s.player.id}
            onClick={() => onSelect(s.player.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
              s.player.id === meId ? 'bg-felt-500/10' : ''
            }`}
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
                {s.matches > 0 && s.matches < 10 && <Badge tone="warn">neu</Badge>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{s.elo}</div>
              <div className="text-xs tabular-nums">{s.matches > 0 ? <Delta value={s.lastDelta} /> : '–'}</div>
            </div>
          </button>
        ))}
      </Card>
      <p className="px-1 text-xs text-white/40">
        Nur bestätigte, gewertete Spiele zählen. „Neu“ heißt: weniger als 10 Spiele, die Elo bewegt sich noch stärker.
      </p>
    </div>
  )
}

function Podium({ rows, onSelect }: { rows: PlayerStats[]; onSelect: (id: number) => void }) {
  const places = [
    { s: rows[1], place: 2, height: 'h-16' },
    { s: rows[0], place: 1, height: 'h-24' },
    { s: rows[2], place: 3, height: 'h-12' },
  ]
  return (
    <div className="grid grid-cols-3 items-end gap-2 pt-2">
      {places.map(({ s, place, height }) => (
        <button key={s.player.id} onClick={() => onSelect(s.player.id)} className="flex min-w-0 flex-col items-center gap-1.5">
          <Avatar name={s.player.name} size={place === 1 ? 'lg' : 'md'} />
          <span className="max-w-full truncate text-sm font-semibold">{s.player.name}</span>
          <span className="text-xs text-white/60 tabular-nums">{s.elo}</span>
          <div
            className={`flex w-full items-start justify-center rounded-t-xl pt-2 text-2xl ${height} ${
              place === 1 ? 'bg-gradient-to-b from-amber-300/30 to-amber-300/5' : 'bg-gradient-to-b from-white/10 to-white/0'
            }`}
          >
            {MEDALS[place - 1]}
          </div>
        </button>
      ))}
    </div>
  )
}
