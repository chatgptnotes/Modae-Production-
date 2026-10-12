import React from 'react'

export function countScale(maximum) {
  const target = Math.max(1, maximum / 3)
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].find(value => value * magnitude >= target) * magnitude
  return { maximum: step * 3, ticks: [0, step, step * 2, step * 3] }
}

export default function CountAxis({ scale, label }) {
  return <div className="winloss-count-axis">
    <div aria-hidden="true">{scale.ticks.map(tick => <span key={tick}>{tick}</span>)}</div>
    <p>{label}</p>
  </div>
}
