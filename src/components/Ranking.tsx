import type { PlayerStats } from '../lib/types.ts'
import { Badge, Ball, Card, Delta, Form } from './ui.tsx'

export function Ranking({ rows, meId, onSelect }: { rows: PlayerStats[]; meId: number; onSelect: (id: number) => void }) {
  const leader = rows[0]?.matches > 0 ? rows[0] : null
  const rest = leader ? rows.slice(1) : rows
  const offset = leader ? 2 : 1
  const mine = rows.findIndex((r) => r.player.id === meId)

  return (
    <div className="space-y-3">
      {leader && (
        <button
          onClick={() => onSelect(leader.player.id)}
          className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[22px] bg-strong p-4 text-left text-strong-fg transition active:scale-[0.99]"
        >
          <Ball id={leader.player.id} size="lg" />
          <div className="min-w-0">
            <div className="font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase opacity-70">Platz 1</div>
            <div className="mt-1 truncate text-xl font-extrabold">{leader.player.name}</div>
            <div className="mt-1.5 truncate font-mono text-[11px] font-semibold whitespace-nowrap opacity-80">
              {leader.wins}–{leader.losses}
              {leader.streak >= 2 && ` · ${leader.streak}er-Serie`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-[46px] leading-[0.85] font-extrabold tabular-nums">{leader.elo}</div>
            <div className="mt-1 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase opacity-70">Elo</div>
          </div>
        </button>
      )}

      {mine > 0 && rows[mine].matches > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-line px-4 py-2.5 text-sm">
          <span className="text-muted">Dein Platz</span>
          <span className="font-mono font-semibold">
            #{mine + 1} von {rows.length}
          </span>
        </div>
      )}

      <Card className="divide-y divide-line overflow-hidden">
        {rest.map((s, i) => {
          const isMe = s.player.id === meId
          return (
            <button
              key={s.player.id}
              onClick={() => onSelect(s.player.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 ${isMe ? 'bg-accent/15' : ''}`}
            >
              <span className="w-6 font-mono text-[13px] font-semibold text-muted tabular-nums">{String(i + offset).padStart(2, '0')}</span>
              <Ball id={s.player.id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{s.player.name}</span>
                  {isMe && <Badge tone="warn">du</Badge>}
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] font-medium text-muted">
                  <span className="whitespace-nowrap tabular-nums">
                    {s.wins}–{s.losses}
                  </span>
                  <Form form={s.form} />
                  {s.matches > 0 && s.matches < 10 && <Badge>neu</Badge>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-[26px] leading-none font-bold tabular-nums">{s.elo}</div>
                <div className="mt-0.5">{s.matches > 0 ? <Delta value={s.lastDelta} /> : <span className="font-mono text-[11px] text-muted">–</span>}</div>
              </div>
            </button>
          )
        })}
      </Card>
      <p className="px-1 text-xs leading-relaxed text-muted">
        Nur bestätigte, gewertete Spiele zählen. „Neu“ heißt: weniger als 10 Spiele, die Elo bewegt sich noch stärker.
      </p>
    </div>
  )
}
