import React from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons.jsx'
import { displayOpportunityId } from '../seed.js'
import { displayRole, fmtRupeesFromK } from '../utils.js'

export function PhoneOpportunityRow({ opportunity: opp, canSeeValue, due }) {
  const overdue = due && !['Won', 'Lost', 'Closed'].includes(opp.stage) && new Date(`${due}T23:59:59`) < new Date()
  return <article className="phone-opportunity-row">
    <Link className="phone-record" to={`/opp/${opp.id}`}>
      <strong>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</strong>
      <span className="phone-opportunity-name">{opp.oppName || 'Untitled opportunity'}</span>
      <small>{displayOpportunityId(opp.id)} · {displayRole(opp.owner) || 'Unassigned'}</small>
      <div className="phone-opportunity-meta"><span className="phone-opportunity-stage">{opp.milestone || opp.stage || 'No stage'}</span>{overdue && <span className="phone-opportunity-overdue">Overdue</span>}{canSeeValue && <b>{fmtRupeesFromK(opp.valueK) || '—'}</b>}</div>
      <Icon name="chevronRight" size={18} />
    </Link>
  </article>
}

export function PhoneOpportunityProgress({ activeStep, completedThrough, reviewing = false, onStep, onBack, onNext, onEdit, allowFutureNavigation = false, steps = [] }) {
  const activeIndex = steps.findIndex(step => step.slug === activeStep)
  const currentIndex = reviewing ? completedThrough : activeIndex
  return <nav className="phone-opportunity-progress" aria-label="Opportunity progress">
    <div className="phone-progress-current">
      <button type="button" disabled={activeIndex <= 0} aria-label="Previous workflow step" onClick={() => onBack?.(steps[activeIndex - 1])}><Icon name="chevronLeft" size={20} /></button>
      <div><small>Step {Math.max(0, activeIndex + 1)} of {steps.length}{reviewing ? ' · Review' : ''}</small><strong>{steps[activeIndex]?.label || 'Opportunity progress'}</strong></div>
      <button type="button" disabled={activeIndex < 0 || activeIndex >= steps.length - 1} aria-label="Next workflow step" onClick={() => onNext?.(steps[activeIndex + 1], activeIndex < completedThrough)}><Icon name="chevronRight" size={20} /></button>
    </div>
    <div className="phone-progress-dots" aria-hidden="true">{steps.map((step, index) => <i key={step.slug} className={index === currentIndex ? 'current' : index < currentIndex ? 'done' : ''} />)}</div>
    {reviewing && <button type="button" className="phone-progress-edit" onClick={() => onEdit?.(steps[activeIndex])}>Edit stage</button>}
    <details className="phone-progress-disclosure"><summary>View all steps</summary><div>{steps.map((step, index) => <button key={step.slug} type="button" disabled={!allowFutureNavigation && index > completedThrough} aria-label={`${step.label}${index > completedThrough && !allowFutureNavigation ? ', locked future stage' : ''}`} aria-current={index === currentIndex ? 'step' : undefined} onClick={() => onStep?.(step.slug)}><span>{index < completedThrough ? '✓' : String(index + 1).padStart(2, '0')}</span>{step.label}{index > completedThrough && !allowFutureNavigation && <Icon name="lock" size={14} />}</button>)}</div></details>
  </nav>
}
