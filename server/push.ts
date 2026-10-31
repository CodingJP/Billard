import type { DatabaseSync } from 'node:sqlite'
import webpush from 'web-push'

export interface PushPayload {
  title: string
  body: string
  /** Path inside the app that opens when the notification is tapped. */
  url: string
  /** Notifications with the same tag replace each other. */
  tag?: string
}

export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Sends one push message. Returns false when the subscription is gone and should be removed. */
export type PushSender = (subscription: PushSubscriptionData, payload: PushPayload) => Promise<boolean>

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

/** VAPID keys from the environment, otherwise generated once and stored in the database. */
export function loadVapidKeys(db: DatabaseSync, env: NodeJS.ProcessEnv = process.env): VapidKeys {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get() as { value: string } | undefined
  if (row) return JSON.parse(row.value) as VapidKeys
  const keys = webpush.generateVAPIDKeys()
  db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys))
  return keys
}

export function webPushSender(keys: VapidKeys, subject: string): PushSender {
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey)
  return async (subscription, payload) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 * 24 })
      return true
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) return false
      console.warn('Push failed:', status ?? err)
      return true
    }
  }
}

export class PushService {
  private readonly db: DatabaseSync
  private readonly send: PushSender
  readonly publicKey: string

  constructor(db: DatabaseSync, send: PushSender, publicKey: string) {
    this.db = db
    this.send = send
    this.publicKey = publicKey
  }

  subscribe(userId: number, sub: PushSubscriptionData) {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, new Date().toISOString())
  }

  unsubscribe(endpoint: string) {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
  }

  /** Sends to every device of the given users. Never throws; failures only get logged. */
  async notify(userIds: number[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0) return
    const rows = this.db
      .prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`)
      .all(...userIds) as { endpoint: string; p256dh: string; auth: string }[]
    await Promise.all(
      rows.map(async (r) => {
        try {
          const alive = await this.send({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload)
          if (!alive) this.unsubscribe(r.endpoint)
        } catch (err) {
          console.warn('Push failed:', err)
        }
      }),
    )
  }
}
