export interface Config {
  port: number
  databasePath: string
  appName: string
  /** Anyone who knows this key (usually via the QR code) can create an account. */
  inviteKey: string
  /** User numbers with admin rights. Fixed in the config, not editable in the app. */
  adminUserIds: number[]
  /** Public address used to build the invite link, e.g. https://billard.example.com */
  publicUrl: string | null
  secureCookies: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const inviteKey = env.INVITE_KEY?.trim()
  if (!inviteKey) {
    throw new Error('INVITE_KEY is not set. Choose a long random value, e.g. `openssl rand -hex 16`.')
  }
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? './data/billard.sqlite',
    appName: env.APP_NAME?.trim() || 'Billard',
    inviteKey,
    adminUserIds: parseIds(env.ADMIN_USER_IDS),
    publicUrl: env.PUBLIC_URL?.replace(/\/+$/, '') || null,
    secureCookies: env.COOKIE_SECURE === 'true',
  }
}

export function parseIds(value: string | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
}
