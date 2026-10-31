import { describe, expect, it } from 'vitest'
import { calculateElo, expectedScore, kFactor, marginFactor } from './elo'

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5)
  })

  it('favours the higher rated player', () => {
    expect(expectedScore(1300, 1200)).toBeCloseTo(0.64, 2)
    expect(expectedScore(1200, 1300)).toBeCloseTo(0.36, 2)
  })
})

describe('kFactor', () => {
  it('is higher for provisional players', () => {
    expect(kFactor(0)).toBe(40)
    expect(kFactor(9)).toBe(40)
    expect(kFactor(10)).toBe(24)
  })
})

describe('marginFactor', () => {
  it('scales with the frame difference', () => {
    expect(marginFactor(5, 0, 5)).toBe(1.5)
    expect(marginFactor(5, 4, 5)).toBeCloseTo(1.1)
    expect(marginFactor(2, 5, 5)).toBeCloseTo(1.3)
  })
})

describe('calculateElo', () => {
  it('matches the concept example: 1200 beats 1300 5:2 in race-to-5', () => {
    const r = calculateElo({
      ratingA: 1200,
      ratingB: 1300,
      matchesA: 20,
      matchesB: 20,
      scoreA: 5,
      scoreB: 2,
      raceTo: 5,
    })
    expect(r.deltaA).toBe(20)
    expect(r.deltaB).toBe(-20)
  })

  it('is zero-sum when both players have the same K', () => {
    const r = calculateElo({
      ratingA: 1410,
      ratingB: 1180,
      matchesA: 3,
      matchesB: 5,
      scoreA: 3,
      scoreB: 4,
      raceTo: 4,
    })
    expect(r.deltaA + r.deltaB).toBe(0)
    expect(r.deltaB).toBeGreaterThan(0)
  })

  it('rejects draws', () => {
    expect(() =>
      calculateElo({ ratingA: 1200, ratingB: 1200, matchesA: 0, matchesB: 0, scoreA: 2, scoreB: 2, raceTo: 3 }),
    ).toThrow()
  })
})
