import { useCallback, useEffect, useState } from 'react'
import type { Match, Player } from './types'

const STORAGE_KEY = 'billard:v1'

export interface Data {
  players: Player[]
  matches: Match[]
}

const EMPTY: Data = { players: [], matches: [] }

function load(): Data {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Data>
    return { players: parsed.players ?? [], matches: parsed.matches ?? [] }
  } catch {
    return EMPTY
  }
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useStore() {
  const [data, setData] = useState<Data>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage can be unavailable (private mode); the app still works for this session.
    }
  }, [data])

  const addPlayer = useCallback((name: string) => {
    const player: Player = { id: newId(), name: name.trim(), createdAt: new Date().toISOString() }
    setData((d) => ({ ...d, players: [...d.players, player] }))
    return player
  }, [])

  const renamePlayer = useCallback((id: string, name: string) => {
    setData((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) }))
  }, [])

  const addMatch = useCallback((match: Omit<Match, 'id' | 'playedAt'>) => {
    const full: Match = { ...match, id: newId(), playedAt: new Date().toISOString() }
    setData((d) => ({ ...d, matches: [...d.matches, full] }))
    return full
  }, [])

  const deleteMatch = useCallback((id: string) => {
    setData((d) => ({ ...d, matches: d.matches.filter((m) => m.id !== id) }))
  }, [])

  const reset = useCallback(() => setData(EMPTY), [])

  const loadDemo = useCallback(() => setData(demoData()), [])

  return { data, addPlayer, renamePlayer, addMatch, deleteMatch, reset, loadDemo }
}

function demoData(): Data {
  const names = ['Anna', 'Ben', 'Cem', 'Dana', 'Elif', 'Finn']
  const players: Player[] = names.map((name, i) => ({
    id: `demo-${i}`,
    name,
    createdAt: '2026-09-01T18:00:00.000Z',
  }))
  // Fixed results so the demo looks the same every time.
  const results: [number, number, number, number][] = [
    [0, 1, 5, 3], [2, 3, 5, 4], [4, 5, 2, 5], [0, 2, 5, 1], [1, 3, 5, 2],
    [5, 0, 5, 4], [3, 4, 1, 5], [2, 1, 5, 3], [0, 4, 5, 2], [5, 3, 5, 0],
    [1, 4, 4, 5], [2, 5, 5, 4], [0, 3, 5, 3], [4, 2, 5, 2], [1, 5, 3, 5],
    [0, 1, 5, 4], [3, 2, 5, 3], [4, 0, 3, 5],
  ]
  const start = Date.parse('2026-10-01T19:00:00.000Z')
  const matches: Match[] = results.map(([a, b, sa, sb], i) => ({
    id: `demo-m${i}`,
    discipline: i % 3 === 0 ? '9-Ball' : '8-Ball',
    raceTo: 5,
    playerA: players[a].id,
    playerB: players[b].id,
    scoreA: sa,
    scoreB: sb,
    playedAt: new Date(start + i * 36 * 3600 * 1000).toISOString(),
  }))
  return { players, matches }
}
