import { useMemo, useState } from 'react'
import { MatchList } from './components/History'
import { NewMatch } from './components/NewMatch'
import { PlayerProfile } from './components/PlayerProfile'
import { Players } from './components/Players'
import { Ranking } from './components/Ranking'
import { computeRatings, ranking } from './lib/ratings'
import { useStore } from './lib/store'

type Tab = 'ranking' | 'match' | 'history' | 'players'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ranking', label: 'Rangliste', icon: '🏆' },
  { id: 'match', label: 'Match', icon: '＋' },
  { id: 'history', label: 'Verlauf', icon: '🕑' },
  { id: 'players', label: 'Spieler', icon: '👥' },
]

const TITLES: Record<Tab, string> = {
  ranking: 'Rangliste',
  match: 'Match eintragen',
  history: 'Verlauf',
  players: 'Spieler',
}

export default function App() {
  const { data, addPlayer, addMatch, deleteMatch, reset, loadDemo } = useStore()
  const [tab, setTab] = useState<Tab>('ranking')
  const [profileId, setProfileId] = useState<string | null>(null)

  const state = useMemo(() => computeRatings(data.players, data.matches), [data])
  const rows = useMemo(() => ranking(state), [state])
  const profileIndex = rows.findIndex((r) => r.player.id === profileId)
  const profile = profileIndex >= 0 ? rows[profileIndex] : null

  const go = (next: Tab) => {
    setProfileId(null)
    setTab(next)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-10 bg-felt-950/90 px-4 pt-5 pb-3 backdrop-blur">
        <p className="text-xs font-semibold tracking-widest text-felt-400 uppercase">Billard · Freundesliga</p>
        <h1 className="text-2xl font-bold">{profile ? 'Spielerprofil' : TITLES[tab]}</h1>
      </header>

      <main className="flex-1 px-4 pb-28">
        {profile ? (
          <PlayerProfile
            stats={profile}
            rank={profileIndex + 1}
            players={data.players}
            matches={data.matches}
            changes={state.changes}
            onBack={() => setProfileId(null)}
          />
        ) : tab === 'ranking' ? (
          <Ranking rows={rows} onSelect={setProfileId} onAddPlayers={() => go('players')} onLoadDemo={loadDemo} />
        ) : tab === 'match' ? (
          <NewMatch stats={rows} onSave={addMatch} onAddPlayers={() => go('players')} />
        ) : tab === 'history' ? (
          <MatchList matches={data.matches} players={data.players} changes={state.changes} onDelete={deleteMatch} />
        ) : (
          <Players stats={rows} onAdd={addPlayer} onSelect={setProfileId} onReset={reset} onLoadDemo={loadDemo} />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-white/5 bg-felt-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => {
            const active = tab === t.id && !profile
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${active ? 'text-felt-400' : 'text-white/50'}`}
              >
                <span
                  className={
                    t.id === 'match'
                      ? 'flex h-8 w-8 items-center justify-center rounded-full bg-felt-500 text-lg font-bold text-white'
                      : 'text-xl leading-8'
                  }
                >
                  {t.icon}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
