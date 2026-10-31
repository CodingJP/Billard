import { isConfirmed, sortByPlayedAt } from './ratings.ts'
import type { Match, Stage } from './types.ts'

export interface StandingRow {
  playerId: number
  played: number
  wins: number
  losses: number
  points: number
  framesWon: number
  framesLost: number
}

export const POINTS_PER_WIN = 2

function stageMatches(stage: Stage, matches: Match[]): Match[] {
  return sortByPlayedAt(matches.filter((m) => m.stageId === stage.id && isConfirmed(m)))
}

function winnerOf(m: Match): number {
  return m.scoreA > m.scoreB ? m.playerA : m.playerB
}

function samePair(m: Match, a: number, b: number): boolean {
  return (m.playerA === a && m.playerB === b) || (m.playerA === b && m.playerB === a)
}

/** All pairings of a round-robin stage. */
export function roundRobinPairings(players: number[]): [number, number][] {
  const pairs: [number, number][] = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) pairs.push([players[i], players[j]])
  }
  return pairs
}

/** Pairings of a round-robin stage that still have no confirmed or pending match. */
export function openRoundRobinPairings(stage: Stage, matches: Match[]): [number, number][] {
  const relevant = matches.filter((m) => m.stageId === stage.id && m.status !== 'rejected')
  return roundRobinPairings(stage.players).filter(([a, b]) => !relevant.some((m) => samePair(m, a, b)))
}

/**
 * Round-robin table: 2 points per win. A tie between exactly two players is
 * broken by their direct match; otherwise (and after that) by frame
 * difference, frames won, then seed.
 */
export function roundRobinStandings(stage: Stage, matches: Match[]): StandingRow[] {
  const rows = new Map<number, StandingRow>()
  for (const id of stage.players) {
    rows.set(id, { playerId: id, played: 0, wins: 0, losses: 0, points: 0, framesWon: 0, framesLost: 0 })
  }
  const played = stageMatches(stage, matches)
  for (const m of played) {
    const a = rows.get(m.playerA)
    const b = rows.get(m.playerB)
    if (!a || !b) continue
    const aWon = m.scoreA > m.scoreB
    for (const [row, own, other, won] of [
      [a, m.scoreA, m.scoreB, aWon],
      [b, m.scoreB, m.scoreA, !aWon],
    ] as const) {
      row.played += 1
      row.framesWon += own
      row.framesLost += other
      if (won) {
        row.wins += 1
        row.points += POINTS_PER_WIN
      } else {
        row.losses += 1
      }
    }
  }

  const seed = (id: number) => stage.players.indexOf(id)
  const direct = (x: number, y: number) => {
    const m = played.findLast((match) => samePair(match, x, y))
    if (!m) return 0
    return winnerOf(m) === x ? -1 : 1
  }

  const all = [...rows.values()]
  const tiedOnPoints = (points: number) => all.filter((r) => r.points === points).length
  return all.sort(
    (x, y) =>
      y.points - x.points ||
      (tiedOnPoints(x.points) === 2 ? direct(x.playerId, y.playerId) : 0) ||
      y.framesWon - y.framesLost - (x.framesWon - x.framesLost) ||
      y.framesWon - x.framesWon ||
      seed(x.playerId) - seed(y.playerId),
  )
}

export interface BracketSlot {
  a: number | null
  b: number | null
  winner: number | null
  match: Match | null
}

/** Seed positions for a bracket of `size` (power of two), e.g. 8 → 1,8,4,5,2,7,3,6. */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

/**
 * Knockout bracket built from the seed list. Missing seeds become byes, so
 * the best seeds advance without playing in round one.
 */
export function knockoutBracket(stage: Stage, matches: Match[]): BracketSlot[][] {
  const n = stage.players.length
  if (n < 2) return []
  let size = 1
  while (size < n) size *= 2
  const played = stageMatches(stage, matches)
  const seeded = seedOrder(size).map((s) => stage.players.at(s - 1) ?? null)

  const resolve = (a: number | null, b: number | null): BracketSlot => {
    if (a === null || b === null) return { a, b, winner: a ?? b, match: null }
    const match = played.findLast((m) => samePair(m, a, b)) ?? null
    return { a, b, winner: match ? winnerOf(match) : null, match }
  }

  const rounds: BracketSlot[][] = []
  let entrants: (number | null)[] = seeded
  while (entrants.length > 1) {
    const round: BracketSlot[] = []
    for (let i = 0; i < entrants.length; i += 2) round.push(resolve(entrants[i], entrants[i + 1]))
    rounds.push(round)
    entrants = round.map((slot) => slot.winner)
  }
  return rounds
}

/** Pairs in a knockout stage that are ready to be played right now. */
export function openKnockoutPairings(stage: Stage, matches: Match[]): [number, number][] {
  const pending = matches.filter((m) => m.stageId === stage.id && m.status === 'pending')
  return knockoutBracket(stage, matches)
    .flat()
    .filter((s) => s.a !== null && s.b !== null && s.winner === null)
    .map((s) => [s.a!, s.b!] as [number, number])
    .filter(([a, b]) => !pending.some((m) => samePair(m, a, b)))
}

export function openPairings(stage: Stage, matches: Match[]): [number, number][] {
  return stage.format === 'knockout' ? openKnockoutPairings(stage, matches) : openRoundRobinPairings(stage, matches)
}

/** Final order of a stage: table order, or for knockout by the round a player went out. */
export function stageRanking(stage: Stage, matches: Match[]): number[] {
  if (stage.format === 'round_robin') return roundRobinStandings(stage, matches).map((r) => r.playerId)
  const rounds = knockoutBracket(stage, matches)
  const champion = rounds.at(-1)?.[0]?.winner
  const out: number[][] = rounds.map(() => [])
  rounds.forEach((round, r) => {
    for (const slot of round) {
      if (slot.winner === null) continue
      const loser = slot.a === slot.winner ? slot.b : slot.a
      if (loser !== null) out[r].push(loser)
    }
  })
  const seed = (id: number) => stage.players.indexOf(id)
  const ranked = [champion, ...out.reverse().flatMap((ids) => ids.sort((x, y) => seed(x) - seed(y)))]
  const rest = stage.players.filter((id) => !ranked.includes(id))
  return [...ranked.filter((id): id is number => id !== null && id !== undefined), ...rest]
}

export function isStageComplete(stage: Stage, matches: Match[]): boolean {
  if (stage.format === 'round_robin') {
    const done = stageMatches(stage, matches)
    return roundRobinPairings(stage.players).every(([a, b]) => done.some((m) => samePair(m, a, b)))
  }
  const final = knockoutBracket(stage, matches).at(-1)?.[0]
  return !!final && final.winner !== null
}

/** Players that move on to the next stage, in their new seed order. */
export function advancingPlayers(stage: Stage, matches: Match[]): number[] {
  return stageRanking(stage, matches).slice(0, stage.advanceCount)
}

/** Whether a new match between a and b is allowed in this stage right now. */
export function canPlayInStage(stage: Stage, matches: Match[], a: number, b: number): boolean {
  if (stage.status !== 'running') return false
  return openPairings(stage, matches).some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}
