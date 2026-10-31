import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { DatabaseSync } from 'node:sqlite'
import { advancingPlayers, canPlayInStage, isStageComplete } from '../src/lib/competition.ts'
import { computeRatings, ranking } from '../src/lib/ratings.ts'
import {
  DISCIPLINES,
  STAGE_FORMATS,
  type AppState,
  type Competition,
  type Discipline,
  type Match,
  type Player,
  type Stage,
  type StageFormat,
} from '../src/lib/types.ts'
import {
  AttemptLimiter,
  hashPassword,
  hashToken,
  MIN_PASSWORD_LENGTH,
  newSessionToken,
  sameSecret,
  USERNAME_PATTERN,
  verifyPassword,
} from './auth.ts'
import type { Config } from './config.ts'

const SESSION_COOKIE = 'billard_session'
const SESSION_DAYS = 60

type Row = Record<string, unknown>
type Env = { Variables: { user: Player } }

class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 429
  constructor(status: 400 | 401 | 403 | 404 | 409 | 429, message: string) {
    super(message)
    this.status = status
  }
}

const fail = (status: HttpError['status'], message: string): never => {
  throw new HttpError(status, message)
}

export function createApp(db: DatabaseSync, config: Config) {
  const app = new Hono<Env>()
  const limiter = new AttemptLimiter()
  const now = () => new Date().toISOString()

  // ---------- data access ----------

  const toPlayer = (r: Row): Player => ({
    id: Number(r.id),
    name: String(r.username),
    isAdmin: config.adminUserIds.includes(Number(r.id)),
    createdAt: String(r.created_at),
  })

  const toMatch = (r: Row): Match => ({
    id: Number(r.id),
    discipline: r.discipline as Discipline,
    raceTo: Number(r.race_to),
    playerA: Number(r.player_a),
    playerB: Number(r.player_b),
    scoreA: Number(r.score_a),
    scoreB: Number(r.score_b),
    rated: Number(r.rated) === 1,
    status: r.status as Match['status'],
    createdBy: Number(r.created_by),
    playedAt: String(r.played_at),
    stageId: r.stage_id === null ? null : Number(r.stage_id),
  })

  const players = (): Player[] =>
    (db.prepare('SELECT id, username, created_at FROM users ORDER BY id').all() as Row[]).map(toPlayer)

  const matches = (): Match[] =>
    (db.prepare("SELECT * FROM matches WHERE status != 'rejected' ORDER BY played_at, id").all() as Row[]).map(toMatch)

  const matchById = (id: number): Match | null => {
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as Row | undefined
    return row ? toMatch(row) : null
  }

  const competitions = (): Competition[] => {
    const comps = db.prepare('SELECT * FROM competitions ORDER BY id DESC').all() as Row[]
    const stages = db.prepare('SELECT * FROM stages ORDER BY competition_id, position').all() as Row[]
    const seeds = db.prepare('SELECT * FROM stage_players ORDER BY stage_id, seed').all() as Row[]
    return comps.map((c) => ({
      id: Number(c.id),
      name: String(c.name),
      discipline: c.discipline as Discipline,
      status: c.status as Competition['status'],
      createdAt: String(c.created_at),
      stages: stages
        .filter((s) => Number(s.competition_id) === Number(c.id))
        .map(
          (s): Stage => ({
            id: Number(s.id),
            competitionId: Number(s.competition_id),
            position: Number(s.position),
            name: String(s.name),
            format: s.format as StageFormat,
            raceTo: Number(s.race_to),
            advanceCount: Number(s.advance_count),
            status: s.status as Stage['status'],
            players: seeds.filter((p) => Number(p.stage_id) === Number(s.id)).map((p) => Number(p.user_id)),
          }),
        ),
    }))
  }

  const findStage = (stageId: number) => {
    for (const c of competitions()) {
      const stage = c.stages.find((s) => s.id === stageId)
      if (stage) return { competition: c, stage }
    }
    return null
  }

  const setStagePlayers = (stageId: number, ids: number[]) => {
    const insert = db.prepare('INSERT INTO stage_players (stage_id, user_id, seed) VALUES (?, ?, ?)')
    ids.forEach((userId, i) => insert.run(stageId, userId, i + 1))
  }

  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  // ---------- sessions ----------

  const startSession = (c: Context, userId: number) => {
    const token = newSessionToken()
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5)
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      hashToken(token),
      userId,
      expires.toISOString(),
    )
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.secureCookies,
      path: '/',
      expires,
    })
  }

  const currentUser = (c: Context): Player | null => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return null
    const row = db
      .prepare(
        `SELECT u.id, u.username, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(hashToken(token), now()) as Row | undefined
    return row ? toPlayer(row) : null
  }

  // ---------- helpers ----------

  const body = async (c: Context): Promise<Row> => {
    try {
      const data = await c.req.json()
      return data && typeof data === 'object' ? (data as Row) : {}
    } catch {
      return {}
    }
  }

  const int = (value: unknown, name: string, min: number, max: number): number => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < min || n > max) fail(400, `${name} muss eine ganze Zahl zwischen ${min} und ${max} sein.`)
    return n
  }

  const text = (value: unknown, name: string, max = 60): string => {
    const s = typeof value === 'string' ? value.trim() : ''
    if (!s) fail(400, `${name} fehlt.`)
    if (s.length > max) fail(400, `${name} darf höchstens ${max} Zeichen haben.`)
    return s
  }

  const discipline = (value: unknown): Discipline => {
    if (!DISCIPLINES.includes(value as Discipline)) fail(400, 'Unbekannte Disziplin.')
    return value as Discipline
  }

  const userExists = (id: number) => !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)

  const state = (me: Player): AppState => ({
    appName: config.appName,
    me,
    players: players(),
    matches: matches(),
    competitions: competitions(),
  })

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Interner Fehler' }, 500)
  })

  // ---------- public routes ----------

  app.get('/api/info', (c) => c.json({ appName: config.appName }))

  app.post('/api/invite/check', async (c) => {
    const { key } = await body(c)
    return c.json({ valid: typeof key === 'string' && sameSecret(key, config.inviteKey) })
  })

  app.post('/api/register', async (c) => {
    const data = await body(c)
    const ip = c.req.header('x-forwarded-for') ?? 'local'
    if (limiter.isBlocked(`invite:${ip}`)) fail(429, 'Zu viele Versuche. Bitte später erneut probieren.')
    if (typeof data.inviteKey !== 'string' || !sameSecret(data.inviteKey, config.inviteKey)) {
      limiter.fail(`invite:${ip}`)
      fail(403, 'Der Einladungs-Code ist ungültig. Scanne den QR-Code erneut.')
    }
    const username = typeof data.username === 'string' ? data.username.trim() : ''
    const password = typeof data.password === 'string' ? data.password : ''
    if (!USERNAME_PATTERN.test(username)) {
      fail(400, 'Der Username braucht 3 bis 20 Zeichen: Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.')
    }
    if (password.length < MIN_PASSWORD_LENGTH) fail(400, `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`)
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) fail(409, 'Diesen Username gibt es schon.')

    const result = db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, hashPassword(password), now())
    const id = Number(result.lastInsertRowid)
    startSession(c, id)
    const me = players().find((p) => p.id === id)!
    return c.json(state(me), 201)
  })

  app.post('/api/login', async (c) => {
    const data = await body(c)
    const username = typeof data.username === 'string' ? data.username.trim() : ''
    const password = typeof data.password === 'string' ? data.password : ''
    const key = `login:${username.toLowerCase()}`
    if (limiter.isBlocked(key)) fail(429, 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut probieren.')
    const row = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as Row | undefined
    if (!row || !verifyPassword(password, String(row.password_hash))) {
      limiter.fail(key)
      fail(401, 'Username oder Passwort stimmt nicht.')
    }
    limiter.reset(key)
    startSession(c, Number(row!.id))
    const me = players().find((p) => p.id === Number(row!.id))!
    return c.json(state(me))
  })

  app.post('/api/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // ---------- authenticated routes ----------

  app.use('/api/*', async (c, next) => {
    const user = currentUser(c)
    if (!user) return c.json({ error: 'Bitte einloggen.' }, 401)
    c.set('user', user)
    await next()
  })

  const requireAdmin = (c: Context<Env>) => {
    if (!c.get('user').isAdmin) fail(403, 'Nur für Admins.')
  }

  app.get('/api/state', (c) => c.json(state(c.get('user'))))

  app.post('/api/password', async (c) => {
    const me = c.get('user')
    const data = await body(c)
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(me.id) as Row
    if (typeof data.current !== 'string' || !verifyPassword(data.current, String(row.password_hash))) {
      fail(403, 'Das aktuelle Passwort stimmt nicht.')
    }
    if (typeof data.next !== 'string' || data.next.length < MIN_PASSWORD_LENGTH) {
      fail(400, `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`)
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(data.next)), me.id)
    return c.json({ ok: true })
  })

  app.post('/api/matches', async (c) => {
    const me = c.get('user')
    const data = await body(c)
    const opponent = int(data.opponentId, 'Gegner', 1, Number.MAX_SAFE_INTEGER)
    if (opponent === me.id) fail(400, 'Du kannst nicht gegen dich selbst spielen.')
    if (!userExists(opponent)) fail(404, 'Diesen Gegner gibt es nicht.')

    let stageId: number | null = null
    let disc: Discipline
    let raceTo: number
    let rated = data.rated !== false

    if (data.stageId !== undefined && data.stageId !== null) {
      stageId = int(data.stageId, 'Etappe', 1, Number.MAX_SAFE_INTEGER)
      const found = findStage(stageId) ?? fail(404, 'Diese Etappe gibt es nicht.')
      if (!canPlayInStage(found.stage, matches(), me.id, opponent)) {
        fail(409, 'Diese Partie steht in der Etappe gerade nicht an oder wurde schon eingetragen.')
      }
      disc = found.competition.discipline
      raceTo = found.stage.raceTo
      rated = true
    } else {
      disc = discipline(data.discipline)
      raceTo = int(data.raceTo, 'Race-to', 1, 25)
    }

    const own = int(data.ownScore, 'Eigene Frames', 0, raceTo)
    const other = int(data.opponentScore, 'Frames des Gegners', 0, raceTo)
    if ((own === raceTo) === (other === raceTo)) fail(400, `Genau ein Spieler muss ${raceTo} Frames erreichen.`)

    const result = db
      .prepare(
        `INSERT INTO matches (discipline, race_to, player_a, player_b, score_a, score_b, rated, status, created_by, played_at, stage_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(disc, raceTo, me.id, opponent, own, other, rated ? 1 : 0, me.id, now(), stageId)
    return c.json({ match: matchById(Number(result.lastInsertRowid)), state: state(me) }, 201)
  })

  const decide = (status: 'confirmed' | 'rejected') => async (c: Context<Env>) => {
    const me = c.get('user')
    const match = matchById(Number(c.req.param('id'))) ?? fail(404, 'Dieses Spiel gibt es nicht.')
    if (match.status !== 'pending') fail(409, 'Dieses Ergebnis wurde schon entschieden.')
    const opponent = match.createdBy === match.playerA ? match.playerB : match.playerA
    if (opponent !== me.id) fail(403, 'Nur der Gegner kann dieses Ergebnis bestätigen oder ablehnen.')
    db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, match.id)
    return c.json(state(me))
  }

  app.post('/api/matches/:id/confirm', decide('confirmed'))
  app.post('/api/matches/:id/reject', decide('rejected'))

  app.delete('/api/matches/:id', (c) => {
    const me = c.get('user')
    const match = matchById(Number(c.req.param('id'))) ?? fail(404, 'Dieses Spiel gibt es nicht.')
    const ownPending = match.createdBy === me.id && match.status === 'pending'
    if (!ownPending && !me.isAdmin) fail(403, 'Nur Admins können bestätigte Spiele löschen.')
    db.prepare('DELETE FROM matches WHERE id = ?').run(match.id)
    return c.json(state(me))
  })

  // ---------- admin ----------

  app.get('/api/admin/invite', (c) => {
    requireAdmin(c)
    const origin = config.publicUrl ?? new URL(c.req.url).origin
    return c.json({ joinUrl: `${origin}/join?key=${encodeURIComponent(config.inviteKey)}` })
  })

  app.post('/api/competitions', async (c) => {
    requireAdmin(c)
    const data = await body(c)
    const name = text(data.name, 'Name')
    const disc = discipline(data.discipline)
    const rawStages = Array.isArray(data.stages) ? (data.stages as Row[]) : []
    if (rawStages.length < 1 || rawStages.length > 8) fail(400, 'Ein Wettkampf braucht 1 bis 8 Etappen.')
    const ids = Array.isArray(data.playerIds) ? [...new Set((data.playerIds as unknown[]).map(Number))] : []
    if (ids.length < 2) fail(400, 'Ein Wettkampf braucht mindestens 2 Teilnehmer.')
    if (!ids.every(userExists)) fail(400, 'Unbekannter Teilnehmer.')

    let field = ids.length
    const stages = rawStages.map((s, i) => {
      const format = s.format as StageFormat
      if (!STAGE_FORMATS.some((f) => f.id === format)) fail(400, `Etappe ${i + 1}: unbekanntes Format.`)
      const last = i === rawStages.length - 1
      const advance = last ? 1 : int(s.advanceCount, `Etappe ${i + 1}: Weiterkommende`, 2, field - 1)
      const stage = {
        name: text(s.name ?? `Etappe ${i + 1}`, `Etappe ${i + 1}: Name`),
        format,
        raceTo: int(s.raceTo, `Etappe ${i + 1}: Race-to`, 1, 25),
        advanceCount: advance,
      }
      field = advance
      return stage
    })

    // Seed the first stage by current Elo.
    const elo = computeRatings(players(), matches())
    const seeded = ranking(elo)
      .map((s) => s.player.id)
      .filter((id) => ids.includes(id))

    const id = transaction(() => {
      const comp = db
        .prepare("INSERT INTO competitions (name, discipline, status, created_at) VALUES (?, ?, 'running', ?)")
        .run(name, disc, now())
      const compId = Number(comp.lastInsertRowid)
      stages.forEach((s, i) => {
        const res = db
          .prepare(
            'INSERT INTO stages (competition_id, position, name, format, race_to, advance_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(compId, i + 1, s.name, s.format, s.raceTo, s.advanceCount, i === 0 ? 'running' : 'pending')
        if (i === 0) setStagePlayers(Number(res.lastInsertRowid), seeded)
      })
      return compId
    })
    return c.json({ id, state: state(c.get('user')) }, 201)
  })

  app.post('/api/competitions/:id/advance', (c) => {
    requireAdmin(c)
    const comp = competitions().find((x) => x.id === Number(c.req.param('id'))) ?? fail(404, 'Wettkampf nicht gefunden.')
    const current = comp.stages.find((s) => s.status === 'running') ?? fail(409, 'Keine laufende Etappe.')
    const all = matches()
    if (!isStageComplete(current, all)) fail(409, 'Die Etappe ist noch nicht fertig gespielt.')
    const next = comp.stages.find((s) => s.position === current.position + 1)
    transaction(() => {
      db.prepare("UPDATE stages SET status = 'finished' WHERE id = ?").run(current.id)
      // Withdraw results that were never confirmed, so they cannot change a closed stage.
      db.prepare("UPDATE matches SET status = 'rejected' WHERE stage_id = ? AND status = 'pending'").run(current.id)
      if (next) {
        setStagePlayers(next.id, advancingPlayers(current, all))
        db.prepare("UPDATE stages SET status = 'running' WHERE id = ?").run(next.id)
      } else {
        db.prepare("UPDATE competitions SET status = 'finished' WHERE id = ?").run(comp.id)
      }
    })
    return c.json(state(c.get('user')))
  })

  app.delete('/api/competitions/:id', (c) => {
    requireAdmin(c)
    db.prepare('DELETE FROM competitions WHERE id = ?').run(Number(c.req.param('id')))
    return c.json(state(c.get('user')))
  })

  return app
}
