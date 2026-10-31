import { useState, type ReactNode } from 'react'
import type { NewChallengeInput } from '../api.ts'
import { START_ELO } from '../lib/elo.ts'
import { headToHead } from '../lib/ratings.ts'
import type { Match, Player, PlayerStats, RatingChange } from '../lib/types.ts'
import { ChallengeForm } from './Challenges.tsx'
import { MatchList } from './History.tsx'
import { SwordsIcon } from './icons.tsx'
import { toast } from '../toast.ts'
import { BackLink, Ball, Button, Card, Label, SectionTitle } from './ui.tsx'

export function PlayerProfile({
  stats,
  rank,
  players,
  matches,
  changes,
  stageNames,
  onBack,
  onChallenge,
  children,
}: {
  stats: PlayerStats
  rank: number
  players: Player[]
  matches: Match[]
  changes: RatingChange[]
  stageNames: Map<number, string>
  onBack?: () => void
  /** Shown on other players' profiles. */
  onChallenge?: (input: NewChallengeInput) => Promise<void>
  children?: ReactNode
}) {
  const [challenging, setChallenging] = useState(false)
  const [sent, setSent] = useState(false)
  const id = stats.player.id
  const own = matches.filter((m) => m.playerA === id || m.playerB === id)
  const history = [START_ELO, ...changes.filter((c) => c.playerId === id).map((c) => c.after)]
  const h2h = headToHead(id, players, matches)
  const winRate = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0
  const peak = Math.max(...history)

  return (
    <div className="space-y-5">
      {onBack && <BackLink onClick={onBack}>Zurück</BackLink>}

      <div className="rounded-[22px] bg-strong p-5 text-strong-fg">
        <div className="flex items-center gap-4">
          <Ball id={stats.player.id} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase opacity-70">
              Spieler Nr. {stats.player.id}
              {stats.player.isAdmin && ' · Admin'}
            </div>
            <h2 className="mt-1 truncate font-display text-[38px] leading-[0.9] font-extrabold uppercase">{stats.player.name}</h2>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-current/15 pt-4">
          <div>
            <div className="font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase opacity-70">Platz</div>
            <div className="font-display text-[44px] leading-none font-extrabold tabular-nums">{rank}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase opacity-70">Elo</div>
            <div className="font-display text-[44px] leading-none font-extrabold tabular-nums">{stats.elo}</div>
          </div>
        </div>
      </div>

      {onChallenge &&
        (challenging ? (
          <ChallengeForm
            players={players}
            meId={-1}
            initialOpponent={stats.player.id}
            onCancel={() => setChallenging(false)}
            onSubmit={async (input) => {
              await onChallenge(input)
              setChallenging(false)
              setSent(true)
              toast(`${stats.player.name} ist herausgefordert.`)
            }}
          />
        ) : (
          <Button variant="accent" className="w-full" disabled={sent} onClick={() => setChallenging(true)}>
            <SwordsIcon size={18} />
            {sent ? `${stats.player.name} ist herausgefordert` : `${stats.player.name} herausfordern`}
          </Button>
        ))}

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Spiele" value={stats.matches} />
        <Stat label="Quote" value={`${winRate}%`} />
        <Stat label="Serie" value={stats.bestStreak} />
        <Stat label="Peak" value={peak} />
      </div>

      <section>
        <SectionTitle>Elo-Verlauf</SectionTitle>
        <Card className="p-4">
          {history.length > 1 ? <Sparkline values={history} /> : <p className="text-sm text-muted">Noch keine gewerteten Spiele.</p>}
        </Card>
      </section>

      {h2h.length > 0 && (
        <section>
          <SectionTitle>Head-to-Head</SectionTitle>
          <Card className="divide-y divide-line">
            {h2h.map((h) => {
              const total = h.wins + h.losses
              return (
                <div key={h.opponent.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Ball id={h.opponent.id} size="sm" />
                  <span className="w-20 truncate text-sm font-semibold">{h.opponent.name}</span>
                  <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-bad/70">
                    <div className="bg-good" style={{ width: `${(h.wins / total) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-xs font-semibold tabular-nums">
                    {h.wins}:{h.losses}
                  </span>
                </div>
              )
            })}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Letzte Spiele</SectionTitle>
        <MatchList matches={own} players={players} changes={changes} stageNames={stageNames} limit={15} />
      </section>

      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="px-2 py-3 text-center">
      <div className="font-display text-[26px] leading-none font-bold tabular-nums">{value}</div>
      <Label className="mt-1.5">{label}</Label>
    </Card>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 320
  const h = 110
  const pad = 8
  const min = Math.min(...values, START_ELO)
  const max = Math.max(...values, START_ELO)
  const span = Math.max(max - min, 1)
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${d} L${x(values.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`
  const last = values.at(-1) ?? START_ELO
  return (
    <div>
      <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Elo-Verlauf">
        <path d={area} className="fill-accent/25" />
        <line x1={pad} x2={w - pad} y1={y(START_ELO)} y2={y(START_ELO)} className="stroke-line" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" className="stroke-fg" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg bg-accent"
        style={{ left: `${(x(values.length - 1) / w) * 100}%`, top: `${(y(last) / h) * 100}%` }}
      />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10.5px] font-medium text-muted tabular-nums">
        <span>Start {START_ELO}</span>
        <span>
          {Math.min(...values)} – {Math.max(...values)}
        </span>
      </div>
    </div>
  )
}
