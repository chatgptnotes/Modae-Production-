// Fixed coordinates keep a lifted slice from moving out from under the pointer.
export function donutOutcomeAt(x, y, wonShare) {
  const dx = x - 80
  const dy = y - 80
  const radius = Math.hypot(dx, dy)
  if (radius < 61 || radius > 96) return null
  const turn = ((Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
  return turn < wonShare ? 'won' : 'lost'
}

// Degrees in a stationary 160px coordinate system; decorative layers alone tilt.
export function donutTiltAt(x, y) {
  const clamp = value => Math.max(-4, Math.min(4, value))
  return { x: clamp((80 - y) / 20), y: clamp((x - 80) / 20) }
}
