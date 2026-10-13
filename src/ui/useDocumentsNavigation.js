import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createDocumentsPreferences } from '../documentsPreferences.js'

function browserStorage(name) {
  try { return window[name] } catch { return null }
}
function scrollContainer(page) {
  for (let node = page?.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node
  }
  return document.scrollingElement
}
export function useDocumentsNavigation(user, scope) {
  const pageRef = useRef(null)
  const { pathname } = useLocation()
  const [preferences] = useState(() => createDocumentsPreferences(user, scope, browserStorage('localStorage'), browserStorage('sessionStorage')))
  const [state, setState] = useState(() => preferences.read())
  const latest = useRef(state)
  const container = useRef(null)
  useLayoutEffect(() => {
    const element = scrollContainer(pageRef.current)
    container.current = element
    if (!element) return
    const eventTarget = element === document.scrollingElement ? window : element
    const desired = latest.current.scroll[pathname] || 0
    let restoring = true
    const restore = () => { if (!restoring) return; element.scrollTop = Math.min(desired, Math.max(0, element.scrollHeight - element.clientHeight)) }
    const remember = () => {
      if (!restoring) latest.current = { ...latest.current, scroll: { ...latest.current.scroll, [pathname]: element.scrollTop } }
    }
    const stop = () => { restoring = false; observer.disconnect(); remember() }
    const observer = new ResizeObserver(() => { if (restoring) restore() })
    if (pageRef.current) observer.observe(pageRef.current)
    restore()
    let followupFrame
    const frame = requestAnimationFrame(() => { restore(); followupFrame = requestAnimationFrame(restore) })
    const timer = setTimeout(stop, 1200)
    const save = () => { remember(); preferences.save(latest.current) }
    eventTarget.addEventListener('scroll', remember, { passive: true })
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) eventTarget.addEventListener(type, stop, { passive: true })
    window.addEventListener('pagehide', save)
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(followupFrame); clearTimeout(timer); observer.disconnect()
      // The next route may already have shortened the container. Save the last
      // observed position, never its newly clamped scrollTop during teardown.
      preferences.save(latest.current)
      eventTarget.removeEventListener('scroll', remember)
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) eventTarget.removeEventListener(type, stop)
      window.removeEventListener('pagehide', save)
    }
  }, [pathname, preferences])
  const update = (patch, resetScroll = false) => {
    const next = { ...latest.current, ...patch }
    if (resetScroll) {
      next.scroll = { ...next.scroll, [pathname]: 0 }
      if (container.current) container.current.scrollTop = 0
    }
    latest.current = next
    preferences.save(next)
    setState(next)
  }
  return { ...state, pageRef, update }
}
