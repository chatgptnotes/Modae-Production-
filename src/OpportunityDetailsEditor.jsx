import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CATEGORIES, CUSTOMER_STATUSES, OWNERS, OPP_TYPES, BUS, SEGMENTS, SOLUTIONS, PRODUCTS, PROB_LEVELS } from './seed.js'
import { displayRole, productList, solutionLabel, solutionList, rupeesToK } from './utils.js'

const Field = ({ label, children }) => (
  <div className="opportunity-field"><label>{label}</label>{children}</div>
)

const ReadOnlyField = ({ label, value, wide = false }) => (
  <Field label={label}>
    <div className={`read-only-field ${wide ? 'read-only-field-wide' : ''}`}>{value || '—'}</div>
  </Field>
)

// Older leads stored the complete inbound email in Opportunity Scope. Keep
// those records readable while new records store the cleaned service/request
// scope at creation time.
const displayOpportunityScope = value => String(value || '')
  .replace(/^dear[^\n]*\n+/i, '')
  .replace(/^\s*(?:customer|euc\s+name|euc\s+location|contact\s+person|contact\s+phone)\s*:[^\n]*\n?/gim, '')
  .replace(/\n\s*(?:regards|best regards|kind regards),[\s\S]*$/i, '')
  .trim()

const fields = [
  'owner', 'oppName', 'opportunityScope', 'rfqNumber', 'rfqDate', 'valueK', 'sellTo', 'category', 'location', 'customerStatus',
  'eucName', 'eucLocation', 'oppType', 'bu', 'segment', 'solution', 'product', 'prob',
  'contactPerson', 'contactPhone', 'additionalCustomerInformation',
]

const makeDraft = opp => ({
  owner: opp.owner || '', oppName: opp.oppName || '', opportunityScope: opp.opportunityScope || '', sellTo: opp.sellTo || '',
  rfqNumber: opp.rfqNumber || '', rfqDate: opp.rfqDate || '', valueK: opp.valueK == null ? '' : opp.valueK * 1000,
  category: opp.category || '', location: opp.location || '',
  customerStatus: opp.customerStatus || '', eucName: opp.eucName || '',
  eucLocation: opp.eucLocation || '', oppType: opp.oppType || '',
  bu: opp.bu || '', segment: opp.segment || '', solution: solutionList(opp.solution),
  product: productList(opp.product), prob: opp.prob || '',
  contactPerson: opp.contactPerson || '', contactPhone: opp.contactPhone || '',
  additionalCustomerInformation: opp.additionalCustomerInformation || '',
})

export function OpportunityDetailsView({ opp, className = '' }) {
  const product = productList(opp.product)
  return (
    <section className={`opportunity-details-editor opportunity-details-view ${className}`}>
      <div className="opportunity-details-heading">
        <div className="workbench-section-title">Opportunity details</div>
      </div>

      <div className="opportunity-details-group">Identity</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Opp ID" value={`${opp.id} (Sl ${opp.sl})`} />
        <ReadOnlyField label="Owner" value={displayRole(opp.owner)} />
        <ReadOnlyField label="RFQ Number" value={opp.rfqNumber} />
        <ReadOnlyField label="RFQ Date" value={opp.rfqDate} />
        <div className="opportunity-details-wide">
          <label>Opportunity Name/Description</label>
          <div className="read-only-field">{opp.oppName || '—'}</div>
        </div>
        <div className="opportunity-details-wide">
          <label>Opportunity Scope</label>
          <div className="read-only-field read-only-field-multiline">{displayOpportunityScope(opp.opportunityScope) || '—'}</div>
        </div>
      </div>

      <div className="opportunity-details-group">Customer</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Sell To Customer" value={opp.sellTo} />
        <ReadOnlyField label="Category" value={opp.category} />
        <ReadOnlyField label="Location" value={opp.location} />
        <ReadOnlyField label="Customer Status" value={opp.customerStatus} />
        <ReadOnlyField label="EUC Name" value={opp.eucName} />
        <ReadOnlyField label="EUC Location" value={opp.eucLocation} />
        <div className="opportunity-details-wide">
          <label>Additional customer information</label>
          <div className="read-only-field read-only-field-multiline">{opp.additionalCustomerInformation || '—'}</div>
        </div>
      </div>

      <div className="opportunity-details-group">Classification</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Opp Type" value={opp.oppType} />
        <ReadOnlyField label="BU" value={opp.bu} />
        <ReadOnlyField label="Segment" value={opp.segment} />
        <ReadOnlyField label="Estimated Value (₹)" value={opp.valueK == null ? '—' : `₹ ${Number(opp.valueK * 1000).toLocaleString('en-IN')}`} />
        <ReadOnlyField label="Solution" value={solutionLabel(opp.solution)} />
        <ReadOnlyField label="Probability" value={opp.prob} />
        <ReadOnlyField label="Product" value={product.length ? product.join(', ') : 'No products selected'} />
      </div>

      <div className="opportunity-details-group">Contact</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Contact Person" value={opp.contactPerson} />
        <ReadOnlyField label="Contact Phone" value={opp.contactPhone} />
      </div>

      {Array.isArray(opp.extractedFields) && opp.extractedFields.length > 0 && (
        <>
          <div className="opportunity-details-group">Accepted extracted lead data</div>
          <div className="opportunity-extracted-fields">
            {opp.extractedFields.map((field, index) => (
              <div className="opportunity-extracted-row" key={`${field.key}-${index}`}>
                <span>{field.key}</span>
                <b>{field.value}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {Array.isArray(opp.requestedItems) && opp.requestedItems.length > 0 && (
        <>
          <div className="opportunity-details-group">Requested items</div>
          <div className="opportunity-requested-items">
            {opp.requestedItems.map((item, index) => (
              <div className="opportunity-requested-row" key={`${item.description || item.partNumber || 'item'}-${index}`}>
                <span>{item.description || item.partNumber || 'Unspecified item'}</span>
                <b>{item.qty || 1} {item.uom || 'EA'}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

const OpportunityDetailsEditor = forwardRef(function OpportunityDetailsEditor({ opp, store, className = '', editable = true }, ref) {
  const [draft, setDraft] = useState(() => makeDraft(opp))
  const [dirty, setDirty] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const contactPersonRef = useRef(null)
  const contactPhoneRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focusField(field) {
      const target = field === 'contactPhone' ? contactPhoneRef.current : contactPersonRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus()
    },
  }), [])

  useEffect(() => {
    setDraft(makeDraft(opp))
    setDirty(false)
    setProductOpen(false)
    setSolutionOpen(false)
  }, [opp.id, opp.lastUpdated])

  const set = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }))
    setDirty(true)
  }

  const save = () => {
    const patch = Object.fromEntries(fields.map(key => [key, key === 'valueK' ? rupeesToK(draft[key]) : draft[key]]))
    store.updateOpportunity(opp.id, patch)
    setDirty(false)
  }

  const cancel = () => {
    setDraft(makeDraft(opp))
    setDirty(false)
  }

  const toggleProduct = product => {
    const next = draft.product.includes(product)
      ? draft.product.filter(value => value !== product)
      : [...draft.product, product]
    set('product', next)
  }

  const toggleSolution = solution => {
    const next = draft.solution.includes(solution)
      ? draft.solution.filter(value => value !== solution)
      : [...draft.solution, solution]
    set('solution', next)
  }

  const productSummary = draft.product.length === 0
    ? 'No products selected'
    : draft.product.length === 1
      ? draft.product[0]
      : `${draft.product.length} products selected`
  const solutionSummary = draft.solution.length === 0
    ? 'No solutions selected'
    : draft.solution.length === 1
      ? draft.solution[0]
      : `${draft.solution.length} solutions selected`

  if (!editable) return <OpportunityDetailsView opp={opp} className={className} />

  return (
    <section className={`opportunity-details-editor ${className}`}>
      <div className="opportunity-details-heading">
        <div>
          <div className="workbench-section-title">Opportunity details</div>
        </div>
        {dirty && <span className="opportunity-details-dirty">Unsaved changes</span>}
      </div>

      <div className="opportunity-details-group">Identity</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Opp ID"><div className="ro read-only-field">{opp.id} <span>(Sl {opp.sl})</span></div></Field>
        <Field label="Owner"><select value={draft.owner} onChange={e => set('owner', e.target.value)}>{OWNERS.map(x => <option key={x}>{displayRole(x)}</option>)}</select></Field>
        <Field label="RFQ Number"><input type="text" value={draft.rfqNumber} onChange={e => set('rfqNumber', e.target.value)} /></Field>
        <Field label="RFQ Date"><input type="date" value={draft.rfqDate} onChange={e => set('rfqDate', e.target.value)} /></Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Opportunity Name/Description</label>
          <input className="editable-field" type="text" value={draft.oppName} onChange={e => set('oppName', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Opportunity Scope</label>
          <textarea className="editable-field" rows={2} value={draft.opportunityScope} onChange={e => set('opportunityScope', e.target.value)} />
        </div>
      </div>

      <div className="opportunity-details-group">Customer</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Sell To Customer"><input type="text" value={draft.sellTo} onChange={e => set('sellTo', e.target.value)} /></Field>
        <Field label="Category"><select value={draft.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Location"><input type="text" value={draft.location} onChange={e => set('location', e.target.value)} /></Field>
        <Field label="Customer Status"><select value={draft.customerStatus} onChange={e => set('customerStatus', e.target.value)}>{CUSTOMER_STATUSES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="EUC Name"><input type="text" value={draft.eucName} onChange={e => set('eucName', e.target.value)} /></Field>
        <Field label="EUC Location"><input type="text" value={draft.eucLocation} onChange={e => set('eucLocation', e.target.value)} /></Field>
        <div className="opportunity-details-wide">
          <Field label="Additional customer information"><textarea rows={3} value={draft.additionalCustomerInformation} onChange={e => set('additionalCustomerInformation', e.target.value)} placeholder="Confirmed customer information that does not fit another field" /></Field>
        </div>
      </div>

      <div className="opportunity-details-group">Classification</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Opp Type"><select value={draft.oppType} onChange={e => set('oppType', e.target.value)}>{OPP_TYPES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="BU"><select value={draft.bu} onChange={e => set('bu', e.target.value)}>{BUS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Segment"><select value={draft.segment} onChange={e => set('segment', e.target.value)}>{SEGMENTS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Estimated Value (₹)"><input type="number" min="0" step="1" value={draft.valueK} onChange={e => set('valueK', e.target.value === '' ? '' : Number(e.target.value))} /></Field>
        {/* On the client's Field List but not a Sales Pipeline column, so it is
            captured here rather than on the tracker sheet. */}
        <Field label="Solution">
          <div className="compact-product-picker">
            <button
              type="button"
              className={`compact-product-trigger ${draft.solution.length ? 'has-selection' : ''}`}
              aria-expanded={solutionOpen}
              aria-haspopup="listbox"
              onClick={() => setSolutionOpen(open => !open)}
            >
              <span>{solutionSummary}</span><span className="compact-product-caret" aria-hidden="true">▾</span>
            </button>
            {solutionOpen && (
              <>
                <div className="filter-overlay" onClick={() => setSolutionOpen(false)} />
                <div className="compact-product-menu" role="listbox" aria-label="Solutions" aria-multiselectable="true" onClick={e => e.stopPropagation()}>
                  {SOLUTIONS.map(solution => (
                    <label key={solution} className="compact-product-option">
                      <input type="checkbox" checked={draft.solution.includes(solution)} onChange={() => toggleSolution(solution)} />
                      <span>{solution}</span>
                    </label>
                  ))}
                  <div className="compact-product-menu-actions">
                    <button type="button" className="ghost" onClick={() => set('solution', [])}>Clear</button>
                    <button type="button" onClick={() => setSolutionOpen(false)}>Done</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Field>
        <Field label="Probability"><select value={draft.prob} onChange={e => set('prob', e.target.value)}><option value="">—</option>{PROB_LEVELS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Product">
          <div className="compact-product-picker">
            <button
              type="button"
              className={`compact-product-trigger ${draft.product.length ? 'has-selection' : ''}`}
              aria-expanded={productOpen}
              aria-haspopup="listbox"
              onClick={() => setProductOpen(open => !open)}
            >
              <span>{productSummary}</span><span className="compact-product-caret" aria-hidden="true">▾</span>
            </button>
            {productOpen && (
              <>
                <div className="filter-overlay" onClick={() => setProductOpen(false)} />
                <div className="compact-product-menu" role="listbox" aria-label="Products" aria-multiselectable="true" onClick={e => e.stopPropagation()}>
                  {PRODUCTS.map(product => (
                    <label key={product} className="compact-product-option">
                      <input type="checkbox" checked={draft.product.includes(product)} onChange={() => toggleProduct(product)} />
                      <span>{product}</span>
                    </label>
                  ))}
                  <div className="compact-product-menu-actions">
                    <button type="button" className="ghost" onClick={() => set('product', [])}>Clear</button>
                    <button type="button" onClick={() => setProductOpen(false)}>Done</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Field>
      </div>

      <div className="opportunity-details-group">Contact</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Contact Person *"><input ref={contactPersonRef} type="text" value={draft.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Enter contact name" /></Field>
        <Field label="Contact Phone *"><input ref={contactPhoneRef} type="tel" value={draft.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="Enter contact phone" /></Field>
      </div>

      <div className="opportunity-details-actions">
        <button className="primary" disabled={!dirty} onClick={save}>Save changes</button>
        <button disabled={!dirty} onClick={cancel}>Cancel</button>
      </div>
    </section>
  )
})

export default OpportunityDetailsEditor
