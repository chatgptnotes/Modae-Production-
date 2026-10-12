export function viewportPageSize({ viewportTop, viewportBottom, listOffsetTop, rowHeight, pagerHeight, gap, bottomReserve, totalRows }) {
  const height = Math.max(0, viewportBottom - viewportTop - listOffsetTop - gap - bottomReserve)
  const rowsWithoutPager = Math.max(1, Math.floor(height / rowHeight))
  if (totalRows <= rowsWithoutPager) return Math.max(1, totalRows)
  return Math.max(1, Math.floor((height - pagerHeight) / rowHeight))
}
