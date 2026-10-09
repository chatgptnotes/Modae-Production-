import { useEffect, useRef, useState } from 'react'

// Transient UI state only: never written to the shared store or browser disk.
const views = new Map()
export default function useListState(key, initial) {
  const initialValue = () => typeof initial === 'function' ? initial() : initial
  const [value, setValue] = useState(() => views.has(key) ? views.get(key) : initialValue())
  const activeKey = useRef(key)
  useEffect(() => {
    if (activeKey.current !== key) {
      activeKey.current = key
      setValue(views.has(key) ? views.get(key) : initialValue())
      return
    }
    views.set(key, value)
    // Bound memory across long sessions and account switches.
    if (views.size > 200) views.delete(views.keys().next().value)
  }, [key, value])
  return [value, setValue]
}
