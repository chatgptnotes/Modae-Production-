import { useLayoutEffect, useRef, useState } from 'react'
import { viewportPageSize } from './viewportPageSize.js'

export function useViewportPageSize(totalRows, { enabled = true, rootRef, selfRoot = false, listRef: suppliedListRef, rowSelector = ':scope > tr', leadingSelector, measureTallest = false, fallbackRowHeight = 48, heightSource = 'viewport' } = {}) {
  const ownedListRef = useRef(null)
  const listRef = suppliedListRef || ownedListRef
  const pagerRef = useRef(null)
  const [pageSize, setPageSize] = useState(10)

  useLayoutEffect(() => {
    if (!enabled) return
    const list = listRef.current
    const root = selfRoot ? list : rootRef?.current || list?.closest('.page')
    if (!list || !root) return
    const scrollArea = list.closest('.main-scroll')
    const update = () => {
      const listRect = list.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      const scrollRect = scrollArea?.getBoundingClientRect()
      const pagerRect = pagerRef.current?.getBoundingClientRect()
      const rowGap = parseFloat(getComputedStyle(list).rowGap) || 0
      const rowHeights = [...list.querySelectorAll(rowSelector)].map(row => {
        const style = getComputedStyle(row)
        return row.getBoundingClientRect().height + (parseFloat(style.marginBottom) || 0) + rowGap
      })
      const rowHeight = (measureTallest ? Math.max(0, ...rowHeights) : rowHeights[0]) || fallbackRowHeight
      const leadingHeight = leadingSelector ? list.querySelector(leadingSelector)?.getBoundingClientRect().height || 0 : 0
      const nextSize = heightSource === 'list'
        ? Math.max(1, Math.min(totalRows || 1, Math.floor((list.clientHeight - leadingHeight) / rowHeight)))
        : viewportPageSize({
        viewportTop: scrollRect?.top ?? 0,
        viewportBottom: Math.min(window.innerHeight, scrollRect?.bottom ?? window.innerHeight),
        listOffsetTop: listRect.top - rootRect.top,
        rowHeight,
        pagerHeight: pagerRect?.height || 44,
        gap: pagerRect ? Math.max(0, pagerRect.top - listRect.bottom) : 0,
        bottomReserve: parseFloat(getComputedStyle(root).paddingBottom || 0),
        totalRows,
      })
      setPageSize(current => current === nextSize ? current : nextSize)
    }

    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    for (const element of [root, scrollArea, heightSource === 'list' ? list : null]) {
      if (element) observer?.observe(element)
    }
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [enabled, rootRef, selfRoot, listRef, rowSelector, leadingSelector, measureTallest, fallbackRowHeight, heightSource, totalRows])

  return { pageSize, listRef, pagerRef }
}
