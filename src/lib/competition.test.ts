import { describe, expect, it } from 'vitest'
import {
  advancingPlayers,
  canPlayInStage,
  isStageComplete,
  knockoutBracket,
  openRoundRobinPairings,
  roundRobinStandings,
  seedOrder,
  stageRanking,
} from './competition.ts'
import type { Match, Stage } from './types.ts'

const stage = (format: Stage['format'], players: number[], advanceCount = 2): Stage => ({
  id: 7,
  competitionId: 1,
  position: 1,
  name: 'Test',
  format,
  raceTo: 3,
  advanceCount,
  status: 'running',
  players,
})

let id = 1
const m = (a: number, b: number, sa: number, sb: number, extra: Partial<Match> = {}): Match => ({
  id: id++,
  discipline: '8-Ball',
  raceTo: 3,
  playerA: a,
  playerB: b,
  scoreA: sa,
  scoreB: sb,
  rated: true,
  status: 'confirmed',
  createdBy: a,
  playedAt: `2026-10-${String(id).padStart(2, '0')}`,
  stageId: 7,
  ...extra,
})

describe('round robin', () => {
  it('builds the table with points and tie breakers', () => {
    const s = stage('round_robin', [1, 2, 3])
    const matches = [m(1, 2, 3, 1), m(2, 3, 3, 0), m(3, 1, 3, 2)]
    // Three-way tie on points: frame difference (1 and 2 at +1), then frames won (1 has 5).
    const table = roundRobinStandings(s, matches)
    expect(table.map((r) => r.points)).toEqual([2, 2, 2])
    expect(table.map((r) => r.playerId)).toEqual([1, 2, 3])
    expect(isStageComplete(s, matches)).toBe(true)
  })

  it('uses the direct match when points and frames are level', () => {
    const s = stage('round_robin', [1, 2])
    const table = roundRobinStandings(s, [m(2, 1, 3, 2)])
    expect(table[0].playerId).toBe(2)
  })

  it('lists open pairings and ignores matches from other stages', () => {
    const s = stage('round_robin', [1, 2, 3])
    const open = openRoundRobinPairings(s, [m(1, 2, 3, 0), m(1, 3, 3, 0, { stageId: 99 })])
    expect(open).toEqual([
      [1, 3],
      [2, 3],
    ])
  })

  it('does not allow a pair to play twice', () => {
    const s = stage('round_robin', [1, 2, 3])
    expect(canPlayInStage(s, [m(1, 2, 3, 0, { status: 'pending' })], 2, 1)).toBe(false)
    expect(canPlayInStage(s, [], 2, 1)).toBe(true)
  })
})

describe('knockout', () => {
  it('seeds a standard bracket', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('gives byes to the best seeds', () => {
    const s = stage('knockout', [10, 20, 30])
    const rounds = knockoutBracket(s, [])
    expect(rounds).toHaveLength(2)
    expect(rounds[0][0]).toMatchObject({ a: 10, b: null, winner: 10 })
    expect(rounds[0][1]).toMatchObject({ a: 20, b: 30, winner: null })
    expect(canPlayInStage(s, [], 20, 30)).toBe(true)
    expect(canPlayInStage(s, [], 10, 20)).toBe(false)
  })

  it('advances winners and ranks by elimination round', () => {
    const s = stage('knockout', [1, 2, 3, 4], 1)
    const matches = [m(1, 4, 3, 0), m(2, 3, 1, 3), m(1, 3, 2, 3)]
    const rounds = knockoutBracket(s, matches)
    expect(rounds[1][0]).toMatchObject({ a: 1, b: 3, winner: 3 })
    expect(isStageComplete(s, matches)).toBe(true)
    expect(stageRanking(s, matches)).toEqual([3, 1, 2, 4])
    expect(advancingPlayers(s, matches)).toEqual([3])
  })
})
