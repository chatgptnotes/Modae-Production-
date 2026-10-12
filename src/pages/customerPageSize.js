export function customerPageSize({ bodyTop, viewportBottom, rowHeight, paginationHeight, legendHeight, bottomPadding, totalRows }) {
  const height = Math.max(0, viewportBottom - bodyTop - legendHeight - bottomPadding)
  const rowsWithoutPagination = Math.max(1, Math.floor(height / rowHeight))
  if (totalRows <= rowsWithoutPagination) return Math.max(1, totalRows)
  return Math.max(1, Math.floor((height - paginationHeight) / rowHeight))
}
