import { useMemo, useState } from 'react'
import type { NewMatchInput } from '../api.ts'
import { openPairings } from '../lib/competition.ts'
import { calculateElo } from '../lib/elo.ts'
import { DISCIPLINES, type AppState, type Discipline, type PlayerStats } from '../lib/types.ts'
import { Avatar, Badge, Button, Card, Delta, EmptyState, ErrorText, SectionTitle, Segmented, Stepper } from './ui.tsx'

interface StageOption {
  stageId: number
  opponentId: number
  label: string
  raceTo: number
  discipline: Discipline
}

export function NewMatch({
  state,
  stats,
  onSubmit,
  onDone,
}: {
  state: AppState
  stats: PlayerStats[]
  onSubmit: (input: NewMatchInput) => Promise<void>
  onDone: () => void
}) {
  const me = state.me
  const [opponentId, setOpponentId] = useState<number | null>(null)
  const [stageOption, setStageOption] = useState<StageOption | null>(null)
  const [discipline, setDiscipline] = useState<Discipline>('8-Ball')
  const [raceTo, setRaceTo] = useState(5)
  const [rated, setRated] = useState(true)
  const [own, setOwn] = useState(0)
  const [other, setOther] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const stageOptions = useMemo(() => {
    const list: StageOption[] = []
    for (const comp of state.competitions) {
      for (const stage of comp.stages) {
        if (stage.status !== 'running') continue
        for (const [a, b] of openPairings(stage, state.matches)) {
          if (a !== me.id && b !== me.id) continue
          list.push({
            stageId: stage.id,
            opponentId: a === me.id ? b : a,
            label: `${comp.name} · ${stage.name}`,
            raceTo: stage.raceTo,
            discipline: comp.discipline,
          })
        }
      }
    }
    return list
  }, [state, me.id])

  const opponents = stats.filter((s) => s.player.id !== me.id)
  if (opponents.length === 0) {
    return <EmptyState title="Noch keine Gegner" text="Sobald sich jemand über den QR-Code registriert, kannst du Duelle eintragen." />
  }

  const mine = stats.find((s) => s.player.id === me.id)!
  const opp = stats.find((s) => s.player.id === opponentId)
  const race = stageOption?.raceTo ?? raceTo
  const isRated = stageOption ? true : rated
  const finished = (own === race) !== (other === race)
  const preview =
    opp && finished && isRated
      ? calculateElo({
          ratingA: mine.elo,
          ratingB: opp.elo,
          matchesA: mine.matches,
          matchesB: opp.matches,
          scoreA: own,
          scoreB: other,
          raceTo: race,
        })
      : null

  const reset = () => {
    setOwn(0)
    setOther(0)
    setError('')
  }

  const chooseStage = (o: StageOption) => {
    setStageOption(o)
    setOpponentId(o.opponentId)
    setOwn((v) => Math.min(v, o.raceTo))
    setOther((v) => Math.min(v, o.raceTo))
  }

  const chooseOpponent = (id: number) => {
    setStageOption(null)
    setOpponentId(id === opponentId ? null : id)
  }

  const changeRace = (v: number) => {
    setRaceTo(v)
    setOwn((s) => Math.min(s, v))
    setOther((s) => Math.min(s, v))
  }

  const submit = async () => {
    if (!opp || !finished) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(
        stageOption
          ? { opponentId: opp.player.id, ownScore: own, opponentScore: other, stageId: stageOption.stageId }
          : { opponentId: opp.player.id, ownScore: own, opponentScore: other, discipline, raceTo, rated },
      )
      setSent(opp.player.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Card className="p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-felt-500/20 text-2xl">✓</div>
        <p className="mt-4 text-lg font-bold">Ergebnis eingetragen</p>
        <p className="mt-1 text-sm text-white/60">
          {sent} muss es noch bestätigen. Erst dann zählt es{isRated ? ' für die Elo' : ''}.
        </p>
        <div className="mt-6 flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              setSent(null)
              reset()
            }}
          >
            Revanche
          </Button>
          <Button className="flex-1" onClick={onDone}>
            Fertig
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {stageOptions.length > 0 && (
        <section>
          <SectionTitle>Deine Wettkampfspiele</SectionTitle>
          <div className="space-y-2">
            {stageOptions.map((o) => {
              const name = stats.find((s) => s.player.id === o.opponentId)?.player.name ?? '?'
              const active = stageOption?.stageId === o.stageId && stageOption.opponentId === o.opponentId
              return (
                <button
                  key={`${o.stageId}-${o.opponentId}`}
                  onClick={() => chooseStage(o)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition ${
                    active ? 'bg-felt-500/20 ring-felt-400' : 'bg-felt-900/80 ring-white/5 hover:bg-white/5'
                  }`}
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">gegen {name}</div>
                    <div className="truncate text-xs text-white/50">
                      {o.label} · {o.discipline} · Race to {o.raceTo}
                    </div>
                  </div>
                  <span className="text-felt-400">🏆</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{stageOptions.length > 0 ? 'Oder freies Duell gegen' : 'Gegner'}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {opponents.map((s) => {
            const active = s.player.id === opponentId && !stageOption
            return (
              <button
                key={s.player.id}
                onClick={() => chooseOpponent(s.player.id)}
                className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition ${
                  active ? 'bg-felt-500 text-white' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <Avatar name={s.player.name} size="sm" />
                {s.player.name}
                <span className="text-xs opacity-60 tabular-nums">{s.elo}</span>
              </button>
            )
          })}
        </div>
      </section>

      {stageOption ? (
        <Card className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-white/70">
            {stageOption.discipline} · Race to {stageOption.raceTo}
          </span>
          <Badge tone="good">Wettkampf · gewertet</Badge>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionTitle>Disziplin</SectionTitle>
              <select
                id="discipline"
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
              <Stepper label="Race to" value={raceTo} min={1} max={25} onChange={changeRace} />
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
          {!rated && <p className="px-1 text-xs text-white/50">Ungewertete Spiele landen in der Historie, ändern aber keine Elo.</p>}
        </section>
      )}

      <section>
        <SectionTitle>Ergebnis</SectionTitle>
        <Card className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4">
          <ScorePicker name="Du" value={own} max={race} onChange={setOwn} />
          <span className="text-2xl font-bold text-white/30">:</span>
          <ScorePicker name={opp?.player.name ?? 'Gegner'} value={other} max={race} onChange={setOther} />
        </Card>
        {opp && !finished && <p className="mt-2 px-1 text-xs text-white/50">Genau ein Spieler muss {race} Frames erreichen.</p>}
        {preview && opp && (
          <p className="mt-2 px-1 text-sm text-white/70">
            Nach Bestätigung: du <Delta value={preview.deltaA} />, {opp.player.name} <Delta value={preview.deltaB} />
          </p>
        )}
      </section>

      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={!opp || !finished || busy} onClick={submit}>
        {busy ? 'Wird gespeichert …' : 'Zur Bestätigung senden'}
      </Button>
    </div>
  )
}

function ScorePicker({ name, value, max, onChange }: { name: string; value: number; max: number; onChange: (v: number) => void }) {
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
