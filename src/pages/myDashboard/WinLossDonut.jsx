import React, { useCallback, useEffect, useId, useRef } from 'react'
import { drillClick } from './drillInteraction.js'
import { donutOutcomeAt, donutTiltAt } from './donutGeometry.js'
import './donutHover.css'

export default function WinLossDonut({ summary, closed, open, animated, hovered, onHover }) {
  const shineId = `donut-shine-${useId().replace(/:/g, '')}`
  const root = useRef(null)
  const lightFrame = useRef(null)
  const lightPoint = useRef({ x: 55, y: 35 })
  const paintLight = useCallback(() => {
    lightFrame.current = null
    root.current?.querySelectorAll('[data-donut-light]').forEach(light => {
      light.setAttribute('cx', lightPoint.current.x)
      light.setAttribute('cy', lightPoint.current.y)
    })
  }, [])
  const reset = useCallback(() => {
    onHover(null)
    root.current?.style.setProperty('--donut-tilt-x', '0deg')
    root.current?.style.setProperty('--donut-tilt-y', '0deg')
    lightPoint.current = { x: 55, y: 35 }
    if (lightFrame.current != null) cancelAnimationFrame(lightFrame.current)
    paintLight()
  }, [onHover, paintLight])
  const share = summary.total ? summary.won / summary.total : 0
  const segmented = animated && summary.total > 0
  useEffect(() => {
    if (!animated) return
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    media.addEventListener('change', reset)
    window.addEventListener('blur', reset)
    return () => {
      media.removeEventListener('change', reset)
      window.removeEventListener('blur', reset)
      if (lightFrame.current != null) cancelAnimationFrame(lightFrame.current)
    }
  }, [animated, reset])
  const move = event => {
    if (!segmented || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      reset()
      return
    }
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width * 160
    const y = (event.clientY - box.top) / box.height * 160
    const outcome = donutOutcomeAt(x, y, share)
    if (!outcome) { reset(); return }
    const tilt = donutTiltAt(x, y)
    root.current.style.setProperty('--donut-tilt-x', `${tilt.x}deg`)
    root.current.style.setProperty('--donut-tilt-y', `${tilt.y}deg`)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lightPoint.current = { x, y }
      if (lightFrame.current == null) lightFrame.current = requestAnimationFrame(paintLight)
    }
    onHover(outcome)
  }
  const active = segmented && summary[hovered] > 0 ? hovered : null
  return <div ref={root} className={`winloss-donut${summary.total ? '' : ' is-empty'}${segmented ? ' winloss-donut-interactive' : ''}`}
    style={{ '--win-share': `${share * 100}%` }} data-hovered={active || undefined}
    {...drillClick(open && (() => open({ kind: 'outcomes' })), 'View win-rate calculation and opportunities')}
    title={animated ? undefined : (open ? 'View win-rate calculation and opportunities' : undefined)}
    role={open ? 'button' : 'img'}
    aria-label={summary.total ? `Win rate ${summary.winRate}%, ${summary.won} won and ${summary.lost} lost` : closed ? 'No won/lost decisions yet' : 'No closed opportunities yet'}
    onPointerMove={animated ? move : undefined} onPointerLeave={animated ? reset : undefined} onPointerCancel={animated ? reset : undefined}>
    {segmented && <svg className="winloss-donut-slices" viewBox="0 0 160 160" aria-hidden="true">
      <defs><linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="white" stopOpacity=".5" /><stop offset=".45" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="black" stopOpacity=".18" /></linearGradient></defs>
      {['won', 'lost'].filter(result => summary[result] > 0).map(result => {
        const start = result === 'won' ? 0 : share
        const fraction = result === 'won' ? share : 1 - share
        const angle = (start + fraction / 2) * Math.PI * 2 - Math.PI / 2
        const circle = { cx: 80, cy: 80, r: 70.5, fill: 'none', strokeWidth: 19, pathLength: 100, strokeDasharray: `${fraction * 100} 100`, transform: `rotate(${start * 360 - 90} 80 80)` }
        return <g key={result} className="winloss-donut-slice" data-result={result}
          style={{ '--slice-x': `${Math.cos(angle) * 9}px`, '--slice-y': `${Math.sin(angle) * 9 - 4}px` }}>
          <defs><radialGradient id={`${shineId}-${result}-light`} data-donut-light="" gradientUnits="userSpaceOnUse"
            cx="55" cy="35" r="65" gradientTransform={`rotate(${90 - start * 360} 80 80)`}>
            <stop offset="0" stopColor="white" stopOpacity=".55" />
            <stop offset=".45" stopColor="white" stopOpacity=".16" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient></defs>
          {[6, 5, 4, 3, 2, 1].map(depth => <g key={depth} className="winloss-donut-side" transform={`translate(0 ${depth})`}>
            <circle {...circle} stroke={`var(--wl-${result === 'won' ? 'win' : 'loss'})`} />
            <circle {...circle} stroke="black" strokeOpacity={.2 + depth * .025} />
          </g>)}
          <circle {...circle} stroke={`var(--wl-${result === 'won' ? 'win' : 'loss'})`} />
          <circle {...circle} stroke={`url(#${shineId})`} />
          <circle {...circle} className="winloss-donut-reflection" stroke={`url(#${shineId}-${result}-light)`} />
        </g>
      })}
    </svg>}
    {segmented && <svg className="winloss-donut-hit" viewBox="0 0 160 160" aria-hidden="true">
      <rect x="-16" y="-16" width="192" height="192" fill="transparent" />
    </svg>}
    <div className={segmented ? 'winloss-donut-centre' : undefined}>
      {segmented ? <>
        <span className={`winloss-centre-copy${!active ? ' is-visible' : ''}`} aria-hidden="true"><strong>{summary.winRate}%</strong><span>Overall win rate</span></span>
        {['won', 'lost'].map(result => <span key={result} data-result={result} className={`winloss-centre-copy${active === result ? ' is-visible' : ''}`} aria-hidden="true"><strong>{summary[result]}</strong><span>{result === 'won' ? 'Won' : 'Lost'} · {result === 'won' ? summary.winRate : 100 - summary.winRate}%</span></span>)}
      </> : <><strong>{summary.total ? `${summary.winRate}%` : '—'}</strong><span>Overall win rate</span></>}
    </div>
  </div>
}
