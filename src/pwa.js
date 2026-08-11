import React from 'react'

export function registerSW() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = React.useState(null)
  const [isStandalone, setIsStandalone] = React.useState(() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    } catch (e) {
      return false
    }
  })

  React.useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault()
      setPromptEvent(e)
    }
    function onInstalled() {
      setPromptEvent(null)
      setIsStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const install = React.useCallback(async () => {
    if (!promptEvent) return false
    try {
      promptEvent.prompt()
      const choice = await promptEvent.userChoice
      setPromptEvent(null)
      return !!choice && choice.outcome === 'accepted'
    } catch (e) {
      setPromptEvent(null)
      return false
    }
  }, [promptEvent])

  return { canInstall: !!promptEvent, install, isStandalone, isIOS }
}
