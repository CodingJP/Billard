import { calculateElo, START_ELO } from './elo'
import type { Match, Player, PlayerStats, RatingChange } from './types'

export interface RatingState {
  stats: Map<string, PlayerStats>
  changes: RatingChange[]
}

export function sortByPlayedAt(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id))
}

/**
 * Replays every match in chronological order. Ratings are always derived from
 * the match list, so editing or deleting a match keeps everything consistent.
 */
export function computeRatings(players: Player[], matches: Match[]): RatingState {
  const stats = new Map<string, PlayerStats>()
  for (const player of players) {
    stats.set(player.id, {
      player,
      elo: START_ELO,
      matches: 0,
      wins: 0,
      losses: 0,
      framesWon: 0,
      framesLost: 0,
      form: [],
      lastDelta: 0,
      streak: 0,
      bestStreak: 0,
    })
  }

  const changes: RatingChange[] = []
  for (const match of sortByPlayedAt(matches)) {
    const a = stats.get(match.playerA)
    const b = stats.get(match.playerB)
    if (!a || !b) continue

    const { deltaA, deltaB } = calculateElo({
      ratingA: a.elo,
      ratingB: b.elo,
      matchesA: a.matches,
      matchesB: b.matches,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      raceTo: match.raceTo,
    })

    changes.push({ matchId: match.id, playerId: a.player.id, before: a.elo, after: a.elo + deltaA })
    changes.push({ matchId: match.id, playerId: b.player.id, before: b.elo, after: b.elo + deltaB })

    apply(a, deltaA, match.scoreA, match.scoreB)
    apply(b, deltaB, match.scoreB, match.scoreA)
  }

  return { stats, changes }
}

function apply(s: PlayerStats, delta: number, own: number, other: number) {
  const won = own > other
  s.elo += delta
  s.lastDelta = delta
  s.matches += 1
  s.framesWon += own
  s.framesLost += other
  s.form = [won, ...s.form].slice(0, 5)
  if (won) {
    s.wins += 1
    s.streak = s.streak > 0 ? s.streak + 1 : 1
    s.bestStreak = Math.max(s.bestStreak, s.streak)
  } else {
    s.losses += 1
    s.streak = s.streak < 0 ? s.streak - 1 : -1
  }
}

export function ranking(state: RatingState): PlayerStats[] {
  return [...state.stats.values()].sort(
    (x, y) => y.elo - x.elo || y.wins - x.wins || x.player.name.localeCompare(y.player.name),
  )
}

export interface HeadToHead {
  opponent: Player
  wins: number
  losses: number
}

export function headToHead(playerId: string, players: Player[], matches: Match[]): HeadToHead[] {
  const byOpponent = new Map<string, HeadToHead>()
  for (const m of matches) {
    if (m.playerA !== playerId && m.playerB !== playerId) continue
    const isA = m.playerA === playerId
    const opponentId = isA ? m.playerB : m.playerA
    const opponent = players.find((p) => p.id === opponentId)
    if (!opponent) continue
    const entry = byOpponent.get(opponentId) ?? { opponent, wins: 0, losses: 0 }
    const won = isA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA
    if (won) entry.wins += 1
    else entry.losses += 1
    byOpponent.set(opponentId, entry)
  }
  return [...byOpponent.values()].sort((x, y) => y.wins + y.losses - (x.wins + x.losses))
}
