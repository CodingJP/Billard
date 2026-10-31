/**
 * Fills a database with demo players, duels and a competition.
 * Usage: DATABASE_PATH=./data/demo.sqlite INVITE_KEY=demo npm run seed
 * All demo accounts use the password "billard123".
 */
import { createApp } from '../server/app.ts'
import { loadConfig } from '../server/config.ts'
import { openDatabase } from '../server/db.ts'
import { PushService } from '../server/push.ts'

const PASSWORD = 'billard123'
const NAMES = ['janik', 'anna', 'ben', 'cem', 'dana', 'elif', 'finn', 'greta']

const config = loadConfig()
const db = openDatabase(config.databasePath)
// The demo never sends real push messages.
const app = createApp(db, config, new PushService(db, async () => true, ''))

async function call(method: string, path: string, cookie: string | undefined, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`)
  return { json, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}

const users: { id: number; cookie: string }[] = []
for (const username of NAMES) {
  const r = await call('POST', '/api/register', undefined, { inviteKey: config.inviteKey, username, password: PASSWORD })
  users.push({ id: r.json.me.id, cookie: r.cookie! })
}

async function duel(a: number, b: number, own: number, other: number, extra: Record<string, unknown> = {}, confirm = true) {
  const r = await call('POST', '/api/matches', users[a].cookie, {
    opponentId: users[b].id,
    ownScore: own,
    opponentScore: other,
    discipline: '8-Ball',
    raceTo: 5,
    rated: true,
    ...extra,
  })
  if (confirm) await call('POST', `/api/matches/${r.json.match.id}/confirm`, users[b].cookie)
}

// Fixed results so the demo looks the same every time.
const results: [number, number, number, number][] = [
  [0, 1, 5, 3], [2, 3, 5, 4], [4, 5, 2, 5], [0, 2, 5, 1], [1, 3, 5, 2], [6, 7, 5, 3],
  [5, 0, 5, 4], [3, 4, 1, 5], [2, 1, 5, 3], [0, 4, 5, 2], [5, 3, 5, 0], [7, 2, 5, 4],
  [1, 4, 4, 5], [2, 5, 5, 4], [0, 3, 5, 3], [4, 2, 5, 2], [1, 5, 3, 5], [6, 0, 2, 5],
  [0, 1, 5, 4], [3, 2, 5, 3], [4, 0, 3, 5], [7, 6, 5, 1],
]
for (const [a, b, sa, sb] of results) await duel(a, b, sa, sb)
await duel(3, 1, 3, 2, { discipline: '9-Ball', raceTo: 3, rated: false })

// Results waiting for confirmation.
await duel(1, 0, 5, 2, {}, false)
await duel(0, 5, 5, 1, {}, false)

// An open challenge for the admin.
await call('POST', '/api/challenges', users[2].cookie, { opponentId: users[0].id, discipline: '9-Ball', raceTo: 4, rated: true, message: 'Revanche für letzte Woche!' })

const admin = users[0]
const created = await call('POST', '/api/competitions', admin.cookie, {
  name: 'Herbst-Cup',
  discipline: '8-Ball',
  playerIds: users.slice(0, 6).map((u) => u.id),
  stages: [
    { name: 'Gruppenphase', format: 'round_robin', raceTo: 3, advanceCount: 4 },
    { name: 'Finalrunde', format: 'knockout', raceTo: 5 },
  ],
})
const comp = created.json.state.competitions.find((c: { id: number }) => c.id === created.json.id)
const stage = comp.stages[0]
const index = (id: number) => users.findIndex((u) => u.id === id)
const groupResults: [number, number, number, number][] = [
  [0, 1, 3, 1], [2, 3, 3, 2], [4, 5, 1, 3], [0, 2, 3, 2], [1, 4, 3, 0], [3, 5, 2, 3], [0, 3, 3, 0], [1, 2, 2, 3],
]
for (const [a, b, sa, sb] of groupResults) {
  const pa: number = stage.players.at(a)
  const pb: number = stage.players.at(b)
  await duel(index(pa), index(pb), sa, sb, { stageId: stage.id })
}

console.log(`Demo data ready: ${NAMES.length} players (password "${PASSWORD}"), admin = user 1 if ADMIN_USER_IDS=1.`)
