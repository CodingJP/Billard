import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFileSync } from 'node:fs'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db.ts'
import { loadVapidKeys, PushService, webPushSender } from './push.ts'

const config = loadConfig()
const db = openDatabase(config.databasePath)
const vapid = loadVapidKeys(db)
// web-push needs an https: or mailto: contact for the push services.
const subject = process.env.VAPID_SUBJECT ?? (config.publicUrl?.startsWith('https://') ? config.publicUrl : 'mailto:admin@example.com')
const push = new PushService(db, webPushSender(vapid, subject), vapid.publicKey)
const app = createApp(db, config, push)

// Serve the built frontend; every unknown path falls back to index.html.
app.use('/*', serveStatic({ root: './dist' }))
app.get('*', (c) => {
  try {
    return c.html(readFileSync('./dist/index.html', 'utf8'))
  } catch {
    return c.text('Frontend not built. Run `npm run build` first.', 503)
  }
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`${config.appName} läuft auf http://localhost:${info.port}`)
  if (config.adminUserIds.length === 0) {
    console.log('Hinweis: ADMIN_USER_IDS ist leer. Der erste registrierte User hat die Nummer 1.')
  }
})
