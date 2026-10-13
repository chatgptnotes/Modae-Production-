import React from 'react'
import { funnelBandPath, normalFunnelBandPath } from './funnelGeometry.js'
import { drillClick } from './drillInteraction.js'
import { canHoverSurface } from './useSurfaceLight.js'

export default function AnimatedFunnelStage({ row, index, geometry, id, active, setActive, onSegmentClick, showMoney, formatMoney }) {
  const path = (from = 0, to = 1) => geometry ? funnelBandPath(geometry, from, to) : normalFunnelBandPath(index, from, to)
  let fraction = 0
  const segments = row.segments.filter(s => s.count > 0).map(segment => {
    const from = fraction
    fraction += segment.count / row.count
    return { ...segment, d: path(from, fraction) }
  })
  return <>
    <defs><linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="white" stopOpacity=".36" /><stop offset=".3" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="black" stopOpacity=".1" /></linearGradient><radialGradient id={`${id}-light`} data-surface-light="" gradientUnits="userSpaceOnUse" cx="300" cy="0" r="220"><stop offset="0" stopColor="white" stopOpacity=".3" /><stop offset="1" stopColor="white" stopOpacity="0" /></radialGradient></defs>
    {!row.count && <path d={path()} className="normal-funnel-empty" />}
    <g aria-hidden="true" className="funnel-segment-faces">
      {segments.map(segment => <g key={segment.key} className="funnel-segment-face" data-probability={segment.key}
        data-active={active === segment.key || active === 'all' ? '' : undefined} data-muted={active && active !== 'all' && active !== segment.key ? '' : undefined}>
        <g transform="translate(0 3)"><path d={segment.d} className={`normal-funnel-${segment.key}`} /><path d={segment.d} fill="black" fillOpacity=".25" /></g>
        <path d={segment.d} className={`normal-funnel-${segment.key}`} />
        <path d={segment.d} fill={`url(#${id}-bevel)`} />
        <path d={segment.d} className="funnel-segment-reflection" fill={`url(#${id}-light)`} />
      </g>)}
    </g>
    {segments.map(segment => {
      const label = `${row.label}: ${segment.count} ${segment.key} probability opportunities${showMoney ? ` · ${formatMoney(segment.valueK)}` : ''}`
      return <path key={segment.key} d={segment.d} className="funnel-segment-hit" data-probability={segment.key}
        {...drillClick(onSegmentClick && (() => onSegmentClick(row, segment.key)), `View ${label}`)} title={undefined}
        onPointerEnter={event => { if (canHoverSurface(event)) setActive(segment.key) }}
        onPointerLeave={() => setActive(null)} onFocus={() => setActive(segment.key)} onBlur={() => setActive(null)} />
    })}
  </>
}
