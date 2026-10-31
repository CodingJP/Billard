import { describe, expect, it } from 'vitest'
import type { AppState } from '../src/lib/types.ts'
import { createApp } from './app.ts'
import type { Config } from './config.ts'
import { openDatabase } from './db.ts'
import { PushService, type PushPayload } from './push.ts'

const config: Config = {
  port: 0,
  databasePath: ':memory:',
  appName: 'Testliga',
  inviteKey: 'secret-key',
  adminUserIds: [1],
  publicUrl: 'https://billard.example.com',
  secureCookies: false,
}

function setup() {
  const db = openDatabase(':memory:')
  const sent: { endpoint: string; payload: PushPayload }[] = []
  const gone = new Set<string>()
  const push = new PushService(
    db,
    async (sub, payload) => {
      sent.push({ endpoint: sub.endpoint, payload })
      return !gone.has(sub.endpoint)
    },
    'test-public-key',
  )
  const app = createApp(db, config, push)
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  const call = async (method: string, path: string, cookie?: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json()
    return { status: res.status, json, cookie: res.headers.get('set-cookie')?.split(';')[0] }
  }

  const register = async (username: string) => {
    const res = await call('POST', '/api/register', undefined, { inviteKey: 'secret-key', username, password: 'passwort123' })
    expect(res.status).toBe(201)
    return { cookie: res.cookie!, id: (res.json as AppState).me.id }
  }

  const subscribe = (cookie: string, endpoint: string) =>
    call('POST', '/api/push/subscribe', cookie, { endpoint, keys: { p256dh: 'p', auth: 'a' } })

  return { call, register, subscribe, sent, gone, flush }
}

describe('accounts', () => {
  it('needs the invite key to register', async () => {
    const { call } = setup()
    const res = await call('POST', '/api/register', undefined, { inviteKey: 'wrong', username: 'anna', password: 'passwort123' })
    expect(res.status).toBe(403)
  })

  it('registers, logs in and marks configured admins', async () => {
    const { call, register } = setup()
    const anna = await register('anna')
    const ben = await register('ben')
    const state = (await call('GET', '/api/state', anna.cookie)).json as AppState
    expect(state.me).toMatchObject({ id: 1, name: 'anna', isAdmin: true })
    expect(state.players.find((p) => p.id === ben.id)?.isAdmin).toBe(false)

    expect((await call('POST', '/api/login', undefined, { username: 'BEN', password: 'falsch!!' })).status).toBe(401)
    const login = await call('POST', '/api/login', undefined, { username: 'BEN', password: 'passwort123' })
    expect(login.status).toBe(200)
    expect((login.json as AppState).me.name).toBe('ben')
  })

  it('rejects duplicate usernames regardless of case', async () => {
    const { call, register } = setup()
    await register('anna')
    const res = await call('POST', '/api/register', undefined, { inviteKey: 'secret-key', username: 'Anna', password: 'passwort123' })
    expect(res.status).toBe(409)
  })

  it('blocks the API without a session', async () => {
    const { call } = setup()
    expect((await call('GET', '/api/state')).status).toBe(401)
  })

  it('shows the invite link only to admins', async () => {
    const { call, register } = setup()
    const anna = await register('anna')
    const ben = await register('ben')
    expect((await call('GET', '/api/admin/invite', ben.cookie)).status).toBe(403)
    const res = await call('GET', '/api/admin/invite', anna.cookie)
    expect(res.json).toEqual({ joinUrl: 'https://billard.example.com/join?key=secret-key' })
  })
})

describe('duels', () => {
  it('only counts after the opponent confirms', async () => {
    const { call, register } = setup()
    const anna = await register('anna')
    const ben = await register('ben')

    const created = await call('POST', '/api/matches', anna.cookie, {
      opponentId: ben.id,
      discipline: '8-Ball',
      raceTo: 5,
      ownScore: 5,
      opponentScore: 2,
      rated: true,
    })
    expect(created.status).toBe(201)
    const matchId = created.json.match.id
    expect(created.json.match.status).toBe('pending')

    // The creator cannot confirm their own result.
    expect((await call('POST', `/api/matches/${matchId}/confirm`, anna.cookie)).status).toBe(403)
    const confirmed = await call('POST', `/api/matches/${matchId}/confirm`, ben.cookie)
    expect(confirmed.status).toBe(200)
    expect((confirmed.json as AppState).matches[0].status).toBe('confirmed')
    expect((await call('POST', `/api/matches/${matchId}/reject`, ben.cookie)).status).toBe(409)
  })

  it('hides rejected results and stores unrated games', async () => {
    const { call, register } = setup()
    const anna = await register('anna')
    const ben = await register('ben')
    const m = await call('POST', '/api/matches', ben.cookie, {
      opponentId: anna.id,
      discipline: '9-Ball',
      raceTo: 3,
      ownScore: 3,
      opponentScore: 0,
      rated: false,
    })
    expect(m.json.match.rated).toBe(false)
    const after = (await call('POST', `/api/matches/${m.json.match.id}/reject`, anna.cookie)).json as AppState
    expect(after.matches).toEqual([])
  })

  it('validates the score', async () => {
    const { call, register } = setup()
    const anna = await register('anna')
    const ben = await register('ben')
    const res = await call('POST', '/api/matches', anna.cookie, {
      opponentId: ben.id,
      discipline: '8-Ball',
      raceTo: 5,
      ownScore: 4,
      opponentScore: 3,
    })
    expect(res.status).toBe(400)
  })
})

describe('competitions', () => {
  it('runs a round robin and moves the best players into a knockout stage', async () => {
    const { call, register } = setup()
    const users = [await register('anna'), await register('ben'), await register('cem')]
    const [anna, ben, cem] = users

    expect((await call('POST', '/api/competitions', ben.cookie, {})).status).toBe(403)

    const created = await call('POST', '/api/competitions', anna.cookie, {
      name: 'Büro-Cup',
      discipline: '8-Ball',
      playerIds: users.map((u) => u.id),
      stages: [
        { name: 'Gruppenphase', format: 'round_robin', raceTo: 3, advanceCount: 2 },
        { name: 'Finale', format: 'knockout', raceTo: 5 },
      ],
    })
    expect(created.status).toBe(201)
    const comp = (created.json.state as AppState).competitions[0]
    const [groupStage, finalStage] = comp.stages
    expect(groupStage.status).toBe('running')
    expect(groupStage.players).toHaveLength(3)

    const play = async (a: typeof anna, b: typeof anna, own: number, other: number, stageId: number) => {
      const res = await call('POST', '/api/matches', a.cookie, { opponentId: b.id, ownScore: own, opponentScore: other, stageId })
      expect(res.status).toBe(201)
      await call('POST', `/api/matches/${res.json.match.id}/confirm`, b.cookie)
    }

    // Too early to advance.
    expect((await call('POST', `/api/competitions/${comp.id}/advance`, anna.cookie)).status).toBe(409)

    await play(anna, ben, 3, 1, groupStage.id)
    await play(anna, cem, 3, 0, groupStage.id)
    await play(ben, cem, 3, 2, groupStage.id)

    // The same pair cannot play twice in a round robin.
    const again = await call('POST', '/api/matches', anna.cookie, { opponentId: ben.id, ownScore: 3, opponentScore: 0, stageId: groupStage.id })
    expect(again.status).toBe(409)

    const advanced = (await call('POST', `/api/competitions/${comp.id}/advance`, anna.cookie)).json as AppState
    const final = advanced.competitions[0].stages.find((s) => s.id === finalStage.id)!
    expect(final.status).toBe('running')
    expect(final.players).toEqual([anna.id, ben.id])

    await play(ben, anna, 5, 4, final.id)
    const done = (await call('POST', `/api/competitions/${comp.id}/advance`, anna.cookie)).json as AppState
    expect(done.competitions[0].status).toBe('finished')
  })
})

describe('challenges and push', () => {
  it('notifies the challenged player and lets the result count for the challenge', async () => {
    const { call, register, subscribe, sent, flush } = setup()
    const anna = await register('anna')
    const ben = await register('ben')
    await subscribe(ben.cookie, 'https://push.example/ben')
    await subscribe(anna.cookie, 'https://push.example/anna')

    const res = await call('POST', '/api/challenges', anna.cookie, {
      opponentId: ben.id,
      discipline: '9-Ball',
      raceTo: 4,
      rated: false,
      message: 'Heute 17 Uhr?',
    })
    expect(res.status).toBe(201)
    await flush()
    expect(sent.at(-1)).toMatchObject({ endpoint: 'https://push.example/ben', payload: { title: 'anna fordert dich heraus' } })

    // Only one open challenge per pair.
    expect((await call('POST', '/api/challenges', ben.cookie, { opponentId: anna.id, discipline: '8-Ball', raceTo: 3 })).status).toBe(409)

    const challenge = (res.json as AppState).challenges[0]
    expect((await call('POST', `/api/challenges/${challenge.id}/accept`, anna.cookie)).status).toBe(403)
    const accepted = (await call('POST', `/api/challenges/${challenge.id}/accept`, ben.cookie)).json as AppState
    expect(accepted.challenges[0].status).toBe('accepted')
    await flush()
    expect(sent.at(-1)).toMatchObject({ endpoint: 'https://push.example/anna', payload: { title: 'Herausforderung angenommen' } })

    // The result takes discipline, race and rating from the challenge.
    const match = await call('POST', '/api/matches', ben.cookie, { opponentId: anna.id, ownScore: 4, opponentScore: 1, challengeId: challenge.id })
    expect(match.status).toBe(201)
    expect(match.json.match).toMatchObject({ discipline: '9-Ball', raceTo: 4, rated: false })
    expect((match.json.state as AppState).challenges).toEqual([])
    await flush()
    expect(sent.at(-1)).toMatchObject({ endpoint: 'https://push.example/anna', payload: { title: 'Ergebnis bestätigen' } })
  })

  it('removes subscriptions the push service reports as gone', async () => {
    const { call, register, subscribe, sent, gone, flush } = setup()
    const anna = await register('anna')
    await subscribe(anna.cookie, 'https://push.example/old')
    gone.add('https://push.example/old')
    await call('POST', '/api/push/test', anna.cookie)
    await call('POST', '/api/push/test', anna.cookie)
    await flush()
    expect(sent.filter((s) => s.endpoint === 'https://push.example/old')).toHaveLength(1)
  })

  it('serves the public key without login', async () => {
    const { call } = setup()
    expect((await call('GET', '/api/push/key')).json).toEqual({ publicKey: 'test-public-key' })
  })
})
