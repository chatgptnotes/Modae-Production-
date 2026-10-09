import React, { useLayoutEffect, useRef } from 'react'

const positions = new Map()

// Pages own their phone layouts and explicit table-editing controls.
export default function MobileContent({ children, hasTitle, routeKey }) {
  const root = useRef(null)
  useLayoutEffect(() => {
    const node = root.current
    let position = positions.get(routeKey) || { window: 0, content: 0 }
    const restore = requestAnimationFrame(() => {
      window.scrollTo(0, position.window)
      node.scrollTop = position.content
    })
    const remember = () => { position = { window: window.scrollY, content: node.scrollTop } }
    window.addEventListener('scroll', remember, { passive: true })
    node.addEventListener('scroll', remember, { passive: true })
    return () => {
      cancelAnimationFrame(restore)
      window.removeEventListener('scroll', remember)
      node.removeEventListener('scroll', remember)
      positions.set(routeKey, position)
      if (positions.size > 100) positions.delete(positions.keys().next().value)
    }
  }, [routeKey])
  return <div ref={root} className={`mobile-content${hasTitle ? ' has-mobile-title' : ''}`}>{children}</div>
}
