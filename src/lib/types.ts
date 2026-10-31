export type Discipline = '8-Ball' | '9-Ball' | '10-Ball' | '14/1'

export const DISCIPLINES: Discipline[] = ['8-Ball', '9-Ball', '10-Ball', '14/1']

export interface Player {
  id: number
  name: string
  isAdmin: boolean
  createdAt: string
}

export type MatchStatus = 'pending' | 'confirmed' | 'rejected'

export interface Match {
  id: number
  discipline: Discipline
  raceTo: number
  playerA: number
  playerB: number
  scoreA: number
  scoreB: number
  /** Unrated matches show up in the history but never change Elo. */
  rated: boolean
  status: MatchStatus
  /** The player who entered the result. The other player has to confirm it. */
  createdBy: number
  playedAt: string
  stageId: number | null
}

export type StageFormat = 'round_robin' | 'knockout'

export const STAGE_FORMATS: { id: StageFormat; label: string }[] = [
  { id: 'round_robin', label: 'Jeder gegen jeden' },
  { id: 'knockout', label: 'K.-o.' },
]

export type StageStatus = 'pending' | 'running' | 'finished'

export interface Stage {
  id: number
  competitionId: number
  position: number
  name: string
  format: StageFormat
  raceTo: number
  /** How many players move on to the next stage. */
  advanceCount: number
  status: StageStatus
  /** Player ids in seed order (best seed first). */
  players: number[]
}

export type CompetitionStatus = 'running' | 'finished'

export interface Competition {
  id: number
  name: string
  discipline: Discipline
  status: CompetitionStatus
  createdAt: string
  stages: Stage[]
}

export interface RatingChange {
  matchId: number
  playerId: number
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
  /** Elo change from the most recent rated match */
  lastDelta: number
  streak: number
  bestStreak: number
}

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'played'

export interface Challenge {
  id: number
  challenger: number
  opponent: number
  discipline: Discipline
  raceTo: number
  rated: boolean
  message: string | null
  status: ChallengeStatus
  createdAt: string
}

export interface AppState {
  appName: string
  me: Player
  players: Player[]
  matches: Match[]
  competitions: Competition[]
  /** Open challenges (pending or accepted) that involve the current player. */
  challenges: Challenge[]
}
