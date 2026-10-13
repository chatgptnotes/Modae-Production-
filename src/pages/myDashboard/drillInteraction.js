import { createContext, useContext } from 'react'

export const DrilldownContext = createContext(null)
export const useDashboardDrilldown = () => useContext(DrilldownContext)

// Row/card clicks do not swallow an independent link, control, or text selection.
export function drillClick(onClick, label, { row = false } = {}) {
  if (!onClick) return {}
  const activate = event => {
    const control = event.target.closest?.('button,a,input,select,[data-drill-click]')
    if (control && control !== event.currentTarget) return
    if (event.type === 'click' && globalThis.getSelection?.()?.toString()) return
    event.stopPropagation()
    if (event.type === 'click') {
      const target = event.currentTarget.tabIndex >= 0 ? event.currentTarget : event.currentTarget.querySelector('[tabindex="0"],button')
      target?.focus({ preventScroll: true })
    }
    onClick()
  }
  return { 'data-drill-click': '', role: row ? undefined : 'button', tabIndex: 0, 'aria-label': label, title: label,
    onClick: activate,
    onKeyDown: event => {
      if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
      event.preventDefault()
      activate(event)
    } }
}
