import { useMemo, useState, type ReactNode } from 'react'
import type { NewMatchInput } from '../api.ts'
import { openPairings } from '../lib/competition.ts'
import { calculateElo } from '../lib/elo.ts'
import { DISCIPLINES, type AppState, type Discipline, type PlayerStats } from '../lib/types.ts'
import { selectClass } from '../styles.ts'
import { SwordsIcon, TrophyIcon, UndoIcon } from './icons.tsx'
import { toast } from '../toast.ts'
import { Badge, Ball, Button, Card, Delta, EmptyState, ErrorText, Label, SectionTitle, Segmented, Stepper } from './ui.tsx'

interface StageOption {
  stageId?: number
  challengeId?: number
  rated: boolean
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
  challengeId,
}: {
  state: AppState
  stats: PlayerStats[]
  onSubmit: (input: NewMatchInput) => Promise<void>
  onDone: () => void
  /** Preselects an accepted challenge, e.g. when coming from a push message. */
  challengeId?: number | null
}) {
  const me = state.me
  const preset = state.challenges.find((c) => c.id === challengeId && c.status === 'accepted')
  const [opponentId, setOpponentId] = useState<number | null>(
    preset ? (preset.challenger === me.id ? preset.opponent : preset.challenger) : null,
  )
  const [stageOption, setStageOption] = useState<StageOption | null>(
    preset
      ? {
          challengeId: preset.id,
          opponentId: preset.challenger === me.id ? preset.opponent : preset.challenger,
          label: 'Herausforderung',
          raceTo: preset.raceTo,
          discipline: preset.discipline,
          rated: preset.rated,
        }
      : null,
  )
  const [discipline, setDiscipline] = useState<Discipline>('8-Ball')
  const [raceTo, setRaceTo] = useState(5)
  const [rated, setRated] = useState(true)
  const [own, setOwn] = useState(0)
  const [other, setOther] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const stageOptions = useMemo(() => {
    const list: StageOption[] = []
    for (const c of state.challenges) {
      if (c.status !== 'accepted') continue
      list.push({
        challengeId: c.id,
        opponentId: c.challenger === me.id ? c.opponent : c.challenger,
        label: 'Herausforderung',
        raceTo: c.raceTo,
        discipline: c.discipline,
        rated: c.rated,
      })
    }
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
            rated: true,
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
  const isRated = stageOption ? stageOption.rated : rated
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

  // Once someone reached the race, further frames are not possible.
  const decided = own === race || other === race
  const tapOwn = () => !decided && setOwn((v) => Math.min(race, v + 1))
  const tapOther = () => opp && !decided && setOther((v) => Math.min(race, v + 1))

  const submit = async () => {
    if (!opp || !finished) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(
        stageOption
          ? {
              opponentId: opp.player.id,
              ownScore: own,
              opponentScore: other,
              stageId: stageOption.stageId,
              challengeId: stageOption.challengeId,
            }
          : { opponentId: opp.player.id, ownScore: own, opponentScore: other, discipline, raceTo, rated },
      )
      toast(`Gesendet. ${opp.player.name} muss noch bestätigen.`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {stageOptions.length > 0 && (
        <section>
          <SectionTitle>Steht an</SectionTitle>
          <div className="space-y-2">
            {stageOptions.map((o) => {
              const name = stats.find((s) => s.player.id === o.opponentId)?.player.name ?? '?'
              const active =
                !!stageOption && stageOption.stageId === o.stageId && stageOption.challengeId === o.challengeId && stageOption.opponentId === o.opponentId
              return (
                <button
                  key={`${o.stageId ?? 'c' + o.challengeId}-${o.opponentId}`}
                  onClick={() => chooseStage(o)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                    active ? 'border-strong bg-surface ring-1 ring-strong' : 'border-line bg-surface hover:bg-surface-2'
                  }`}
                >
                  <Ball id={o.opponentId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">gegen {name}</div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      {o.label} · {o.discipline} · Race {o.raceTo}
                    </div>
                  </div>
                  <span className="text-muted">{o.challengeId ? <SwordsIcon size={18} /> : <TrophyIcon size={18} />}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{stageOptions.length > 0 ? 'Oder freies Duell gegen' : 'Gegner'}</SectionTitle>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {opponents.map((s) => {
            const active = s.player.id === opponentId && !stageOption
            return (
              <button
                key={s.player.id}
                onClick={() => chooseOpponent(s.player.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold transition ${
                  active ? 'border-strong bg-strong text-strong-fg' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <Ball id={s.player.id} size="sm" />
                {s.player.name}
                <span className="font-mono text-[11px] opacity-60 tabular-nums">{s.elo}</span>
              </button>
            )
          })}
        </div>
      </section>

      {stageOption ? (
        <Card className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="font-mono text-xs font-semibold">
            {stageOption.discipline} · Race to {stageOption.raceTo}
          </span>
          <Badge tone="good">
            {stageOption.challengeId ? 'Herausforderung' : 'Wettkampf'} · {stageOption.rated ? 'gewertet' : 'ungewertet'}
          </Badge>
        </Card>
      ) : (
        <section className="space-y-3">
          <Card className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Label>Disziplin</Label>
              <select id="discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)} className={`${selectClass} mt-1.5`}>
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
                <Stepper label="Race to" value={raceTo} min={1} max={25} onChange={changeRace} />
              </div>
            </div>
          </Card>
          <Segmented
            value={rated ? 'rated' : 'casual'}
            onChange={(v) => setRated(v === 'rated')}
            options={[
              { value: 'rated', label: 'Gewertet' },
              { value: 'casual', label: 'Ungewertet' },
            ]}
          />
          {!rated && <p className="px-1 text-xs text-muted">Ungewertete Spiele landen in der Historie, ändern aber keine Elo.</p>}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <Label>Tippe pro gewonnenem Frame</Label>
          <Label>Race to {race}</Label>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-[22px] border border-line">
          <BoardHalf
            id={me.id}
            name="Du"
            score={own}
            race={race}
            won={own === race}
            onTap={tapOwn}
          />
          <BoardHalf
            id={opp?.player.id ?? null}
            name={opp?.player.name ?? 'Gegner wählen'}
            score={other}
            race={race}
            won={other === race}
            onTap={tapOther}
            divider
          />
        </div>
        <div className="mt-2 flex gap-2">
          <SmallButton disabled={own === 0} onClick={() => setOwn((v) => Math.max(0, v - 1))}>
            −1 Du
          </SmallButton>
          <SmallButton disabled={other === 0} onClick={() => setOther((v) => Math.max(0, v - 1))}>
            −1 {opp?.player.name ?? 'Gegner'}
          </SmallButton>
          <SmallButton disabled={own === 0 && other === 0} onClick={reset}>
            <UndoIcon size={14} /> Neu
          </SmallButton>
        </div>
      </section>

      <Card className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
        {preview && opp ? (
          <>
            <Label>Nach Bestätigung</Label>
            <span className="flex items-center gap-3 text-sm font-semibold">
              <span>
                Du <Delta value={preview.deltaA} />
              </span>
              <span className="truncate">
                {opp.player.name} <Delta value={preview.deltaB} />
              </span>
            </span>
          </>
        ) : (
          <p className="text-sm text-muted">
            {!opp
              ? 'Wähle zuerst deinen Gegner.'
              : !finished
                ? `Wer zuerst ${race} Frames hat, gewinnt.`
                : 'Ungewertet: keine Elo-Änderung.'}
          </p>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button className="w-full py-4 text-base" disabled={!opp || !finished || busy} onClick={submit}>
        {busy ? 'Wird gesendet …' : 'Zur Bestätigung senden'}
      </Button>
    </div>
  )
}

function BoardHalf({
  id,
  name,
  score,
  race,
  won,
  onTap,
  divider,
}: {
  id: number | null
  name: string
  score: number
  race: number
  won: boolean
  onTap: () => void
  divider?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Frame für ${name}`}
      className={`relative flex min-h-[200px] flex-col items-center justify-between gap-2 px-3 pt-4 pb-3 transition select-none active:scale-[0.98] ${
        won ? 'bg-strong text-strong-fg' : 'bg-surface text-fg'
      } ${divider ? 'border-l border-line' : ''}`}
    >
      <span className="flex max-w-full items-center gap-2">
        {id !== null ? <Ball id={id} size="sm" /> : <span className="h-8 w-8 rounded-full border-2 border-dashed border-line" />}
        <span className="truncate text-sm font-bold">{name}</span>
      </span>
      <span className="font-display text-[88px] leading-none font-extrabold tabular-nums">{score}</span>
      <span className="flex flex-wrap justify-center gap-1" aria-hidden="true">
        {Array.from({ length: Math.min(race, 15) }, (_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < score ? (won ? 'bg-strong-fg' : 'bg-fg') : won ? 'bg-strong-fg/30' : 'bg-line'}`} />
        ))}
      </span>
      {won && <span className="absolute top-3 right-3 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase">Sieg</span>}
    </button>
  )
}

function SmallButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-xl border border-line bg-surface px-2 py-2 font-mono text-[11.5px] font-semibold text-muted transition hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  )
}
