import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { DatabaseSync } from 'node:sqlite'
import { advancingPlayers, canPlayInStage, isStageComplete } from '../src/lib/competition.ts'
import { computeRatings, ranking } from '../src/lib/ratings.ts'
import {
  DISCIPLINES,
  STAGE_FORMATS,
  type AppState,
  type Challenge,
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
import type { PushPayload, PushService } from './push.ts'

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

export function createApp(db: DatabaseSync, config: Config, push: PushService) {
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

  const toChallenge = (r: Row): Challenge => ({
    id: Number(r.id),
    challenger: Number(r.challenger),
    opponent: Number(r.opponent),
    discipline: r.discipline as Discipline,
    raceTo: Number(r.race_to),
    rated: Number(r.rated) === 1,
    message: r.message === null ? null : String(r.message),
    status: r.status as Challenge['status'],
    createdAt: String(r.created_at),
  })

  const openChallenges = (userId: number): Challenge[] =>
    (
      db
        .prepare(
          `SELECT * FROM challenges WHERE status IN ('pending', 'accepted') AND (challenger = ? OR opponent = ?)
           ORDER BY created_at DESC`,
        )
        .all(userId, userId) as Row[]
    ).map(toChallenge)

  const challengeById = (id: number): Challenge | null => {
    const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id) as Row | undefined
    return row ? toChallenge(row) : null
  }

  const nameOf = (id: number) =>
    String((db.prepare('SELECT username FROM users WHERE id = ?').get(id) as Row | undefined)?.username ?? 'Jemand')

  /** Push messages never block or fail a request. */
  const notify = (userIds: number[], payload: PushPayload) => {
    void push.notify(userIds, payload)
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
    challenges: openChallenges(me.id),
  })

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Interner Fehler' }, 500)
  })

  // ---------- public routes ----------

  app.get('/api/info', (c) => c.json({ appName: config.appName }))

  // The manifest carries the instance name, so every installation shows its own app name.
  app.get('/manifest.webmanifest', (c) => {
    c.header('content-type', 'application/manifest+json')
    return c.body(
      JSON.stringify({
        name: config.appName,
        short_name: config.appName.slice(0, 12),
        description: 'Billard-Duelle, Elo-Rangliste und Wettkämpfe',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#04170e',
        theme_color: '#04170e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }),
    )
  })

  app.get('/api/push/key', (c) => c.json({ publicKey: push.publicKey }))

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
    let challengeId: number | null = null
    let disc: Discipline
    let raceTo: number
    let rated = data.rated !== false

    if (data.challengeId !== undefined && data.challengeId !== null) {
      challengeId = int(data.challengeId, 'Herausforderung', 1, Number.MAX_SAFE_INTEGER)
      const ch = challengeById(challengeId) ?? fail(404, 'Diese Herausforderung gibt es nicht.')
      const samePair = (ch.challenger === me.id && ch.opponent === opponent) || (ch.challenger === opponent && ch.opponent === me.id)
      if (!samePair || ch.status !== 'accepted') fail(409, 'Diese Herausforderung ist nicht angenommen.')
      disc = ch.discipline
      raceTo = ch.raceTo
      rated = ch.rated
    } else if (data.stageId !== undefined && data.stageId !== null) {
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
    if (challengeId !== null) db.prepare("UPDATE challenges SET status = 'played' WHERE id = ?").run(challengeId)
    notify([opponent], {
      title: 'Ergebnis bestätigen',
      body: `${me.name} hat ${own}:${other} gegen dich eingetragen. Stimmt das?`,
      url: '/?tab=games',
      tag: 'confirm',
    })
    return c.json({ match: matchById(Number(result.lastInsertRowid)), state: state(me) }, 201)
  })

  const decide = (status: 'confirmed' | 'rejected') => async (c: Context<Env>) => {
    const me = c.get('user')
    const match = matchById(Number(c.req.param('id'))) ?? fail(404, 'Dieses Spiel gibt es nicht.')
    if (match.status !== 'pending') fail(409, 'Dieses Ergebnis wurde schon entschieden.')
    const opponent = match.createdBy === match.playerA ? match.playerB : match.playerA
    if (opponent !== me.id) fail(403, 'Nur der Gegner kann dieses Ergebnis bestätigen oder ablehnen.')
    db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, match.id)
    const creatorScore = match.createdBy === match.playerA ? match.scoreA : match.scoreB
    const otherScore = match.createdBy === match.playerA ? match.scoreB : match.scoreA
    notify([match.createdBy], {
      title: status === 'confirmed' ? 'Ergebnis bestätigt' : 'Ergebnis abgelehnt',
      body:
        status === 'confirmed'
          ? `${me.name} hat dein ${creatorScore}:${otherScore} bestätigt.`
          : `${me.name} hat dein ${creatorScore}:${otherScore} abgelehnt. Tragt es neu ein.`,
      url: status === 'confirmed' ? '/?tab=ranking' : '/?tab=duel',
      tag: `match-${match.id}`,
    })
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

  // ---------- push ----------

  app.post('/api/push/subscribe', async (c) => {
    const data = await body(c)
    const keys = (data.keys ?? {}) as Row
    if (typeof data.endpoint !== 'string' || !data.endpoint.startsWith('https://')) fail(400, 'Ungültiges Abo.')
    if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') fail(400, 'Ungültiges Abo.')
    push.subscribe(c.get('user').id, {
      endpoint: String(data.endpoint),
      keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
    })
    return c.json({ ok: true })
  })

  app.post('/api/push/unsubscribe', async (c) => {
    const data = await body(c)
    if (typeof data.endpoint === 'string') {
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(data.endpoint, c.get('user').id)
    }
    return c.json({ ok: true })
  })

  app.post('/api/push/test', async (c) => {
    await push.notify([c.get('user').id], {
      title: config.appName,
      body: 'Push-Nachrichten funktionieren. Viel Erfolg am Tisch!',
      url: '/',
      tag: 'test',
    })
    return c.json({ ok: true })
  })

  // ---------- challenges ----------

  app.post('/api/challenges', async (c) => {
    const me = c.get('user')
    const data = await body(c)
    const opponent = int(data.opponentId, 'Gegner', 1, Number.MAX_SAFE_INTEGER)
    if (opponent === me.id) fail(400, 'Du kannst dich nicht selbst herausfordern.')
    if (!userExists(opponent)) fail(404, 'Diesen Gegner gibt es nicht.')
    const disc = discipline(data.discipline)
    const raceTo = int(data.raceTo, 'Race-to', 1, 25)
    const rated = data.rated !== false
    const message = typeof data.message === 'string' && data.message.trim() ? data.message.trim().slice(0, 140) : null
    const open = db
      .prepare(
        `SELECT 1 FROM challenges WHERE status IN ('pending', 'accepted')
         AND ((challenger = ? AND opponent = ?) OR (challenger = ? AND opponent = ?))`,
      )
      .get(me.id, opponent, opponent, me.id)
    if (open) fail(409, 'Zwischen euch läuft schon eine Herausforderung.')
    db.prepare(
      'INSERT INTO challenges (challenger, opponent, discipline, race_to, rated, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(me.id, opponent, disc, raceTo, rated ? 1 : 0, message, 'pending', now())
    notify([opponent], {
      title: `${me.name} fordert dich heraus`,
      body: `${disc}, Race to ${raceTo}${rated ? '' : ', ungewertet'}${message ? `: „${message}“` : ''}`,
      url: '/?tab=games',
      tag: `challenge-${me.id}`,
    })
    return c.json(state(me), 201)
  })

  const answerChallenge = (status: 'accepted' | 'declined') => (c: Context<Env>) => {
    const me = c.get('user')
    const ch = challengeById(Number(c.req.param('id'))) ?? fail(404, 'Diese Herausforderung gibt es nicht.')
    if (ch.opponent !== me.id) fail(403, 'Nur der Herausgeforderte kann antworten.')
    if (ch.status !== 'pending') fail(409, 'Diese Herausforderung ist schon beantwortet.')
    db.prepare('UPDATE challenges SET status = ? WHERE id = ?').run(status, ch.id)
    notify([ch.challenger], {
      title: status === 'accepted' ? 'Herausforderung angenommen' : 'Herausforderung abgelehnt',
      body: status === 'accepted' ? `${me.name} ist dabei. Ab an den Tisch!` : `${me.name} hat gerade keine Zeit.`,
      url: status === 'accepted' ? '/?tab=duel' : '/?tab=games',
      tag: `challenge-${ch.id}`,
    })
    return c.json(state(me))
  }

  app.post('/api/challenges/:id/accept', answerChallenge('accepted'))
  app.post('/api/challenges/:id/decline', answerChallenge('declined'))

  app.delete('/api/challenges/:id', (c) => {
    const me = c.get('user')
    const ch = challengeById(Number(c.req.param('id'))) ?? fail(404, 'Diese Herausforderung gibt es nicht.')
    if (ch.challenger !== me.id && ch.opponent !== me.id) fail(403, 'Das ist nicht deine Herausforderung.')
    if (ch.status !== 'pending' && ch.status !== 'accepted') fail(409, 'Diese Herausforderung ist schon beendet.')
    db.prepare("UPDATE challenges SET status = 'cancelled' WHERE id = ?").run(ch.id)
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
    notify(seeded, {
      title: `Neuer Wettkampf: ${name}`,
      body: `Du bist dabei. ${stages[0].name} hat begonnen.`,
      url: '/?tab=competitions',
      tag: `competition-${id}`,
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
    const advancing = advancingPlayers(current, all)
    transaction(() => {
      db.prepare("UPDATE stages SET status = 'finished' WHERE id = ?").run(current.id)
      // Withdraw results that were never confirmed, so they cannot change a closed stage.
      db.prepare("UPDATE matches SET status = 'rejected' WHERE stage_id = ? AND status = 'pending'").run(current.id)
      if (next) {
        setStagePlayers(next.id, advancing)
        db.prepare("UPDATE stages SET status = 'running' WHERE id = ?").run(next.id)
      } else {
        db.prepare("UPDATE competitions SET status = 'finished' WHERE id = ?").run(comp.id)
      }
    })
    if (next) {
      notify(advancing, {
        title: `${comp.name}: Du bist weiter!`,
        body: `${next.name} beginnt jetzt.`,
        url: '/?tab=competitions',
        tag: `competition-${comp.id}`,
      })
    } else {
      const everyone = comp.stages[0].players
      notify(everyone, {
        title: `${comp.name} ist entschieden`,
        body: `${nameOf(advancing[0])} gewinnt den Wettkampf.`,
        url: '/?tab=competitions',
        tag: `competition-${comp.id}`,
      })
    }
    return c.json(state(c.get('user')))
  })

  app.delete('/api/competitions/:id', (c) => {
    requireAdmin(c)
    db.prepare('DELETE FROM competitions WHERE id = ?').run(Number(c.req.param('id')))
    return c.json(state(c.get('user')))
  })

  return app
}
