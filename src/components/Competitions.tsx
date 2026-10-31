import { useState } from 'react'
import type { NewCompetitionInput } from '../api.ts'
import { isStageComplete, knockoutBracket, openPairings, roundRobinStandings, type BracketSlot } from '../lib/competition.ts'
import { DISCIPLINES, STAGE_FORMATS, type AppState, type Competition, type Discipline, type Player, type Stage, type StageFormat } from '../lib/types.ts'
import { inputClass } from '../styles.ts'
import { Avatar, Badge, Button, Card, ConfirmButton, EmptyState, ErrorText, SectionTitle, Segmented, Stepper } from './ui.tsx'

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
                <Card className="p-4 transition hover:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold">{c.name}</div>
                      <div className="text-xs text-white/50">
                        {c.discipline} · {c.stages.length} {c.stages.length === 1 ? 'Etappe' : 'Etappen'}
                      </div>
                    </div>
                    {c.status === 'finished' ? <Badge tone="good">beendet</Badge> : <Badge tone="warn">läuft</Badge>}
                  </div>
                  <StageProgress stages={c.stages} />
                  <div className="mt-3 text-sm text-white/70">
                    {champion !== null ? (
                      <>🏆 Sieger: <span className="font-semibold text-white">{nameOf(state.players, champion)}</span></>
                    ) : current ? (
                      <>Aktuell: {current.name}</>
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
            s.status === 'finished' ? 'bg-felt-400' : s.status === 'running' ? 'bg-amber-300' : 'bg-white/10'
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
      <button onClick={onBack} className="text-sm text-felt-400">
        ← Alle Wettkämpfe
      </button>
      <div>
        <h2 className="text-2xl font-bold">{competition.name}</h2>
        <p className="text-sm text-white/50">{competition.discipline}</p>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          {competition.stages.map((s) => (
            <button
              key={s.id}
              onClick={() => setStageId(s.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                s.id === stage.id ? 'bg-felt-500 text-white' : 'bg-white/5 text-white/60'
              }`}
            >
              {s.position}. {s.name}
              {s.status === 'running' && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-300" />}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/50">
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
        <div className="grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem] gap-2 px-4 py-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
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
              i === cut - 1 ? 'border-b border-dashed border-felt-400/50' : 'border-b border-white/5'
            } ${r.playerId === state.me.id ? 'bg-felt-500/10' : ''}`}
          >
            <span className={`font-bold ${i < cut ? 'text-felt-400' : 'text-white/40'}`}>{i + 1}</span>
            <span className="truncate font-medium">{nameOf(state.players, r.playerId)}</span>
            <span className="text-right text-white/60 tabular-nums">{r.played}</span>
            <span className="text-right text-white/60 tabular-nums">
              {r.framesWon - r.framesLost > 0 ? '+' : ''}
              {r.framesWon - r.framesLost}
            </span>
            <span className="text-right font-bold tabular-nums">{r.points}</span>
          </div>
        ))}
      </Card>
      {open.length > 0 && (
        <section>
          <SectionTitle>Noch offen ({open.length})</SectionTitle>
          <Card className="divide-y divide-white/5">
            {open.map(([a, b]) => (
              <div key={`${a}-${b}`} className={`flex items-center justify-between px-4 py-2.5 text-sm ${a === state.me.id || b === state.me.id ? 'text-white' : 'text-white/60'}`}>
                <span>{nameOf(state.players, a)}</span>
                <span className="text-xs text-white/30">gegen</span>
                <span>{nameOf(state.players, b)}</span>
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
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-felt-400 uppercase">{roundName(r, rounds.length)}</div>
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
      <div className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${won ? 'font-semibold' : ''} ${lost || id === null ? 'text-white/35' : ''}`}>
        <span className={`truncate ${id === meId ? 'text-felt-400' : ''}`}>{id === null && slot.a === null && slot.b === null ? '–' : nameOf(players, id)}</span>
        {score !== undefined && <span className="tabular-nums">{score}</span>}
      </div>
    )
  }
  const m = slot.match
  const scoreFor = (id: number | null) => (m && id !== null ? (m.playerA === id ? m.scoreA : m.scoreB) : undefined)
  return (
    <Card className="divide-y divide-white/5 overflow-hidden">
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
      <button onClick={onCancel} className="text-sm text-felt-400">
        ← Abbrechen
      </button>
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
                className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition ${on ? 'bg-felt-500 text-white' : 'bg-white/5 text-white/50'}`}
              >
                <Avatar name={p.name} size="sm" />
                {p.name}
              </button>
            )
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-white/40">Die Setzliste der ersten Etappe ergibt sich aus der aktuellen Elo.</p>
      </section>

      <section className="space-y-3">
        <SectionTitle>Etappen</SectionTitle>
        {stages.map((s, i) => {
          const last = i === stages.length - 1
          return (
            <Card key={i} className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-felt-600 text-sm font-bold">{i + 1}</span>
                <input id={`stage-name-${i}`} className={`${inputClass} py-2`} value={s.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={60} />
                {stages.length > 1 && (
                  <button className="px-2 text-white/40 hover:text-rose-300" onClick={() => setStages((st) => st.filter((_, j) => j !== i))} aria-label="Etappe entfernen">
                    ✕
                  </button>
                )}
              </div>
              <Segmented value={s.format} onChange={(format) => update(i, { format })} options={STAGE_FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 px-1 text-xs text-white/50">Race to</div>
                  <Stepper label="Race to" value={s.raceTo} min={1} max={25} onChange={(raceTo) => update(i, { raceTo })} />
                </div>
                {!last && (
                  <div>
                    <div className="mb-1 px-1 text-xs text-white/50">Kommen weiter</div>
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
            + Etappe hinzufügen
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
