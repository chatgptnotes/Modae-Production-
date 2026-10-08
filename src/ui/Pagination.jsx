import React, { useEffect, useState } from 'react'

export const DEFAULT_PAGE_SIZE = 10

export function usePagedRows(rows, resetKey = '', pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => setPage(1), [resetKey])
  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount])

  const currentPage = Math.min(page, pageCount)
  const start = total ? (currentPage - 1) * pageSize : 0
  const end = Math.min(start + pageSize, total)
  return {
    page: currentPage,
    pageCount,
    setPage,
    pagedRows: rows.slice(start, end),
    pagination: <Pagination total={total} page={currentPage} pageSize={pageSize} onPageChange={setPage} />,
  }
}

export function PaginatedGrid({ rows, resetKey = '', className, renderItem, label }) {
  const { pagedRows, pagination } = usePagedRows(rows, resetKey)
  return <>
    <div className={className}>{pagedRows.map(renderItem)}</div>
    {pagination && (label ? React.cloneElement(pagination, { 'aria-label': label }) : pagination)}
  </>
}

export default function Pagination({ total, page, pageSize = DEFAULT_PAGE_SIZE, onPageChange, label = 'List pages', alwaysVisible = false }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize && !alwaysVisible) return null
  const first = total ? (page - 1) * pageSize + 1 : 0
  const last = Math.min(page * pageSize, total)
  return <nav className="list-pagination" aria-label={label}>
    <span className="list-pagination-range">{total ? `${first}–${last} of ${total}` : '0 results'}</span>
    <div className="list-pagination-controls">
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page">First</button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Next page">Next</button>
      <button type="button" onClick={() => onPageChange(pageCount)} disabled={page >= pageCount} aria-label="Last page">Last</button>
    </div>
  </nav>
}
