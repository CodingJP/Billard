import { describe, expect, it } from 'vitest'
import { computeRatings, headToHead, ranking } from './ratings.ts'
import type { Match, Player } from './types.ts'

const ANNA = 1
const BEN = 2
const CEM = 3

const players: Player[] = [
  { id: ANNA, name: 'Anna', isAdmin: false, createdAt: '2026-10-01' },
  { id: BEN, name: 'Ben', isAdmin: false, createdAt: '2026-10-01' },
  { id: CEM, name: 'Cem', isAdmin: false, createdAt: '2026-10-01' },
]

let nextId = 1
const match = (a: number, b: number, sa: number, sb: number, at: string, extra: Partial<Match> = {}): Match => ({
  id: nextId++,
  discipline: '8-Ball',
  raceTo: 3,
  playerA: a,
  playerB: b,
  scoreA: sa,
  scoreB: sb,
  playedAt: at,
  rated: true,
  status: 'confirmed',
  createdBy: a,
  stageId: null,
  ...extra,
})

describe('computeRatings', () => {
  it('starts everyone at 1200', () => {
    const state = computeRatings(players, [])
    expect(ranking(state).map((s) => s.elo)).toEqual([1200, 1200, 1200])
  })

  it('replays matches in chronological order regardless of input order', () => {
    const m1 = match(ANNA, BEN, 3, 0, '2026-10-02T20:00')
    const m2 = match(BEN, CEM, 3, 2, '2026-10-03T20:00')
    const forward = computeRatings(players, [m1, m2])
    const backward = computeRatings(players, [m2, m1])
    expect(ranking(forward).map((s) => [s.player.id, s.elo])).toEqual(
      ranking(backward).map((s) => [s.player.id, s.elo]),
    )
    expect(ranking(forward)[0].player.id).toBe(ANNA)
  })

  it('tracks form and streaks', () => {
    const ms = [
      match(ANNA, BEN, 3, 1, '2026-10-02'),
      match(ANNA, CEM, 3, 2, '2026-10-03'),
      match(BEN, ANNA, 3, 0, '2026-10-04'),
    ]
    const anna = computeRatings(players, ms).stats.get(ANNA)!
    expect(anna.form).toEqual([false, true, true])
    expect(anna.bestStreak).toBe(2)
    expect(anna.streak).toBe(-1)
    expect(anna.framesWon).toBe(6)
  })
})

describe('confirmation and rating rules', () => {
  it('ignores pending, rejected and unrated matches for Elo', () => {
    const ms = [
      match(ANNA, BEN, 3, 0, '2026-10-02', { status: 'pending' }),
      match(ANNA, BEN, 3, 0, '2026-10-03', { status: 'rejected' }),
      match(ANNA, BEN, 3, 0, '2026-10-04', { rated: false }),
    ]
    const state = computeRatings(players, ms)
    expect(state.stats.get(ANNA)!.elo).toBe(1200)
    expect(state.stats.get(ANNA)!.matches).toBe(0)
    expect(state.changes).toEqual([])
  })

  it('counts unrated but confirmed matches in head-to-head', () => {
    const ms = [match(ANNA, BEN, 3, 0, '2026-10-04', { rated: false })]
    expect(headToHead(ANNA, players, ms)).toEqual([{ opponent: players[1], wins: 1, losses: 0 }])
  })
})

describe('headToHead', () => {
  it('counts wins and losses per opponent', () => {
    const ms = [
      match(ANNA, BEN, 3, 1, '2026-10-02'),
      match(BEN, ANNA, 3, 2, '2026-10-03'),
      match(ANNA, BEN, 3, 0, '2026-10-04'),
    ]
    const h = headToHead(ANNA, players, ms)
    expect(h).toEqual([{ opponent: players[1], wins: 2, losses: 1 }])
  })
})
