import { useState } from 'react'
import type { PlayerStats } from '../lib/types'
import { Avatar, Button, Card, SectionTitle } from './ui'

export function Players({
  stats,
  onAdd,
  onSelect,
  onReset,
  onLoadDemo,
}: {
  stats: PlayerStats[]
  onAdd: (name: string) => void
  onSelect: (id: string) => void
  onReset: () => void
  onLoadDemo: () => void
}) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const duplicate = stats.some((s) => s.player.name.toLowerCase() === trimmed.toLowerCase())

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!trimmed || duplicate) return
          onAdd(trimmed)
          setName('')
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name des Spielers"
          maxLength={30}
          className="min-w-0 flex-1 rounded-xl bg-white/5 px-4 py-3 outline-none placeholder:text-white/30 focus:ring-2 focus:ring-felt-500"
        />
        <Button type="submit" disabled={!trimmed || duplicate}>
          Hinzufügen
        </Button>
      </form>
      {duplicate && <p className="-mt-4 px-1 text-xs text-amber-300">Diesen Namen gibt es schon.</p>}

      {stats.length > 0 && (
        <section>
          <SectionTitle>{stats.length} Spieler</SectionTitle>
          <Card className="divide-y divide-white/5 overflow-hidden">
            {[...stats]
              .sort((x, y) => x.player.name.localeCompare(y.player.name))
              .map((s) => (
                <button
                  key={s.player.id}
                  onClick={() => onSelect(s.player.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <Avatar name={s.player.name} size="sm" />
                  <span className="flex-1 font-medium">{s.player.name}</span>
                  <span className="text-sm text-white/50 tabular-nums">{s.matches} Matches</span>
                </button>
              ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Daten</SectionTitle>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onLoadDemo}>
            Demo laden
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              if (confirm('Alle Spieler und Matches löschen?')) onReset()
            }}
          >
            Alles löschen
          </Button>
        </div>
        <p className="mt-2 px-1 text-xs text-white/40">
          Prototyp: Die Daten liegen nur in diesem Browser. Gruppen mit Login folgen im MVP.
        </p>
      </section>
    </div>
  )
}
