import { useEffect, useRef } from 'react'

export const canHoverSurface = event => event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

// Decorative coordinates only: pointer updates never change application state.
export default function useSurfaceLight() {
  const frame = useRef(null)
  const point = useRef(null)
  const clear = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current)
    frame.current = null
    point.current = null
  }
  useEffect(() => clear, [])
  return {
    onPointerMove(event) {
      if (!canHoverSurface(event) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const element = event.currentTarget
      const box = element.getBoundingClientRect()
      point.current = { element, x: (event.clientX - box.left) / box.width * 100, y: (event.clientY - box.top) / box.height * 100 }
      if (frame.current == null) frame.current = requestAnimationFrame(() => {
        frame.current = null
        const p = point.current
        if (!p?.element.isConnected) return
        p.element.style.setProperty('--surface-x', `${p.x}%`)
        p.element.style.setProperty('--surface-y', `${p.y}%`)
        p.element.querySelectorAll('[data-surface-light]').forEach(gradient => {
          gradient.setAttribute('cx', p.x * 10)
          gradient.setAttribute('cy', p.y)
        })
      })
    },
    onPointerLeave: clear,
    onPointerCancel: clear,
  }
}
