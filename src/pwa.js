import React from 'react'

export function registerSW() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

// `beforeinstallprompt` fires once per page load, so the event cannot live in
// component state — the login banner would swallow it and the post-login
// button, mounted later, would never know the app is installable. Keep it in
// one module-level slot every consumer subscribes to.
let deferredPrompt = null
let installed = false
const subscribers = new Set()

function broadcast() { subscribers.forEach(fn => fn()) }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredPrompt = e
    broadcast()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    broadcast()
  })
}

function standalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch (e) {
    return false
  }
}

export function usePwaInstall() {
  const [, bump] = React.useReducer(n => n + 1, 0)

  React.useEffect(() => {
    subscribers.add(bump)
    return () => { subscribers.delete(bump) }
  }, [])

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const install = React.useCallback(async () => {
    if (!deferredPrompt) return false
    const e = deferredPrompt
    try {
      e.prompt()
      const choice = await e.userChoice
      deferredPrompt = null
      broadcast()
      return !!choice && choice.outcome === 'accepted'
    } catch (err) {
      deferredPrompt = null
      broadcast()
      return false
    }
  }, [])

  return { canInstall: !!deferredPrompt, install, isStandalone: installed || standalone(), isIOS }
}
