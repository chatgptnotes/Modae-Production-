import React, { useId, useLayoutEffect, useRef } from 'react'
import './leadFieldControls.css'

export default function AutosizeTextarea({ value, name, rows = 2, ...props }) {
  const ref = useRef(null)
  const id = useId()
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const fit = () => {
      if (!node.clientWidth) return
      const css = getComputedStyle(node)
      const minimum = parseFloat(css.minHeight) || 0
      const maximum = parseFloat(css.maxHeight) || Infinity
      node.style.height = '0px'
      const content = node.scrollHeight + (parseFloat(css.borderTopWidth) || 0) + (parseFloat(css.borderBottomWidth) || 0)
      node.style.height = `${Math.max(minimum, Math.min(content, maximum))}px`
      node.style.overflowY = 'auto'
    }
    let width = node.clientWidth
    fit()
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) { width = node.clientWidth; fit() }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [value])
  return <textarea {...props} name={name || id} ref={ref} value={value} rows={rows} />
}
