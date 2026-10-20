import { workspaceSyncState } from '../workspaceSyncState.js'
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { createFontPreferenceSession, FONT_CHOICES, fontPreferenceKey } from '../userFontPreferences.js'
import { createUserPreferencesRequest } from '../userPreferencesApi.js'
import './workspaceTypography.css'

const FontContext = createContext(null)
export function WorkspaceFontProvider({ auth, active, children }) {
  const userId = auth?.user?.id || auth?.user?.email || ''
  const source = auth?.source || 'local'
  const remote = source === 'supabase'
  const key = userId ? `${source}:${userId}` : 'signed-out'
  const session = useMemo(() => {
    let storage
    try { storage = userId ? window.localStorage : undefined } catch { /* Optional cache. */ }
    return createFontPreferenceSession({ key, remote, storage, request: createUserPreferencesRequest(userId) })
  }, [key, remote, userId])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  useEffect(() => {
    session.activate()
    if (userId) void session.refresh()
    const refresh = () => { if (!workspaceSyncState.enabled && userId && document.visibilityState !== 'hidden') void session.refresh() }
    const onStorage = event => { if (event.key === fontPreferenceKey(key) || event.key === null) refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      session.dispose()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [session, key, userId])
  useLayoutEffect(() => {
    const root = document.documentElement
    if (active && userId) {
      root.dataset.workspaceFont = state.font
      root.style.setProperty('--workspace-font', FONT_CHOICES.find(font => font.id === state.font).family)
    } else {
      delete root.dataset.workspaceFont
      root.style.removeProperty('--workspace-font')
    }
    return () => { delete root.dataset.workspaceFont; root.style.removeProperty('--workspace-font') }
  }, [active, userId, state.font])
  return <FontContext.Provider value={{ ...state, save: session.save, saveLayout: session.saveLayout, refresh: session.refresh, remote }}>
    {children}
    {active && userId && state.error && <div className="workspace-preference-error" role="alert">
      <span>{state.error}</span>
      <button type="button" disabled={state.loading || state.saving} onClick={() => void session.refresh()}>Reload preferences</button>
    </div>}
  </FontContext.Provider>
}
export const useWorkspaceFont = () => useContext(FontContext)
