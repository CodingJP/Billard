import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length)
  return timingSafeEqual(expected, actual)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Only a hash of the session token is stored, so a leaked database cannot be used to log in. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time comparison for the invite key. */
export function sameSecret(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest()
  const y = createHash('sha256').update(b).digest()
  return timingSafeEqual(x, y)
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,20}$/
export const MIN_PASSWORD_LENGTH = 8

/** Simple in-memory limiter against password guessing. */
export class AttemptLimiter {
  private attempts = new Map<string, { count: number; since: number }>()
  private readonly max: number
  private readonly windowMs: number

  constructor(max = 10, windowMs = 15 * 60 * 1000) {
    this.max = max
    this.windowMs = windowMs
  }

  isBlocked(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key)
    if (!entry) return false
    if (now - entry.since > this.windowMs) {
      this.attempts.delete(key)
      return false
    }
    return entry.count >= this.max
  }

  fail(key: string, now = Date.now()) {
    const entry = this.attempts.get(key)
    if (!entry || now - entry.since > this.windowMs) this.attempts.set(key, { count: 1, since: now })
    else entry.count += 1
  }

  reset(key: string) {
    this.attempts.delete(key)
  }
}
