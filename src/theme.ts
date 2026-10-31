export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'billard:theme'

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  root.classList.toggle('dark', choice === 'dark')
  root.classList.toggle('light', choice === 'light')
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d12' : '#f6f7f9')
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Theme still applies for this visit.
  }
}

export function isDarkNow(): boolean {
  const root = document.documentElement
  if (root.classList.contains('dark')) return true
  if (root.classList.contains('light')) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
