import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFileSync } from 'node:fs'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db.ts'

const config = loadConfig()
const db = openDatabase(config.databasePath)
const app = createApp(db, config)

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
