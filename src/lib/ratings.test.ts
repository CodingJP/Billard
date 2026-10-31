import { describe, expect, it } from 'vitest'
import { computeRatings, headToHead, ranking } from './ratings'
import type { Match, Player } from './types'

const players: Player[] = [
  { id: 'anna', name: 'Anna', createdAt: '2026-10-01' },
  { id: 'ben', name: 'Ben', createdAt: '2026-10-01' },
  { id: 'cem', name: 'Cem', createdAt: '2026-10-01' },
]

const match = (id: string, a: string, b: string, sa: number, sb: number, at: string): Match => ({
  id,
  discipline: '8-Ball',
  raceTo: 3,
  playerA: a,
  playerB: b,
  scoreA: sa,
  scoreB: sb,
  playedAt: at,
})

describe('computeRatings', () => {
  it('starts everyone at 1200', () => {
    const state = computeRatings(players, [])
    expect(ranking(state).map((s) => s.elo)).toEqual([1200, 1200, 1200])
  })

  it('replays matches in chronological order regardless of input order', () => {
    const m1 = match('m1', 'anna', 'ben', 3, 0, '2026-10-02T20:00')
    const m2 = match('m2', 'ben', 'cem', 3, 2, '2026-10-03T20:00')
    const forward = computeRatings(players, [m1, m2])
    const backward = computeRatings(players, [m2, m1])
    expect(ranking(forward).map((s) => [s.player.id, s.elo])).toEqual(
      ranking(backward).map((s) => [s.player.id, s.elo]),
    )
    expect(ranking(forward)[0].player.id).toBe('anna')
  })

  it('tracks form and streaks', () => {
    const ms = [
      match('m1', 'anna', 'ben', 3, 1, '2026-10-02'),
      match('m2', 'anna', 'cem', 3, 2, '2026-10-03'),
      match('m3', 'ben', 'anna', 3, 0, '2026-10-04'),
    ]
    const anna = computeRatings(players, ms).stats.get('anna')!
    expect(anna.form).toEqual([false, true, true])
    expect(anna.bestStreak).toBe(2)
    expect(anna.streak).toBe(-1)
    expect(anna.framesWon).toBe(6)
  })
})

describe('headToHead', () => {
  it('counts wins and losses per opponent', () => {
    const ms = [
      match('m1', 'anna', 'ben', 3, 1, '2026-10-02'),
      match('m2', 'ben', 'anna', 3, 2, '2026-10-03'),
      match('m3', 'anna', 'ben', 3, 0, '2026-10-04'),
    ]
    const h = headToHead('anna', players, ms)
    expect(h).toEqual([{ opponent: players[1], wins: 2, losses: 1 }])
  })
})
