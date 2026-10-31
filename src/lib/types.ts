export type Discipline = '8-Ball' | '9-Ball' | '10-Ball' | '14/1'

export const DISCIPLINES: Discipline[] = ['8-Ball', '9-Ball', '10-Ball', '14/1']

export interface Player {
  id: string
  name: string
  createdAt: string
}

export interface Match {
  id: string
  discipline: Discipline
  raceTo: number
  playerA: string
  playerB: string
  scoreA: number
  scoreB: number
  playedAt: string
}

export interface RatingChange {
  matchId: string
  playerId: string
  before: number
  after: number
}

export interface PlayerStats {
  player: Player
  elo: number
  matches: number
  wins: number
  losses: number
  framesWon: number
  framesLost: number
  /** Last results, newest first: true = win */
  form: boolean[]
  /** Elo change from the most recent match */
  lastDelta: number
  streak: number
  bestStreak: number
}
