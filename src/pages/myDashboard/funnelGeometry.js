// Widths are a readability scale, not a conversion rate or proportional area.
export function dynamicFunnelGeometry(rows) {
  const counts = rows.map(row => Math.max(0, Number(row.count) || 0))
  const maximum = Math.max(1, ...counts)
  const widths = counts.map(count => 30 + 50 * count / maximum)
  return widths.map((width, index) => {
    const center = width * 8.8
    const previous = (widths[index - 1] ?? width) * 8.8
    const next = (widths[index + 1] ?? width) * 8.8
    // Split smooth cubic transitions halfway between stage centers.
    const controls = [(previous + center) / 2, (previous + 3 * center) / 4, center, center,
      center, (3 * center + next) / 4, (center + next) / 2]
    return { width, center, controls }
  })
}

// Fractions let probability bands follow the same contour at every height.
export function funnelBandPath({ controls }, from = 0, to = 1) {
  const edge = fraction => controls.map(width => 440 + (fraction - 0.5) * width)
  const left = edge(from)
  const right = edge(to)
  return `M ${left[0]} 0 C ${left[1]} 16.667 ${left[2]} 33.333 ${left[3]} 50 C ${left[4]} 66.667 ${left[5]} 83.333 ${left[6]} 100 L ${right[6]} 100 C ${right[5]} 83.333 ${right[4]} 66.667 ${right[3]} 50 C ${right[2]} 33.333 ${right[1]} 16.667 ${right[0]} 0 Z`
}

// Match the Normal view's vertical probability cuts, clipped to its trapezoid.
export function normalFunnelBandPath(index, from = 0, to = 1) {
  if (to <= from) return ''
  const top = 880 - index * 110
  const left = (880 - top) / 2
  let points = [[left, 0], [left + top, 0], [left + top - 55, 100], [left + 55, 100]]
  for (const [boundary, direction] of [[left + top * from, 1], [left + top * to, -1]]) {
    const clipped = []
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      const aIn = direction * (a[0] - boundary) >= 0
      const bIn = direction * (b[0] - boundary) >= 0
      if (aIn) clipped.push(a)
      if (aIn !== bIn) clipped.push([boundary, a[1] + (b[1] - a[1]) * (boundary - a[0]) / (b[0] - a[0])])
    }
    points = clipped
  }
  return points.length ? points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ') + ' Z' : ''
}
