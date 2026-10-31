import { START_ELO } from '../lib/elo'
import { headToHead } from '../lib/ratings'
import type { Match, Player, PlayerStats, RatingChange } from '../lib/types'
import { MatchList } from './History'
import { Avatar, Card, SectionTitle } from './ui'

export function PlayerProfile({
  stats,
  rank,
  players,
  matches,
  changes,
  onBack,
}: {
  stats: PlayerStats
  rank: number
  players: Player[]
  matches: Match[]
  changes: RatingChange[]
  onBack: () => void
}) {
  const id = stats.player.id
  const own = matches.filter((m) => m.playerA === id || m.playerB === id)
  const history = [START_ELO, ...changes.filter((c) => c.playerId === id).map((c) => c.after)]
  const h2h = headToHead(id, players, matches)
  const winRate = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0
  const peak = Math.max(...history)

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-felt-400">
        ← Zurück
      </button>

      <div className="flex items-center gap-4">
        <Avatar name={stats.player.name} size="lg" />
        <div>
          <h1 className="text-2xl font-bold">{stats.player.name}</h1>
          <p className="text-white/60">
            Platz {rank} · <span className="font-semibold text-white tabular-nums">{stats.elo}</span> Elo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Matches" value={stats.matches} />
        <Stat label="Siegquote" value={`${winRate}%`} />
        <Stat label="Beste Serie" value={stats.bestStreak} />
        <Stat label="Höchste Elo" value={peak} />
      </div>

      <section>
        <SectionTitle>Elo-Verlauf</SectionTitle>
        <Card className="p-4">
          {history.length > 1 ? (
            <Sparkline values={history} />
          ) : (
            <p className="text-sm text-white/50">Noch keine Matches gespielt.</p>
          )}
        </Card>
      </section>

      {h2h.length > 0 && (
        <section>
          <SectionTitle>Head-to-Head</SectionTitle>
          <Card className="divide-y divide-white/5">
            {h2h.map((h) => {
              const total = h.wins + h.losses
              return (
                <div key={h.opponent.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-24 truncate">{h.opponent.name}</span>
                  <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-rose-400/60">
                    <div className="bg-felt-400" style={{ width: `${(h.wins / total) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right text-sm tabular-nums">
                    {h.wins}:{h.losses}
                  </span>
                </div>
              )
            })}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Letzte Matches</SectionTitle>
        <MatchList matches={own} players={players} changes={changes} limit={10} />
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="px-2 py-3 text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-white/50">{label}</div>
    </Card>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 320
  const h = 96
  const pad = 6
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1)
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = values.at(-1) ?? START_ELO
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Elo-Verlauf">
        <line x1={pad} x2={w - pad} y1={y(START_ELO)} y2={y(START_ELO)} stroke="currentColor" className="text-white/10" strokeDasharray="4 4" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-felt-400" vectorEffect="non-scaling-stroke" />
        <circle cx={x(values.length - 1)} cy={y(last)} r="3.5" className="fill-felt-400" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-white/40 tabular-nums">
        <span>Start {START_ELO}</span>
        <span>
          {min} – {max}
        </span>
      </div>
    </div>
  )
}
