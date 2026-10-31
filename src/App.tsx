import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api.ts'
import { AuthScreen } from './components/AuthScreen.tsx'
import { CompetitionsScreen } from './components/Competitions.tsx'
import { GamesScreen } from './components/History.tsx'
import { AccountCard, InviteCard } from './components/MeScreen.tsx'
import { NewMatch } from './components/NewMatch.tsx'
import { PlayerProfile } from './components/PlayerProfile.tsx'
import { PushCard, PushPrompt } from './components/PushSettings.tsx'
import { Ranking } from './components/Ranking.tsx'
import { computeRatings, ranking } from './lib/ratings.ts'
import type { AppState } from './lib/types.ts'
import { syncPushSubscription } from './push.ts'

type Tab = 'ranking' | 'competitions' | 'duel' | 'games' | 'me'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ranking', label: 'Rangliste', icon: '🏆' },
  { id: 'competitions', label: 'Wettkämpfe', icon: '🎯' },
  { id: 'duel', label: 'Duell', icon: '＋' },
  { id: 'games', label: 'Spiele', icon: '🎱' },
  { id: 'me', label: 'Profil', icon: '👤' },
]

const isTab = (value: string | null): value is Tab => TABS.some((t) => t.id === value)

/** Deep links like /?tab=games come from push notifications. */
function tabFromUrl(url: string): Tab | null {
  const tab = new URL(url, window.location.origin).searchParams.get('tab')
  return isTab(tab) ? tab : null
}

const TITLES: Record<Tab, string> = {
  ranking: 'Rangliste',
  competitions: 'Wettkämpfe',
  duel: 'Duell eintragen',
  games: 'Spiele',
  me: 'Dein Profil',
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [appName, setAppName] = useState('Billard')
  const [phase, setPhase] = useState<'loading' | 'auth' | 'ready' | 'offline'>('loading')
  const [tab, setTab] = useState<Tab>(() => tabFromUrl(window.location.href) ?? 'ranking')
  const [profileId, setProfileId] = useState<number | null>(null)
  const [challengeToPlay, setChallengeToPlay] = useState<number | null>(null)

  useEffect(() => {
    if (tabFromUrl(window.location.href)) window.history.replaceState(null, '', '/')
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'navigate') return
      const next = tabFromUrl(String(event.data.url))
      if (next) {
        setProfileId(null)
        setTab(next)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (phase === 'ready') syncPushSubscription()
  }, [phase])

  const load = useCallback(async () => {
    try {
      const s = await api.state()
      setState(s)
      setAppName(s.appName)
      setPhase('ready')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        api.info().then((i) => setAppName(i.appName)).catch(() => {})
        setPhase('auth')
      } else {
        setPhase('offline')
      }
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Pick up confirmations from other players without a manual reload.
  useEffect(() => {
    if (phase !== 'ready') return
    const refresh = () => document.visibilityState === 'visible' && load()
    const timer = setInterval(refresh, 20000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [phase, load])

  useEffect(() => {
    document.title = appName
  }, [appName])

  const ratings = useMemo(() => (state ? computeRatings(state.players, state.matches) : null), [state])
  const rows = useMemo(() => (ratings ? ranking(ratings) : []), [ratings])
  const stageNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of state?.competitions ?? []) for (const s of c.stages) map.set(s.id, `${c.name} · ${s.name}`)
    return map
  }, [state])

  if (phase === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-white/40">Lädt …</div>
  }
  if (phase === 'offline') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/70">Der Server ist gerade nicht erreichbar.</p>
        <button className="text-felt-400" onClick={load}>
          Erneut versuchen
        </button>
      </div>
    )
  }
  if (phase === 'auth' || !state || !ratings) {
    return (
      <AuthScreen
        appName={appName}
        onDone={(s) => {
          setState(s)
          setPhase('ready')
          setTab('ranking')
        }}
      />
    )
  }

  const me = state.me
  const toConfirm =
    state.matches.filter((m) => m.status === 'pending' && m.createdBy !== me.id && (m.playerA === me.id || m.playerB === me.id))
      .length + state.challenges.filter((c) => c.status === 'pending' && c.opponent === me.id).length

  const go = (next: Tab) => {
    setProfileId(null)
    setChallengeToPlay(null)
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  const profileIndex = rows.findIndex((r) => r.player.id === (profileId ?? (tab === 'me' ? me.id : -1)))
  const profile = profileIndex >= 0 ? rows[profileIndex] : null
  const showingOther = profileId !== null && profile

  const logout = async () => {
    await api.logout().catch(() => {})
    setState(null)
    setPhase('auth')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-10 bg-felt-950/85 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 backdrop-blur-lg">
        <p className="text-xs font-semibold tracking-[0.25em] text-felt-400 uppercase">{state.appName}</p>
        <h1 className="text-2xl font-bold">{showingOther ? 'Spielerprofil' : TITLES[tab]}</h1>
      </header>

      <main className="flex-1 px-4 pb-32">
        {showingOther ? (
          <PlayerProfile
            stats={profile}
            rank={profileIndex + 1}
            players={state.players}
            matches={state.matches}
            changes={ratings.changes}
            stageNames={stageNames}
            onBack={() => setProfileId(null)}
            onChallenge={profile.player.id === me.id ? undefined : async (input) => setState(await api.challenge(input))}
          />
        ) : tab === 'ranking' ? (
          <div className="space-y-4">
            <PushPrompt />
            <Ranking rows={rows} meId={me.id} onSelect={setProfileId} />
          </div>
        ) : tab === 'competitions' ? (
          <CompetitionsScreen
            state={state}
            onCreate={async (input) => {
              const r = await api.createCompetition(input)
              setState(r.state)
              return r.id
            }}
            onAdvance={async (id) => setState(await api.advance(id))}
            onDelete={async (id) => setState(await api.deleteCompetition(id))}
          />
        ) : tab === 'duel' ? (
          <NewMatch
            key={challengeToPlay ?? 'free'}
            challengeId={challengeToPlay}
            state={state}
            stats={rows}
            onSubmit={async (input) => setState((await api.addMatch(input)).state)}
            onDone={() => go('games')}
          />
        ) : tab === 'games' ? (
          <GamesScreen
            state={state}
            changes={ratings.changes}
            stageNames={stageNames}
            onConfirm={async (id) => setState(await api.confirm(id))}
            onReject={async (id) => setState(await api.reject(id))}
            onDelete={async (id) => setState(await api.deleteMatch(id))}
            challenges={{
              create: async (input) => setState(await api.challenge(input)),
              accept: async (id) => setState(await api.acceptChallenge(id)),
              decline: async (id) => setState(await api.declineChallenge(id)),
              cancel: async (id) => setState(await api.cancelChallenge(id)),
              play: (c) => {
                go('duel')
                setChallengeToPlay(c.id)
              },
            }}
          />
        ) : profile ? (
          <PlayerProfile
            stats={profile}
            rank={profileIndex + 1}
            players={state.players}
            matches={state.matches}
            changes={ratings.changes}
            stageNames={stageNames}
          >
            <PushCard />
            {me.isAdmin && <InviteCard appName={state.appName} />}
            <AccountCard onLogout={logout} />
          </PlayerProfile>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-white/5 bg-felt-950/90 backdrop-blur-lg">
        <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => {
            const active = tab === t.id && !showingOther
            const duel = t.id === 'duel'
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? 'text-felt-400' : 'text-white/50'}`}
              >
                <span
                  className={
                    duel
                      ? '-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-felt-500 text-2xl font-bold text-white shadow-[0_6px_24px_rgba(31,157,92,0.5)] ring-4 ring-felt-950'
                      : 'text-xl leading-8'
                  }
                >
                  {t.icon}
                </span>
                {t.label}
                {t.id === 'games' && toConfirm > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
                    {toConfirm}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
