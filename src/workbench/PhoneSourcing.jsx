import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'

// Displayed currency uses grouping; an editable draft must remain a number.
export const sourcingNumberDraft = value => String(value ?? 0).replaceAll(',', '')

export function PhoneSourcingLine({ line, item, description, source, canPrice, confirmable, formatMoney, onEdit, onCompare, onConfirm, onRestore, onSource }) {
  const removed = !!line.removedFromSourcing
  const confirmed = line.confirmed && confirmable && !removed
  const status = removed ? 'Removed' : line.priceState === 'Expired' ? 'Expired' : confirmed ? 'Confirmed' : 'Needs review'
  return <article className={`phone-sourcing-line${removed ? ' is-removed' : ''}`}>
    <header><strong>{line.pn || line.custRef || 'Unspecified part'}</strong><span className={`phone-source-status${confirmed ? ' phone-source-status--confirmed' : ''}`}>{confirmed && <Icon name="check" size={14} />}{status}</span></header>
    <p>{description}</p>
    <button type="button" className="phone-source-link" onClick={onSource}>{source || 'Source not recorded'}<Icon name="chevronRight" size={14} /></button>
    {line.leadTime && <small>Lead time: {line.leadTime}</small>}
    <dl className="phone-sourcing-line-values"><div><dt>Quantity</dt><dd>{item.qty}</dd></div>{canPrice && <div><dt>Customer unit price</dt><dd>{formatMoney(item.adjustedUnitPrice)}</dd></div>}</dl>
    {canPrice ? <><div className="phone-sourcing-line-total"><span>Line total</span><b>{formatMoney(item.lineTotal)}</b></div><div className="phone-sourcing-line-actions"><button type="button" onClick={onEdit}><Icon name="edit" size={16} />Edit line</button><button type="button" onClick={onCompare}><Icon name="gitCompare" size={16} />Compare</button></div>{removed ? <button type="button" className="phone-sourcing-confirm" onClick={onRestore}>Restore line</button> : !confirmed && <button type="button" className="phone-sourcing-confirm" disabled={!confirmable} aria-label={`Confirm match for ${line.pn || line.id}`} onClick={onConfirm}>{confirmable ? 'Confirm match' : line.priceState === 'Expired' ? 'Refresh expired price before confirming' : 'Complete quantity and pricing to confirm'}</button>}</> : <p className="phone-sourcing-restricted"><Icon name="lock" size={14} />Pricing restricted</p>}
  </article>
}

export function PhoneSourcingFooter({ totals, grossProfit, grossMarginPct, quoteValidityDays, formatMoney, canContinue, reason, onContinue }) {
  const root = useRef(null)
  const [editing, setEditing] = useState(false)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = root.current
    const workbench = node.closest('.sourcing-workbench')
    const reserveSpace = () => workbench?.style.setProperty('--phone-sourcing-footer-height', `${node.offsetHeight}px`)
    const observer = new ResizeObserver(reserveSpace)
    observer.observe(node)
    const visibility = new IntersectionObserver(entries => setInView(entries[0].isIntersecting), { rootMargin: '0px 0px -220px 0px' })
    if (workbench) visibility.observe(workbench)
    reserveSpace()
    const focusChanged = () => setEditing(!!document.activeElement?.matches('input, textarea, select'))
    document.addEventListener('focusin', focusChanged)
    document.addEventListener('focusout', focusChanged)
    return () => { observer.disconnect(); visibility.disconnect(); document.removeEventListener('focusin', focusChanged); document.removeEventListener('focusout', focusChanged); workbench?.style.removeProperty('--phone-sourcing-footer-height') }
  }, [])
  return <footer ref={root} className={`phone-sourcing-footer${editing || !inView ? ' is-editing' : ''}`} aria-label="BOQ financial totals">
    <details><summary><span>BOQ revenue<strong>{formatMoney(totals.revenue)}</strong></span><span className={grossMarginPct < 0 ? 'is-negative' : ''}>Gross margin<strong>{grossMarginPct.toFixed(1)}%</strong></span><Icon name="chevronDown" size={18} /></summary><dl><div><dt>Projected COGS</dt><dd>{formatMoney(totals.cogs)}</dd></div><div><dt>Gross profit</dt><dd className={grossProfit < 0 ? 'is-negative' : ''}>{formatMoney(grossProfit)}</dd></div><div><dt>Quote validity</dt><dd>{quoteValidityDays} days</dd></div></dl></details>
    {!canContinue && <p role="status">{reason}</p>}
    <button type="button" className="primary" disabled={!canContinue} title={reason || undefined} onClick={onContinue}>Next: Proposal<Icon name="arrowRight" size={18} /></button>
  </footer>
}
