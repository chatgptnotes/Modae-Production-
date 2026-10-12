import React from 'react'
import './outcomes.css'
import CountAxis, { countScale } from './CountAxis.jsx'

export default function OutcomeReasons({ reasons, result, limit = Infinity, heading }) {
  const won = result === 'won'
  const rows = reasons.filter(row => row[result] > 0)
    .slice().sort((a, b) => b[result] - a[result] || a.reason.localeCompare(b.reason))
  const total = rows.reduce((sum, row) => sum + row[result], 0)
  const scale = countScale(Math.max(1, ...rows.map(row => row[result])))
  return <section className={`outcome-reasons${rows.length ? '' : ' is-empty'}`} aria-label={won ? 'Win reasons' : 'Loss reasons'}>
    <h3>{heading || (won ? 'Win reasons' : 'Loss reasons')} <small>· {total}</small></h3>
    {rows.length ? <><p className="outcome-reasons-caption">Share of {total} {won ? total === 1 ? 'win' : 'wins' : total === 1 ? 'loss' : 'losses'}</p>
      <ul>{rows.slice(0, limit).map(row => {
        const share = row[result] / total * 100
        return <li key={row.reason}>
          <span>{row.reason}</span>
          <div className="outcome-reason-plot">
            <span className="outcome-reason-track" aria-hidden="true"><span data-result={result} style={{ width: `${row[result] / scale.maximum * 100}%` }} /></span>
            <strong aria-label={`${row[result]} of ${total} ${won ? 'wins' : 'losses'} (${Math.round(share)}%)`}>{row[result]}<small>{Math.round(share)}%</small></strong>
          </div>
        </li>
      })}</ul><CountAxis scale={scale} label={won ? 'Won opportunities' : 'Lost opportunities'} /></> : <p>{won ? 'No won opportunities yet.' : 'No lost opportunities yet.'}</p>}
  </section>
}
