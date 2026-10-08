import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { Icon } from '../icons.jsx'
import { readTheme, saveTheme, storageTheme } from './workspaceTheme.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ active, children }) {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    const onStorage = event => {
      const next = storageTheme(event)
      if (next !== null) setTheme(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useLayoutEffect(() => {
    const effective = active ? theme : 'light'
    document.documentElement.dataset.theme = effective
    document.documentElement.dataset.workspaceTheme = effective
    return () => {
      document.documentElement.dataset.theme = 'light'
      document.documentElement.dataset.workspaceTheme = 'light'
    }
  }, [active, theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    setTheme(next)
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useWorkspaceTheme = () => useContext(ThemeContext)

export function WorkspaceThemeButton({ className = 'workspace-theme-toggle' }) {
  const { theme, toggleTheme } = useWorkspaceTheme()
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`
  return <button type="button" className={className} onClick={toggleTheme} aria-label={label} title={label} aria-pressed={theme === 'dark'}>
    <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
  </button>
}
