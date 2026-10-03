import React, { createContext, useContext, useEffect, useState } from 'react'
import { Icon } from './icons.jsx'

const THEME_KEY = 'wintrack-modae-theme'
const SYSTEM_DARK = '(prefers-color-scheme: dark)'
const ThemeContext = createContext(null)

const systemTheme = () => window.matchMedia?.(SYSTEM_DARK).matches ? 'dark' : 'light'

const savedTheme = () => {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch { return null }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  const themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) themeColor.content = theme === 'dark' ? '#0F172A' : '#F8F7F4'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light')

  useEffect(() => {
    const media = window.matchMedia?.(SYSTEM_DARK)
    const onSystemChange = () => {
      if (!savedTheme()) setTheme(systemTheme())
    }
    const onStorage = event => {
      if (event.key === THEME_KEY || event.key === null) {
        setTheme(savedTheme() || systemTheme())
      }
    }
    media?.addEventListener?.('change', onSystemChange)
    window.addEventListener('storage', onStorage)
    const frame = window.requestAnimationFrame(() => document.documentElement.classList.add('theme-ready'))
    return () => {
      media?.removeEventListener?.('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => { applyTheme(theme) }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
    try { window.localStorage.setItem(THEME_KEY, next) } catch { /* storage is optional */ }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme requires ThemeProvider')
  return context
}

export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button type="button"
      className={`theme-toggle inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${className}`}
      onClick={toggleTheme} aria-label={label} title={label} aria-pressed={theme === 'dark'}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  )
}
