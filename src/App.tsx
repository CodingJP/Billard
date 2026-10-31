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
import { applyTheme, isDarkNow, loadTheme } from './theme.ts'
import { BellIcon, ListIcon, MoonIcon, PlusIcon, SunIcon, TargetIcon, TrophyIcon, UserIcon } from './components/icons.tsx'
import { ToastHost } from './components/ToastHost.tsx'
import { Ball } from './components/ui.tsx'

type Tab = 'ranking' | 'competitions' | 'duel' | 'games' | 'me'

const TABS: { id: Tab; label: string; icon: typeof TrophyIcon }[] = [
  { id: 'ranking', label: 'Rangliste', icon: TrophyIcon },
  { id: 'competitions', label: 'Cups', icon: TargetIcon },
  { id: 'duel', label: 'Duell', icon: PlusIcon },
  { id: 'games', label: 'Spiele', icon: ListIcon },
  { id: 'me', label: 'Profil', icon: UserIcon },
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
  duel: 'Duell',
  games: 'Spiele',
  me: 'Profil',
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [appName, setAppName] = useState('Billard')
  const [phase, setPhase] = useState<'loading' | 'auth' | 'ready' | 'offline'>('loading')
  const [tab, setTab] = useState<Tab>(() => tabFromUrl(window.location.href) ?? 'ranking')
  const [profileId, setProfileId] = useState<number | null>(null)
  const [challengeToPlay, setChallengeToPlay] = useState<number | null>(null)
  const [dark, setDark] = useState(isDarkNow)

  useEffect(() => {
    applyTheme(loadTheme())
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setDark(isDarkNow())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = () => {
    const next = !dark
    // Back to "follow the system" when the choice matches it anyway.
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(next === systemDark ? 'system' : next ? 'dark' : 'light')
    setDark(next)
  }

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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse">
          <Ball id={8} size="lg" />
        </div>
      </div>
    )
  }
  if (phase === 'offline') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Ball id={8} size="lg" />
        <p className="text-muted">Der Server ist gerade nicht erreichbar.</p>
        <button className="font-semibold underline underline-offset-4" onClick={load}>
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

  const openProfile = (id: number) => {
    setProfileId(id)
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

  const iconButton = 'relative flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-fg transition hover:bg-surface-2'

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-10 flex items-end justify-between gap-3 bg-bg/85 px-4 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3 backdrop-blur-lg">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10.5px] font-semibold tracking-[0.16em] text-muted uppercase">{state.appName}</p>
          <h1 className="mt-1 font-display text-[34px] leading-[0.9] font-extrabold uppercase">{showingOther ? 'Spieler' : TITLES[tab]}</h1>
        </div>
        <div className="flex shrink-0 gap-2 pb-0.5">
          <button className={iconButton} onClick={toggleTheme} aria-label={dark ? 'Helles Design' : 'Dunkles Design'}>
            {dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <button className={iconButton} onClick={() => go('games')} aria-label={toConfirm > 0 ? `${toConfirm} offen` : 'Spiele'}>
            <BellIcon size={18} />
            {toConfirm > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 font-mono text-[10px] font-semibold text-white ring-2 ring-bg">
                {toConfirm}
              </span>
            )}
          </button>
        </div>
      </header>

      <main key={showingOther ? `p${profileId}` : tab} className="view-in flex-1 px-4 pt-2 pb-32">
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
            <Ranking rows={rows} meId={me.id} onSelect={openProfile} />
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

      <ToastHost />

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/92 backdrop-blur-lg">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-1.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {TABS.map((t) => {
            const active = tab === t.id && !showingOther
            const Icon = t.icon
            const duel = t.id === 'duel'
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-1 py-1 text-[10.5px] font-semibold transition ${active ? 'text-fg' : 'text-muted'}`}
              >
                {duel ? (
                  <span className={`flex h-[34px] w-12 items-center justify-center rounded-xl bg-strong text-strong-fg transition ${active ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}>
                    <Icon size={20} className="[stroke-width:2.6]" />
                  </span>
                ) : (
                  <span className="flex h-[34px] items-center">
                    <Icon size={22} className={active ? '[stroke-width:2.4]' : ''} />
                  </span>
                )}
                {t.label}
                {t.id === 'games' && toConfirm > 0 && (
                  <span className="absolute top-0 left-1/2 ml-2 h-2.5 w-2.5 rounded-full bg-bad ring-2 ring-surface" />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
