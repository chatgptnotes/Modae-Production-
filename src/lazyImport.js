import React from 'react'

const RECOVERY_KEY = 'modae:chunk-recovery'

export function isChunkLoadError(error) {
  const message = String(error?.message || error || '')
  return /(?:dynamically imported module|importing a module script failed|loading (?:chunk|css chunk)|failed to fetch).*(?:module|chunk|css|javascript)|chunk/i.test(message)
}

function sessionValue() {
  try { return window.sessionStorage.getItem(RECOVERY_KEY) } catch { return null }
}

function setSessionValue(value) {
  try { window.sessionStorage.setItem(RECOVERY_KEY, value) } catch { /* storage is optional */ }
}

function clearSessionValue() {
  try { window.sessionStorage.removeItem(RECOVERY_KEY) } catch { /* storage is optional */ }
}

async function clearApplicationCaches() {
  if (typeof window === 'undefined') return

  try {
    if ('caches' in window) {
      const names = await window.caches.keys()
      await Promise.all(names.filter(name => name.startsWith('wintrack-')).map(name => window.caches.delete(name)))
    }
  } catch { /* cache cleanup is best effort */ }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    }
  } catch { /* service-worker cleanup is best effort */ }
}

function recoverFromStaleChunk(error) {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false
  if (sessionValue()) return false

  setSessionValue(String(Date.now()))
  void clearApplicationCaches().finally(() => window.location.reload())
  return true
}

// Keep route splitting, but make a deployment boundary self-healing when an
// old shell or service-worker cache points at a chunk that no longer exists.
export function lazyWithRecovery(loader) {
  return React.lazy(() => loader().then(module => {
    clearSessionValue()
    return module
  }).catch(error => {
    if (isChunkLoadError(error) && recoverFromStaleChunk(error)) {
      return new Promise(() => {})
    }
    throw error
  }))
}
