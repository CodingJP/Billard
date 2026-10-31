import { useState } from 'react'
import type { NewCompetitionInput } from '../api.ts'
import { isStageComplete, knockoutBracket, openPairings, roundRobinStandings, type BracketSlot } from '../lib/competition.ts'
import { DISCIPLINES, STAGE_FORMATS, type AppState, type Competition, type Discipline, type Player, type Stage, type StageFormat } from '../lib/types.ts'
import { inputClass } from '../styles.ts'
import { PlusIcon, TrophyIcon, XIcon } from './icons.tsx'
import { BackLink, Badge, Ball, Button, Card, ConfirmButton, EmptyState, ErrorText, Label, SectionTitle, Segmented, Stepper } from './ui.tsx'

const nameOf = (players: Player[], id: number | null) =>
  id === null ? 'Freilos' : (players.find((p) => p.id === id)?.name ?? 'Unbekannt')

export function CompetitionsScreen({
  state,
  onCreate,
  onAdvance,
  onDelete,
}: {
  state: AppState
  onCreate: (input: NewCompetitionInput) => Promise<number>
  onAdvance: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const isAdmin = state.me.isAdmin

  if (creating) {
    return (
      <CreateCompetition
        players={state.players}
        onCancel={() => setCreating(false)}
        onCreate={async (input) => {
          const id = await onCreate(input)
          setCreating(false)
          setOpenId(id)
        }}
      />
    )
  }

  const open = state.competitions.find((c) => c.id === openId)
  if (open) {
    return (
      <CompetitionDetail
        competition={open}
        state={state}
        onBack={() => setOpenId(null)}
        onAdvance={() => onAdvance(open.id)}
        onDelete={async () => {
          await onDelete(open.id)
          setOpenId(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Button className="w-full" onClick={() => setCreating(true)}>
          <PlusIcon size={18} />
          Neuen Wettkampf anlegen
        </Button>
      )}
      {state.competitions.length === 0 ? (
        <EmptyState
          title="Noch keine Wettkämpfe"
          text={isAdmin ? 'Lege einen Cup mit mehreren Etappen an, zum Beispiel Gruppenphase und K.-o.-Finale.' : 'Sobald ein Admin einen Wettkampf anlegt, siehst du ihn hier.'}
        />
      ) : (
        <div className="space-y-3">
          {state.competitions.map((c) => {
            const current = c.stages.find((s) => s.status === 'running')
            const winner = c.status === 'finished' ? c.stages.at(-1) : undefined
            const champion = winner ? knockoutChampion(winner, state) : null
            return (
              <button key={c.id} onClick={() => setOpenId(c.id)} className="block w-full text-left">
                <Card className="p-4 transition hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-display text-[28px] leading-none font-extrabold uppercase">{c.name}</div>
                      <div className="mt-1.5 font-mono text-[10.5px] font-medium text-muted">
                        {c.discipline} · {c.stages.length} {c.stages.length === 1 ? 'Etappe' : 'Etappen'}
                      </div>
                    </div>
                    {c.status === 'finished' ? <Badge tone="good">beendet</Badge> : <Badge tone="warn">läuft</Badge>}
                  </div>
                  <StageProgress stages={c.stages} />
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {champion !== null ? (
                      <>
                        <Ball id={champion} size="sm" />
                        <span className="text-muted">Sieger</span>
                        <span className="font-bold">{nameOf(state.players, champion)}</span>
                        <TrophyIcon size={16} className="text-accent" />
                      </>
                    ) : current ? (
                      <>
                        <span className="text-muted">Aktuell</span>
                        <span className="font-bold">{current.name}</span>
                      </>
                    ) : null}
                  </div>
                </Card>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function knockoutChampion(stage: Stage, state: AppState): number | null {
  if (stage.format === 'knockout') return knockoutBracket(stage, state.matches).at(-1)?.[0]?.winner ?? null
  return roundRobinStandings(stage, state.matches)[0]?.playerId ?? null
}

function StageProgress({ stages }: { stages: Stage[] }) {
  return (
    <div className="mt-3 flex gap-1.5">
      {stages.map((s) => (
        <div
          key={s.id}
          className={`h-1.5 flex-1 rounded-full ${
            s.status === 'finished' ? 'bg-fg' : s.status === 'running' ? 'bg-accent' : 'bg-line'
          }`}
          title={s.name}
        />
      ))}
    </div>
  )
}

function CompetitionDetail({
  competition,
  state,
  onBack,
  onAdvance,
  onDelete,
}: {
  competition: Competition
  state: AppState
  onBack: () => void
  onAdvance: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const running = competition.stages.find((s) => s.status === 'running')
  const [stageId, setStageId] = useState(running?.id ?? competition.stages.at(-1)!.id)
  const [error, setError] = useState('')
  const stage = competition.stages.find((s) => s.id === stageId) ?? competition.stages[0]
  const complete = stage.status === 'running' && isStageComplete(stage, state.matches)
  const isLast = stage.position === competition.stages.length

  const run = (fn: () => Promise<void>) => {
    setError('')
    fn().catch((e) => setError(e instanceof Error ? e.message : 'Fehler'))
  }

  return (
    <div className="space-y-5">
      <BackLink onClick={onBack}>Alle Wettkämpfe</BackLink>
      <div>
        <h2 className="font-display text-[40px] leading-[0.9] font-extrabold uppercase">{competition.name}</h2>
        <Label className="mt-2">{competition.discipline} · {competition.status === 'finished' ? 'beendet' : 'läuft'}</Label>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          {competition.stages.map((s) => (
            <button
              key={s.id}
              onClick={() => setStageId(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                s.id === stage.id ? 'border-strong bg-strong text-strong-fg' : 'border-line bg-surface text-muted'
              }`}
            >
              <span className="font-mono text-[11px]">{String(s.position).padStart(2, '0')}</span>
              {s.name}
              {s.status === 'running' && <span className="inline-block h-2 w-2 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <p className="font-mono text-[11px] font-medium text-muted">
        {STAGE_FORMATS.find((f) => f.id === stage.format)?.label} · Race to {stage.raceTo}
        {!isLast && ` · Top ${stage.advanceCount} kommen weiter`}
      </p>

      {stage.status === 'pending' ? (
        <EmptyState title="Noch nicht gestartet" text="Die Teilnehmer stehen fest, sobald die vorherige Etappe abgeschlossen ist." />
      ) : stage.format === 'round_robin' ? (
        <RoundRobinView stage={stage} state={state} isLast={isLast} />
      ) : (
        <BracketView stage={stage} state={state} />
      )}

      <ErrorText>{error}</ErrorText>

      {state.me.isAdmin && (
        <div className="space-y-2 pt-2">
          {complete && (
            <Button className="w-full" onClick={() => run(onAdvance)}>
              {isLast ? 'Wettkampf abschließen' : `Etappe abschließen, Top ${stage.advanceCount} weiter`}
            </Button>
          )}
          <ConfirmButton variant="ghost" className="w-full" confirmLabel="Endgültig löschen" onConfirm={() => run(onDelete)}>
            Wettkampf löschen
          </ConfirmButton>
        </div>
      )}
    </div>
  )
}

function RoundRobinView({ stage, state, isLast }: { stage: Stage; state: AppState; isLast: boolean }) {
  const table = roundRobinStandings(stage, state.matches)
  const open = stage.status === 'running' ? openPairings(stage, state.matches) : []
  const cut = isLast ? 1 : stage.advanceCount
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem] gap-2 border-b border-line px-4 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
          <span>#</span>
          <span>Spieler</span>
          <span className="text-right">Sp</span>
          <span className="text-right">Fr</span>
          <span className="text-right">Pkt</span>
        </div>
        {table.map((r, i) => (
          <div
            key={r.playerId}
            className={`grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem] items-center gap-2 px-4 py-2.5 text-sm ${
              i === cut - 1 ? 'border-b-2 border-dashed border-accent' : 'border-b border-line last:border-b-0'
            } ${r.playerId === state.me.id ? 'bg-accent/15' : ''}`}
          >
            <span className={`font-mono font-semibold ${i < cut ? 'text-fg' : 'text-muted'}`}>{String(i + 1).padStart(2, '0')}</span>
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <Ball id={r.playerId} size="sm" />
              <span className="truncate">{nameOf(state.players, r.playerId)}</span>
            </span>
            <span className="text-right font-mono text-muted tabular-nums">{r.played}</span>
            <span className="text-right font-mono text-muted tabular-nums">
              {r.framesWon - r.framesLost > 0 ? '+' : ''}
              {r.framesWon - r.framesLost}
            </span>
            <span className="text-right font-display text-xl font-bold tabular-nums">{r.points}</span>
          </div>
        ))}
      </Card>
      {open.length > 0 && (
        <section>
          <SectionTitle>Noch offen ({open.length})</SectionTitle>
          <Card className="divide-y divide-line">
            {open.map(([a, b]) => (
              <div
                key={`${a}-${b}`}
                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-sm ${a === state.me.id || b === state.me.id ? 'bg-accent/15 font-bold' : 'text-muted'}`}
              >
                <span className="truncate">{nameOf(state.players, a)}</span>
                <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">vs</span>
                <span className="truncate text-right">{nameOf(state.players, b)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  )
}

const roundName = (index: number, total: number) => {
  const fromEnd = total - index
  if (fromEnd === 1) return 'Finale'
  if (fromEnd === 2) return 'Halbfinale'
  if (fromEnd === 3) return 'Viertelfinale'
  return `Runde ${index + 1}`
}

function BracketView({ stage, state }: { stage: Stage; state: AppState }) {
  const rounds = knockoutBracket(stage, state.matches)
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-4">
        {rounds.map((round, r) => (
          <div key={r} className="flex w-44 shrink-0 flex-col">
            <Label className="mb-2">{roundName(r, rounds.length)}</Label>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {round.map((slot, i) => (
                <BracketCard key={i} slot={slot} players={state.players} meId={state.me.id} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketCard({ slot, players, meId }: { slot: BracketSlot; players: Player[]; meId: number }) {
  const line = (id: number | null, score: number | undefined) => {
    const won = slot.winner !== null && slot.winner === id
    const lost = slot.winner !== null && id !== null && slot.winner !== id
    return (
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${won ? 'bg-strong font-bold text-strong-fg' : ''} ${lost || id === null ? 'text-muted' : ''} ${
          id === meId && !won ? 'bg-accent/15' : ''
        }`}
      >
        <span className="truncate">{id === null && slot.a === null && slot.b === null ? '–' : nameOf(players, id)}</span>
        {score !== undefined && <span className="font-display text-lg leading-none font-bold tabular-nums">{score}</span>}
      </div>
    )
  }
  const m = slot.match
  const scoreFor = (id: number | null) => (m && id !== null ? (m.playerA === id ? m.scoreA : m.scoreB) : undefined)
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {line(slot.a, scoreFor(slot.a))}
      {line(slot.b, scoreFor(slot.b))}
    </Card>
  )
}

interface StageDraft {
  name: string
  format: StageFormat
  raceTo: number
  advanceCount: number
}

function CreateCompetition({
  players,
  onCancel,
  onCreate,
}: {
  players: Player[]
  onCancel: () => void
  onCreate: (input: NewCompetitionInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [discipline, setDiscipline] = useState<Discipline>('8-Ball')
  const [selected, setSelected] = useState<number[]>(players.map((p) => p.id))
  const [stages, setStages] = useState<StageDraft[]>([
    { name: 'Gruppenphase', format: 'round_robin', raceTo: 3, advanceCount: 4 },
    { name: 'Finalrunde', format: 'knockout', raceTo: 5, advanceCount: 1 },
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const update = (i: number, patch: Partial<StageDraft>) => setStages((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)))

  // Each stage can only advance fewer players than entered it.
  const fieldBefore = (i: number) => (i === 0 ? selected.length : stages[i - 1].advanceCount)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onCreate({
        name,
        discipline,
        playerIds: selected,
        stages: stages.map((s, i) => ({ ...s, advanceCount: i === stages.length - 1 ? 1 : s.advanceCount })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <BackLink onClick={onCancel}>Abbrechen</BackLink>
      <section className="space-y-3">
        <SectionTitle>Wettkampf</SectionTitle>
        <input id="competition-name" className={inputClass} placeholder="Name, z. B. Herbst-Cup 2026" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Segmented value={discipline} onChange={setDiscipline} options={DISCIPLINES.map((d) => ({ value: d, label: d }))} />
      </section>

      <section>
        <SectionTitle>
          Teilnehmer ({selected.length} von {players.length})
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => {
            const on = selected.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold transition ${
                  on ? 'border-strong bg-strong text-strong-fg' : 'border-line bg-surface text-muted opacity-60'
                }`}
              >
                <Ball id={p.id} size="sm" />
                {p.name}
              </button>
            )
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-muted">Die Setzliste der ersten Etappe ergibt sich aus der aktuellen Elo.</p>
      </section>

      <section className="space-y-3">
        <SectionTitle>Etappen</SectionTitle>
        {stages.map((s, i) => {
          const last = i === stages.length - 1
          return (
            <Card key={i} className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-strong font-mono text-sm font-semibold text-strong-fg">{String(i + 1).padStart(2, '0')}</span>
                <input id={`stage-name-${i}`} className={`${inputClass} py-2`} value={s.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={60} />
                {stages.length > 1 && (
                  <button
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-bad"
                    onClick={() => setStages((st) => st.filter((_, j) => j !== i))}
                    aria-label="Etappe entfernen"
                  >
                    <XIcon size={16} />
                  </button>
                )}
              </div>
              <Segmented value={s.format} onChange={(format) => update(i, { format })} options={STAGE_FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">Race to</Label>
                  <Stepper label="Race to" value={s.raceTo} min={1} max={25} onChange={(raceTo) => update(i, { raceTo })} />
                </div>
                {!last && (
                  <div>
                    <Label className="mb-1.5">Kommen weiter</Label>
                    <Stepper
                      label="Weiterkommende"
                      value={s.advanceCount}
                      min={2}
                      max={Math.max(2, fieldBefore(i) - 1)}
                      onChange={(advanceCount) => update(i, { advanceCount })}
                    />
                  </div>
                )}
              </div>
            </Card>
          )
        })}
        {stages.length < 8 && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() =>
              setStages((st) => [
                ...st.slice(0, -1),
                { ...st.at(-1)!, advanceCount: Math.max(2, Math.floor(fieldBefore(st.length - 1) / 2)) },
                { name: `Etappe ${st.length + 1}`, format: 'knockout', raceTo: 5, advanceCount: 1 },
              ])
            }
          >
            <PlusIcon size={18} /> Etappe hinzufügen
          </Button>
        )}
      </section>

      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy || !name.trim() || selected.length < 2} onClick={submit}>
        {busy ? 'Wird angelegt …' : 'Wettkampf starten'}
      </Button>
    </div>
  )
}
