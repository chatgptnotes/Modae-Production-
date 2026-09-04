import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CATEGORIES, CUSTOMER_STATUSES, OWNERS, OPP_TYPES, BUS, SEGMENTS, SOLUTIONS, PRODUCTS, PROB_LEVELS } from './seed.js'
import { displayRole, productList } from './utils.js'

const Field = ({ label, children }) => (
  <div><label>{label}</label>{children}</div>
)

const fields = [
  'owner', 'oppName', 'rfqNumber', 'rfqDate', 'valueK', 'sellTo', 'category', 'location', 'customerStatus',
  'eucName', 'eucLocation', 'oppType', 'bu', 'segment', 'solution', 'product', 'prob',
  'contactPerson', 'contactPhone',
]

const makeDraft = opp => ({
  owner: opp.owner || '', oppName: opp.oppName || '', sellTo: opp.sellTo || '',
  rfqNumber: opp.rfqNumber || '', rfqDate: opp.rfqDate || '', valueK: opp.valueK ?? '',
  category: opp.category || '', location: opp.location || '',
  customerStatus: opp.customerStatus || '', eucName: opp.eucName || '',
  eucLocation: opp.eucLocation || '', oppType: opp.oppType || '',
  bu: opp.bu || '', segment: opp.segment || '', solution: opp.solution || '',
  product: productList(opp.product), prob: opp.prob || '',
  contactPerson: opp.contactPerson || '', contactPhone: opp.contactPhone || '',
})

const OpportunityDetailsEditor = forwardRef(function OpportunityDetailsEditor({ opp, store, className = '' }, ref) {
  const [draft, setDraft] = useState(() => makeDraft(opp))
  const [dirty, setDirty] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
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
  }, [opp.id, opp.lastUpdated])

  const set = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }))
    setDirty(true)
  }

  const save = () => {
    const patch = Object.fromEntries(fields.map(key => [key, draft[key]]))
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

  const productSummary = draft.product.length === 0
    ? 'No products selected'
    : draft.product.length === 1
      ? draft.product[0]
      : `${draft.product.length} products selected`

  return (
    <section className={`opportunity-details-editor ${className}`}>
      <div className="opportunity-details-heading">
        <div>
          <div className="workbench-section-title">Opportunity details</div>
          <span className="hint">Edit the opportunity record. Changes are saved to this opportunity only.</span>
        </div>
        {dirty && <span className="opportunity-details-dirty">Unsaved changes</span>}
      </div>

      <div className="opportunity-details-group">Identity</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Opp ID"><div className="ro">{opp.id} (Sl {opp.sl})</div></Field>
        <Field label="Owner"><select value={draft.owner} onChange={e => set('owner', e.target.value)}>{OWNERS.map(x => <option key={x}>{displayRole(x)}</option>)}</select></Field>
        <Field label="RFQ Number"><input type="text" value={draft.rfqNumber} onChange={e => set('rfqNumber', e.target.value)} /></Field>
        <Field label="RFQ Date"><input type="date" value={draft.rfqDate} onChange={e => set('rfqDate', e.target.value)} /></Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Opportunity Name/Description</label>
          <input type="text" value={draft.oppName} onChange={e => set('oppName', e.target.value)} />
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
      </div>

      <div className="opportunity-details-group">Classification</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Opp Type"><select value={draft.oppType} onChange={e => set('oppType', e.target.value)}>{OPP_TYPES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="BU"><select value={draft.bu} onChange={e => set('bu', e.target.value)}>{BUS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Segment"><select value={draft.segment} onChange={e => set('segment', e.target.value)}>{SEGMENTS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Estimated Value (₹ K)"><input type="number" min="0" step="1" value={draft.valueK} onChange={e => set('valueK', e.target.value === '' ? '' : Number(e.target.value))} /></Field>
        {/* On the client's Field List but not a Sales Pipeline column, so it is
            captured here rather than on the tracker sheet. */}
        <Field label="Solution"><select value={draft.solution} onChange={e => set('solution', e.target.value)}><option value="">—</option>{SOLUTIONS.map(x => <option key={x}>{x}</option>)}</select></Field>
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
