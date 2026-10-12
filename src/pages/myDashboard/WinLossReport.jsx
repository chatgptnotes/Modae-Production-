import React, { useState } from 'react'
import OutcomeReasons from './OutcomeReasons.jsx'
import CountAxis, { countScale } from './CountAxis.jsx'

export default function WinLossReport({ outcomes, showMoney = false }) {
  const { summary, byReason, closedOther = { count: 0, byStage: [] } } = outcomes
  const closed = summary.total + closedOther.count
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState('all')
  const select = result => {
    setSelected(value => value === result ? 'all' : result)
    setShowAll(false)
  }
  const series = selected === 'all' ? ['won', 'lost'] : [selected]
  const count = row => series.reduce((total, result) => total + row[result], 0)
  const reasons = byReason.filter(row => count(row) > 0).slice()
    .sort((a, b) => count(b) - count(a) || a.reason.localeCompare(b.reason))
  const limit = showAll ? Infinity : 5
  const scale = countScale(Math.max(1, ...reasons.map(count)))
  const shares = summary.total ? { won: summary.winRate, lost: 100 - summary.winRate } : { won: null, lost: null }
  const totalValue = summary.wonValueK == null || summary.lostValueK == null ? null : summary.wonValueK + summary.lostValueK
  const heading = selected === 'all' ? 'Won vs Lost by Reason' : selected === 'won' ? 'Won by reason' : 'Lost by reason'
  const rankedResult = selected === 'won' ? 'won' : 'lost'
  const explanation = summary.total
    ? `${summary.won} ${summary.won === 1 ? 'win' : 'wins'} out of ${summary.total} won/lost decisions.`
    : 'No won/lost decisions yet.'
  return <div className="winloss-report">
    <div className="winloss-chart-grid">
      <div className="winloss-summary">
        <h3 className="winloss-chart-heading">Win vs Lost</h3>
        <div className="winloss-summary-main">
        <div className={`winloss-donut${summary.total ? '' : ' is-empty'}`}
          style={{ '--win-share': `${summary.total ? summary.won / summary.total * 100 : 0}%` }}
          role="img" aria-label={summary.total ? `Win rate ${summary.winRate}%, ${summary.won} won and ${summary.lost} lost` : closed ? 'No won/lost decisions yet' : 'No closed opportunities yet'}>
          <div><strong>{summary.total ? `${summary.winRate}%` : '—'}</strong><span>Overall win rate</span></div>
        </div>
        <div className="winloss-summary-content">
          <div className="winloss-counts" role="group" aria-label="Filter reasons by outcome">
            {['won', 'lost'].map(result => <button type="button" data-result={result} aria-pressed={selected === result}
              aria-label={`${result === 'won' ? 'Won' : 'Lost'} ${summary[result]} (${shares[result] == null ? '—' : `${shares[result]}%`}), ${selected === result ? 'show both outcomes' : `show ${result} reasons`}`}
              key={result} onClick={() => select(result)}>
              <span className="winloss-count-label"><i aria-hidden="true" />{result === 'won' ? 'Won' : 'Lost'}</span>
              <strong className="winloss-count-value">{summary[result]} <small>({shares[result] == null ? '—' : `${shares[result]}%`})</small></strong>
            </button>)}
          </div>
          <div className="winloss-filter-status">{selected === 'all' ? <span>Click Won or Lost to filter reasons</span> : <button type="button" onClick={() => select(selected)}>Show both outcomes</button>}</div>
        </div>
        </div>
        <dl className="winloss-summary-totals">
          <div><dt>Won/Lost Closed</dt><dd>{summary.total}</dd></div>
          {showMoney && totalValue != null && <div><dt>Total Opportunity Value</dt><dd>₹{(totalValue / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L</dd></div>}
        </dl>
        <p className="winloss-calculation">{closed} closed {closed === 1 ? 'opportunity' : 'opportunities'} · {explanation}</p>
        {closedOther.count > 0 && <p className="winloss-exclusion">{closedOther.count} other closed {closedOther.count === 1 ? 'outcome is' : 'outcomes are'} excluded from win rate.</p>}
      </div>
      {selected !== 'all' && !summary[selected] ? <p className="winloss-selected-empty" role="status">No {selected} opportunities yet.</p> : <>
      <section className="winloss-comparison" aria-label={heading}>
        <h3 className="winloss-chart-heading">{heading}</h3>
        <div className="winloss-chart-legend">{series.map(result => <span key={result}><i data-result={result} />{result === 'won' ? 'Won' : 'Lost'}</span>)}</div>
        {reasons.length ? <><ul>{reasons.slice(0, limit).map(row => <li key={row.reason}>
          <span>{row.reason}</span>
          <div className="winloss-comparison-bars" role="group" aria-label={`${row.won} won, ${row.lost} lost`}>
            <span className="winloss-comparison-track" aria-hidden="true">{series.filter(result => row[result] > 0).map(result =>
              <i key={result} data-result={result} style={{ width: `${row[result] / scale.maximum * 100}%` }} />
            )}</span>
            <span className="winloss-bar-counts">{series.map((result, index) => <React.Fragment key={result}>
              {index > 0 && <i aria-hidden="true">·</i>}
              <b data-result={result}><span className="visually-hidden">{result === 'won' ? 'Won' : 'Lost'} </span>{row[result]}</b>
            </React.Fragment>)}</span>
          </div>
        </li>)}</ul><CountAxis scale={scale} label="Number of opportunities" />{selected === 'all' && <p className="winloss-axis-caption">Bar length shows combined Won and Lost count</p>}</> : <p className="winloss-chart-empty">No won/lost reasons yet.</p>}
        {selected === 'all' && !summary.won && <p className="winloss-chart-empty">No won opportunities yet.</p>}
      </section>
      <OutcomeReasons reasons={byReason} result={rankedResult} limit={limit} heading={`${showAll ? '' : 'Top '}${rankedResult === 'won' ? 'Win' : 'Loss'} Reasons (by count)`} />
      </>}
    </div>
    {reasons.length > 5 && <div className="winloss-reason-disclosure">
      <span>{showAll ? `All ${reasons.length} reasons shown` : `Top 5 of ${reasons.length} reasons shown`}</span>
      <button type="button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show top 5' : 'Show all reasons'}</button>
    </div>}
    {closedOther.count > 0 && <div className="winloss-other">
      <h3>Other closed outcomes <small>· {closedOther.count}</small></h3>
      <dl>{closedOther.byStage.map(row => <div key={row.stage}><dt>{row.stage}</dt><dd>{row.count}</dd></div>)}</dl>
    </div>}
  </div>
}
