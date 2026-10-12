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
