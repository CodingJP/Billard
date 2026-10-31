export const START_ELO = 1200
export const PROVISIONAL_MATCHES = 10
export const K_PROVISIONAL = 40
export const K_ESTABLISHED = 24

/** Probability that a player rated `ratingA` beats a player rated `ratingB`. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

/** Higher K while a player is new, so they find their level quickly. */
export function kFactor(matchesPlayed: number): number {
  return matchesPlayed < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_ESTABLISHED
}

/** Clear wins count more: 5:0 in race-to-5 gives 1.5, 5:4 gives 1.1. */
export function marginFactor(scoreA: number, scoreB: number, raceTo: number): number {
  const diff = Math.abs(scoreA - scoreB)
  return 1 + (0.5 * Math.min(diff, raceTo)) / raceTo
}

export interface EloInput {
  ratingA: number
  ratingB: number
  matchesA: number
  matchesB: number
  scoreA: number
  scoreB: number
  raceTo: number
}

export interface EloResult {
  deltaA: number
  deltaB: number
  expectedA: number
  margin: number
}

export function calculateElo(input: EloInput): EloResult {
  const { ratingA, ratingB, matchesA, matchesB, scoreA, scoreB, raceTo } = input
  if (scoreA === scoreB) throw new Error('A match needs a winner')
  const expectedA = expectedScore(ratingA, ratingB)
  const margin = marginFactor(scoreA, scoreB, raceTo)
  const resultA = scoreA > scoreB ? 1 : 0
  const deltaA = Math.round(kFactor(matchesA) * margin * (resultA - expectedA))
  const deltaB = Math.round(kFactor(matchesB) * margin * (1 - resultA - (1 - expectedA)))
  return { deltaA, deltaB, expectedA, margin }
}
