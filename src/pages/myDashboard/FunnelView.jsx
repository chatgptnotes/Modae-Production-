import React, { useId, useState, useEffect, useSyncExternalStore } from 'react'
import './funnelView.css'
import './surfaceMotion.css'
import AnimatedFunnelStage from './AnimatedFunnelStage.jsx'
import useSurfaceLight, { canHoverSurface } from './useSurfaceLight.js'
import { drillClick } from './drillInteraction.js'
import { dynamicFunnelGeometry, funnelBandPath } from './funnelGeometry.js'

const storageKey = 'wintrack-funnel-view'
const changeEvent = 'wintrack-funnel-view-change'
let fallback = 'normal'
function readView() {
  try { return window.localStorage.getItem(storageKey) === 'dynamic' ? 'dynamic' : 'normal' }
  catch { return fallback }
}
function subscribe(notify) {
  window.addEventListener('storage', notify)
  window.addEventListener(changeEvent, notify)
  return () => {
    window.removeEventListener('storage', notify)
    window.removeEventListener(changeEvent, notify)
  }
}
export function useFunnelView() {
  const view = useSyncExternalStore(subscribe, readView, () => 'normal')
  return [view, next => {
    fallback = next === 'dynamic' ? 'dynamic' : 'normal'
    try { window.localStorage.setItem(storageKey, fallback) } catch { /* Session-only when storage is unavailable. */ }
    window.dispatchEvent(new Event(changeEvent))
  }]
}

export function FunnelViewSwitch({ view, onChange }) {
  return <div className="funnel-view-switch">
    <span className={view === 'dynamic' ? 'is-selected' : undefined}>Dynamic</span>
    <label className="funnel-view-toggle">
      <input type="checkbox" role="switch" aria-label="Normal funnel view" checked={view === 'normal'}
        onChange={event => onChange(event.target.checked ? 'normal' : 'dynamic')} />
      <span className="funnel-view-toggle-track" aria-hidden="true" />
    </label>
    <span className={view === 'normal' ? 'is-selected' : undefined}>Normal</span>
  </div>
}

export default function NormalFunnel({ rows, showMoney, formatMoney, onStageClick, onSegmentClick, view = 'normal', animate = false }) {
  const [hovered, setHovered] = useState(null)
  const light = useSurfaceLight()
  useEffect(() => {
    if (!animate) return
    const reset = () => setHovered(null)
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    media.addEventListener('change', reset)
    window.addEventListener('blur', reset)
    return () => { media.removeEventListener('change', reset); window.removeEventListener('blur', reset) }
  }, [animate])
  const id = useId().replaceAll(':', '')
  const dynamic = view === 'dynamic'
  const geometry = dynamic ? dynamicFunnelGeometry(rows) : []
  return <div className={`normal-funnel${showMoney ? ' has-values' : ''}`} data-funnel-view={view} data-animated={animate ? "" : undefined}>
    <div className="normal-funnel-head"><span /><span>Stage</span><span>Count</span>{showMoney && <span>Value (₹ L)</span>}</div>
    {rows.map((row, index) => {
      const top = 880 - index * 110
      const bottom = top - 110
      const left = (880 - top) / 2
      const clipId = `${id}-stage-${index}`
      let cumulative = 0
      const centerBand = row.segments.find(segment => {
        cumulative += segment.count
        return cumulative > row.count / 2
      })?.key
      const active = hovered?.stage === row.key ? hovered.probability : null
      const activate = probability => setHovered(probability ? { stage: row.key, probability } : null)
      const detailHover = !animate || !row.count ? {} : {
        onPointerEnter: event => { if (canHoverSurface(event)) activate('all') },
        onPointerLeave: () => activate(null),
        onFocus: () => activate('all'), onBlur: () => activate(null),
      }
      let offset = left
      let fraction = 0
      return <div className="normal-funnel-row" key={row.key} data-highlighted={animate && active ? "" : undefined} data-width={dynamic ? geometry[index].width : undefined}>
        <div className="normal-funnel-chart" {...(animate ? light : {})}>
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden={onSegmentClick || dynamic ? undefined : true} aria-label={dynamic ? `${row.label}: ${row.count} opportunities` : undefined}>
            {animate ? <AnimatedFunnelStage row={row} index={index} geometry={dynamic ? geometry[index] : null}
              id={clipId} active={active} setActive={activate} onSegmentClick={onSegmentClick} showMoney={showMoney} formatMoney={formatMoney} /> : dynamic ? <>
              <path d={funnelBandPath(geometry[index])} className="normal-funnel-empty" />
              {row.segments.filter(segment => segment.count > 0).map(segment => {
                const from = fraction
                fraction += row.count ? segment.count / row.count : 0
                const description = `${segment.count} ${segment.key} probability opportunities${showMoney ? ` · ${formatMoney(segment.valueK)}` : ''}`
                return <path key={segment.key} d={funnelBandPath(geometry[index], from, fraction)}
                  className={`normal-funnel-${segment.key}`} tabIndex={0} role="img" aria-label={description} {...drillClick(onSegmentClick && (() => onSegmentClick(row, segment.key)), `View ${row.label}: ${description}`)}>
                  <title>{description}</title>
                </path>
              })}
            </> : <>
            <defs><clipPath id={clipId}><polygon points={`${left},0 ${left + top},0 ${440 + bottom / 2},100 ${440 - bottom / 2},100`} /></clipPath></defs>
            <g clipPath={`url(#${clipId})`}>
              <rect width="1000" height="100" className="normal-funnel-empty" />
              {row.segments.filter(segment => segment.count > 0).map(segment => {
                const width = row.count ? top * segment.count / row.count : 0
                const x = offset
                offset += width
                return <rect key={segment.key} x={x} y="0" width={width} height="100" className={`normal-funnel-${segment.key}`} {...drillClick(onSegmentClick && (() => onSegmentClick(row, segment.key)), `View ${row.label}: ${segment.count} ${segment.key} probability opportunities`)} />
              })}
            </g>
            </>}
            <line x1={dynamic ? 448 + geometry[index].center / 2 : left + top - 20} y1="50" x2="995" y2="50" />
          </svg>
          <b style={onSegmentClick ? { pointerEvents: 'none' } : undefined} className={`normal-funnel-number${centerBand === 'high' || centerBand === 'low' ? ' on-dark' : ''}`}>{row.count}</b>
        </div>
        <div {...detailHover} className="normal-funnel-stage" data-explain-title={row.label}
          data-explain={row.key === 'won' ? 'Only closed opportunities explicitly marked Won count.' : `Only open opportunities at ${row.stages?.join(', ') || row.label} count.`}>
          {onStageClick ? <button type="button" className={onSegmentClick ? 'dashboard-text-action' : undefined} onClick={() => onStageClick(row)}>{row.label}</button> : <strong>{row.label}</strong>}
          <span className="normal-funnel-bands" tabIndex={0} title={row.count ? row.segments.filter(segment => segment.count > 0).map(segment => `${segment.key}: ${segment.count}${showMoney ? ` · ${formatMoney(segment.valueK)}` : ''}`).join('\n') : 'No opportunities — empty stage'}>
            <span className="sr-only">{row.count ? row.segments.filter(segment => segment.count > 0).map(segment => `${segment.key}: ${segment.count}`).join(', ') : 'No opportunities'}</span>
            <span aria-hidden="true">ⓘ</span>
          </span>
        </div>
        <strong {...detailHover} className="normal-funnel-count" {...drillClick(onStageClick && (() => onStageClick(row)), `View ${row.label} opportunities`)}>{row.count}<span className="normal-funnel-phone-unit"> opportunities</span></strong>
        {showMoney && <strong className="normal-funnel-value" {...detailHover} {...drillClick(onStageClick && (() => onStageClick(row)), `View ${row.label} value contributors`)}>{formatMoney(row.valueK)}</strong>}
      </div>
    })}
  </div>
}
