// Browser appearance is independent of shared workspace data and auth storage.
export const THEME_KEY = 'modae_theme'
const normalize = value => value === 'dark' ? 'dark' : 'light'

export function readTheme(browser = globalThis.window) {
  try { return normalize(browser.localStorage.getItem(THEME_KEY)) } catch { return 'light' }
}

export function saveTheme(theme, browser = globalThis.window) {
  try { browser.localStorage.setItem(THEME_KEY, normalize(theme)) } catch { /* Appearance still works in memory. */ }
}

export function storageTheme(event, browser = globalThis.window) {
  try {
    if (event.storageArea !== browser.localStorage || (event.key !== THEME_KEY && event.key !== null)) return null
    return normalize(event.newValue)
  } catch { return null }
}
