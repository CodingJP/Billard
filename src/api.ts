import type { AppState, Discipline, StageFormat } from './lib/types.ts'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Etwas ist schiefgelaufen.')
  return data as T
}

export interface NewMatchInput {
  opponentId: number
  ownScore: number
  opponentScore: number
  discipline?: Discipline
  raceTo?: number
  rated?: boolean
  stageId?: number
  challengeId?: number
}

export interface NewChallengeInput {
  opponentId: number
  discipline: Discipline
  raceTo: number
  rated: boolean
  message?: string
}

export interface NewCompetitionInput {
  name: string
  discipline: Discipline
  playerIds: number[]
  stages: { name: string; format: StageFormat; raceTo: number; advanceCount?: number }[]
}

export const api = {
  info: () => request<{ appName: string }>('GET', '/api/info'),
  state: () => request<AppState>('GET', '/api/state'),
  checkInvite: (key: string) => request<{ valid: boolean }>('POST', '/api/invite/check', { key }),
  register: (inviteKey: string, username: string, password: string) =>
    request<AppState>('POST', '/api/register', { inviteKey, username, password }),
  login: (username: string, password: string) => request<AppState>('POST', '/api/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),
  changePassword: (current: string, next: string) => request<{ ok: true }>('POST', '/api/password', { current, next }),
  addMatch: (input: NewMatchInput) => request<{ state: AppState }>('POST', '/api/matches', input),
  confirm: (id: number) => request<AppState>('POST', `/api/matches/${id}/confirm`),
  reject: (id: number) => request<AppState>('POST', `/api/matches/${id}/reject`),
  deleteMatch: (id: number) => request<AppState>('DELETE', `/api/matches/${id}`),
  pushKey: () => request<{ publicKey: string }>('GET', '/api/push/key'),
  pushSubscribe: (sub: PushSubscriptionJSON) => request<{ ok: true }>('POST', '/api/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => request<{ ok: true }>('POST', '/api/push/unsubscribe', { endpoint }),
  pushTest: () => request<{ ok: true }>('POST', '/api/push/test'),
  challenge: (input: NewChallengeInput) => request<AppState>('POST', '/api/challenges', input),
  acceptChallenge: (id: number) => request<AppState>('POST', `/api/challenges/${id}/accept`),
  declineChallenge: (id: number) => request<AppState>('POST', `/api/challenges/${id}/decline`),
  cancelChallenge: (id: number) => request<AppState>('DELETE', `/api/challenges/${id}`),
  invite: () => request<{ joinUrl: string }>('GET', '/api/admin/invite'),
  createCompetition: (input: NewCompetitionInput) => request<{ id: number; state: AppState }>('POST', '/api/competitions', input),
  advance: (id: number) => request<AppState>('POST', `/api/competitions/${id}/advance`),
  deleteCompetition: (id: number) => request<AppState>('DELETE', `/api/competitions/${id}`),
}
