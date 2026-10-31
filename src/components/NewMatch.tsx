import { useState } from 'react'
import { calculateElo } from '../lib/elo'
import { DISCIPLINES, type Discipline, type Match, type PlayerStats } from '../lib/types'
import { Avatar, Button, Card, Delta, EmptyState, SectionTitle } from './ui'

interface Result {
  match: Match
  deltaA: number
  deltaB: number
}

export function NewMatch({
  stats,
  onSave,
  onAddPlayers,
}: {
  stats: PlayerStats[]
  onSave: (m: Omit<Match, 'id' | 'playedAt'>) => Match
  onAddPlayers: () => void
}) {
  const [discipline, setDiscipline] = useState<Discipline>('8-Ball')
  const [raceTo, setRaceTo] = useState(5)
  const [playerA, setPlayerA] = useState<string | null>(null)
  const [playerB, setPlayerB] = useState<string | null>(null)
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  if (stats.length < 2) {
    return (
      <EmptyState
        title="Mindestens zwei Spieler nötig"
        text="Lege erst die Spieler an, dann kannst du Matches eintragen."
        action={<Button onClick={onAddPlayers}>Spieler anlegen</Button>}
      />
    )
  }

  const a = stats.find((s) => s.player.id === playerA)
  const b = stats.find((s) => s.player.id === playerB)
  const finished = (scoreA === raceTo) !== (scoreB === raceTo)
  const canSave = !!a && !!b && finished

  const preview =
    a && b && finished
      ? calculateElo({
          ratingA: a.elo,
          ratingB: b.elo,
          matchesA: a.matches,
          matchesB: b.matches,
          scoreA,
          scoreB,
          raceTo,
        })
      : null

  const pick = (id: string) => {
    if (playerA === id) return setPlayerA(null)
    if (playerB === id) return setPlayerB(null)
    if (!playerA) return setPlayerA(id)
    if (!playerB) return setPlayerB(id)
    setPlayerB(id)
  }

  const changeRace = (value: number) => {
    const next = Math.max(1, Math.min(15, value))
    setRaceTo(next)
    setScoreA((s) => Math.min(s, next))
    setScoreB((s) => Math.min(s, next))
  }

  const save = () => {
    if (!canSave || !preview || !a || !b) return
    const match = onSave({ discipline, raceTo, playerA: a.player.id, playerB: b.player.id, scoreA, scoreB })
    setResult({ match, deltaA: preview.deltaA, deltaB: preview.deltaB })
  }

  const again = () => {
    setResult(null)
    setScoreA(0)
    setScoreB(0)
  }

  if (result && a && b) {
    const winnerIsA = result.match.scoreA > result.match.scoreB
    return (
      <Card className="p-6 text-center">
        <div className="text-4xl">🏆</div>
        <p className="mt-2 text-lg font-bold">{winnerIsA ? a.player.name : b.player.name} gewinnt</p>
        <p className="text-sm text-white/60">
          {result.match.scoreA} : {result.match.scoreB} · {result.match.discipline} · Race to {result.match.raceTo}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            { s: a, d: result.deltaA },
            { s: b, d: result.deltaB },
          ].map(({ s, d }) => (
            <div key={s.player.id} className="rounded-xl bg-white/5 p-3">
              <div className="font-semibold">{s.player.name}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                <Delta value={d} />
              </div>
              <div className="text-xs text-white/50 tabular-nums">
                {s.elo - d} → {s.elo}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={again}>
            Revanche
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              again()
              setPlayerA(null)
              setPlayerB(null)
            }}
          >
            Neues Match
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Spieler wählen</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => {
            const label = s.player.id === playerA ? 'A' : s.player.id === playerB ? 'B' : null
            return (
              <button
                key={s.player.id}
                onClick={() => pick(s.player.id)}
                className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition ${
                  label ? 'bg-felt-500 text-white' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <Avatar name={s.player.name} size="sm" />
                {s.player.name}
                {label && <span className="rounded bg-black/20 px-1.5 text-xs font-bold">{label}</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Disziplin</SectionTitle>
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value as Discipline)}
            className="w-full rounded-xl bg-white/5 px-3 py-3 font-semibold outline-none"
          >
            {DISCIPLINES.map((d) => (
              <option key={d} value={d} className="bg-felt-900">
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <SectionTitle>Race to</SectionTitle>
          <div className="flex items-center justify-between rounded-xl bg-white/5">
            <button className="px-4 py-3 text-xl" onClick={() => changeRace(raceTo - 1)} aria-label="weniger">
              −
            </button>
            <span className="text-lg font-bold tabular-nums">{raceTo}</span>
            <button className="px-4 py-3 text-xl" onClick={() => changeRace(raceTo + 1)} aria-label="mehr">
              +
            </button>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Ergebnis</SectionTitle>
        <Card className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4">
          <ScorePicker name={a?.player.name ?? 'Spieler A'} value={scoreA} max={raceTo} onChange={setScoreA} />
          <span className="text-2xl font-bold text-white/30">:</span>
          <ScorePicker name={b?.player.name ?? 'Spieler B'} value={scoreB} max={raceTo} onChange={setScoreB} />
        </Card>
        {a && b && !finished && (
          <p className="mt-2 px-1 text-xs text-white/50">Genau ein Spieler muss {raceTo} Frames erreichen.</p>
        )}
        {preview && a && b && (
          <p className="mt-2 px-1 text-sm text-white/70">
            Elo: {a.player.name} <Delta value={preview.deltaA} />, {b.player.name} <Delta value={preview.deltaB} />
          </p>
        )}
      </section>

      <Button className="w-full" disabled={!canSave} onClick={save}>
        Match speichern
      </Button>
    </div>
  )
}

function ScorePicker({
  name,
  value,
  max,
  onChange,
}: {
  name: string
  value: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="max-w-full truncate text-sm text-white/70">{name}</span>
      <div className="flex items-center gap-3">
        <button
          className="h-10 w-10 rounded-full bg-white/5 text-xl hover:bg-white/10"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`${name} minus`}
        >
          −
        </button>
        <span className="w-8 text-center text-4xl font-bold tabular-nums">{value}</span>
        <button
          className="h-10 w-10 rounded-full bg-felt-600 text-xl hover:bg-felt-500"
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`${name} plus`}
        >
          +
        </button>
      </div>
    </div>
  )
}
