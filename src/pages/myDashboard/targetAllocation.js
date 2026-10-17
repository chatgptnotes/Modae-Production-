// Targets retain the shared thousands-of-rupees storage unit. All allocation
// and equality checks use integer paise so small INR amounts remain exact.
export const targetPaise = valueK => Math.round((Number(valueK) || 0) * 100000)
export const targetRupees = valueK => targetPaise(valueK) / 100
export const targetThousands = rupees => Math.round((Number(rupees) || 0) * 100) / 100000
export const targetTotal = values => values.reduce((sum, value) => sum + targetPaise(value), 0) / 100000
export const targetAmountsEqual = (left, right) => targetPaise(left) === targetPaise(right)

export function allocateTarget(totalK, weights, count = weights.length) {
  if (!count) return []
  const total = Math.max(0, targetPaise(totalK))
  const amounts = Array.from({ length: count }, (_, index) => Math.max(0, targetPaise(weights[index])))
  const weightTotal = amounts.reduce((sum, value) => sum + value, 0)
  const shares = amounts.map(value => weightTotal ? total * value / weightTotal : total / count)
  const result = shares.map(Math.floor)
  const remainder = total - result.reduce((sum, value) => sum + value, 0)
  const order = shares.map((share, index) => ({ index, fraction: share - result[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let i = 0; i < remainder; i += 1) result[order[i % count].index] += 1
  return result.map(value => value / 100000)
}
