export const nextCell = (row, col, key, rows, cols) => {
  if (key === 'ArrowUp') return [Math.max(0, row - 1), col]
  if (key === 'ArrowDown' || key === 'Enter') return [Math.min(rows - 1, row + 1), col]
  if (key === 'ArrowLeft') return [row, Math.max(0, col - 1)]
  if (key === 'ArrowRight' || key === 'Tab') return [row, Math.min(cols - 1, col + 1)]
  return null
}
