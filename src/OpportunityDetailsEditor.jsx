import { changedOpportunityFields, validateOpportunityEdit } from './opportunityEdits.js'
import { useFieldLists } from './useFieldLists.js'
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { displayOpportunityId } from './seed.js'

import { isAdminRole, canPriceProposal, canViewCommercial, displayRole, productList, solutionLabel, solutionList, rupeesToK } from './utils.js'
import { fiscalQuarter } from './excelLogic.js'
import CustomerPicker from './CustomerPicker.jsx'

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
  'owner', 'oppName', 'opportunityScope', 'rfqNumber', 'rfqDate', 'valueK', 'sellTo', 'category', 'location', 'cogsK', 'forecast', 'remarks',
  'eucName', 'eucLocation', 'oppType', 'bu', 'segment', 'solution', 'product', 'prob',
  'contactPerson', 'contactPhone', 'contactEmail', 'sellToCustomerLocation',
  'orderDate', 'invoiceDate', 'deliveryDate', 'offerDate',
  'additionalCustomerInformation', 'commercialNotes', 'paymentTerms', 'deliveryTerms', 'incoterms',
]

const makeDraft = opp => ({
  owner: opp.owner || '', oppName: opp.oppName || '', opportunityScope: opp.opportunityScope || '', sellTo: opp.sellTo || '',
  rfqNumber: opp.rfqNumber || '', rfqDate: opp.rfqDate || '', valueK: opp.valueK == null ? '' : opp.valueK * 1000,
  cogsK: opp.cogsK == null ? '' : opp.cogsK * 1000, forecast: !!opp.forecast, remarks: opp.remarks || '',
  category: opp.category || '', location: opp.location || '',
  customerStatus: opp.customerStatus || '', eucName: opp.eucName || '',
  eucLocation: opp.eucLocation || '', oppType: opp.oppType || '',
  bu: opp.bu || '', segment: opp.segment || '', solution: solutionList(opp.solution),
  product: productList(opp.product), prob: opp.prob || '',
  contactPerson: opp.contactPerson || '', contactPhone: opp.contactPhone || '',
  contactEmail: opp.contactEmail || '', sellToCustomerLocation: opp.sellToCustomerLocation || opp.location || '',
  additionalCustomerInformation: opp.additionalCustomerInformation || '',
  orderDate: opp.orderDate || '', invoiceDate: opp.invoiceDate || '', deliveryDate: opp.deliveryDate || '', offerDate: opp.offerDate || '',
  commercialNotes: opp.commercialNotes || '', paymentTerms: opp.paymentTerms || '',
  deliveryTerms: opp.deliveryTerms || '', incoterms: opp.incoterms || '',
})

export function OpportunityDetailsView({ opp, className = '', showValue = true }) {
  const product = productList(opp.product)
  return (
    <section className={`opportunity-details-editor opportunity-details-view ${className}`}>
      <div className="opportunity-details-heading">
        <div className="workbench-section-title">Opportunity details</div>
      </div>

      <div className="opportunity-details-group">Identity</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Opp ID" value={`${displayOpportunityId(opp.id)} (Sl ${opp.sl})`} />
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
        <ReadOnlyField label="Sell To Customer Location" value={opp.sellToCustomerLocation || opp.location} />
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
        {showValue && <ReadOnlyField label="Estimated Value (₹)" value={opp.valueK == null ? '—' : `₹ ${Number(opp.valueK * 1000).toLocaleString('en-IN')}`} />}
        <ReadOnlyField label="Solution" value={solutionLabel(opp.solution)} />
        <ReadOnlyField label="Probability" value={opp.prob} />
        <ReadOnlyField label="Product" value={product.length ? product.join(', ') : 'No products selected'} />
      </div>

      <div className="opportunity-details-group">Dates and historical reference</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Opp. Ref. ID" value={opp.legacyOppRefId} />
        <ReadOnlyField label="Offer Date" value={opp.offerDate} />
        <ReadOnlyField label="EOD / Order Date" value={opp.orderDate} />
        <ReadOnlyField label="EDD/ADD / Delivery Date" value={opp.deliveryDate} />
        <ReadOnlyField label="Invoice Date" value={opp.invoiceDate} />
        <ReadOnlyField label="FQ-FY" value={fiscalQuarter(opp.orderDate)} />
      </div>

      <div className="opportunity-details-group">Contact</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Contact Person" value={opp.contactPerson} />
        <ReadOnlyField label="Contact Phone" value={opp.contactPhone} />
        <ReadOnlyField label="Contact Email" value={opp.contactEmail} />
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
  const { OWNERS, CATEGORIES, OPP_TYPES, BUS, SEGMENTS, SOLUTIONS, PROB_LEVELS, PRODUCTS, labelFor } = useFieldLists(opp)

  const [draft, setDraft] = useState(() => makeDraft(opp))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const baseline = useRef(makeDraft(opp))
  const recordId = useRef(opp.id)
  const formRef = useRef(null)
  const canEdit = editable && store.canPerform?.('opportunities.edit') !== false && (opp.owner === store.role || isAdminRole(store.role))
  const showValue = canPriceProposal(store.role)
  const showCost = showValue || canViewCommercial(store.role)
  const canTransfer = isAdminRole(store.role) || store.canPerform?.('commercial.view') === true
  const [productOpen, setProductOpen] = useState(false)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const contactPersonRef = useRef(null)
  const contactPhoneRef = useRef(null)

  useImperativeHandle(ref, () => ({
    confirmDiscard() {
      if (!dirty) return true
      if (!window.confirm('Discard unsaved opportunity changes?')) return false
      cancel()
      return true
    },
    focusField(field) {
      const target = field === 'contactPhone' ? contactPhoneRef.current : contactPersonRef.current
      if (!target?.isConnected) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (target.isConnected) target.focus()
    },
  }))

  useEffect(() => {
    if (recordId.current === opp.id && dirty) return
    recordId.current = opp.id
    baseline.current = makeDraft(opp)
    setDraft(baseline.current)
    setDirty(false)
    setError('')
    setProductOpen(false)
    setSolutionOpen(false)
  }, [opp, dirty])

  useEffect(() => {
    if (!dirty) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }))
    setDirty(true)
    setError('')
  }

  const save = () => {
    if (!canEdit) return
    const invalid = formRef.current?.querySelector(':invalid')
    if (invalid) { invalid.reportValidity(); return }
    try {
      const latest = store.opportunities?.find(row => row.id === opp.id) || opp
      const normalizedDraft = { ...draft }
      for (const key of ['valueK', 'cogsK']) {
        validateOpportunityEdit(key, normalizedDraft[key])
        if (normalizedDraft[key] !== '') normalizedDraft[key] = Number(normalizedDraft[key])
      }
      const changed = changedOpportunityFields(baseline.current, normalizedDraft, makeDraft(latest))
      const patch = {}
      for (const key of fields) {
        if (!(key in changed)) continue
        if (key === 'owner' && !canTransfer) continue
        if (key === 'valueK' && !showValue || key === 'cogsK' && !showCost) continue
        validateOpportunityEdit(key, changed[key])
        patch[key] = ['valueK', 'cogsK'].includes(key) ? (changed[key] === '' ? null : rupeesToK(changed[key])) : changed[key]
      }
      if (Object.keys(patch).length) store.updateOpportunity(opp.id, patch)
      baseline.current = normalizedDraft
      setDirty(false)
      setError('')
    } catch (err) { setError(err.message || 'Unable to save these changes.') }
  }

  const cancel = () => {
    baseline.current = makeDraft(opp)
    setDraft(baseline.current)
    setDirty(false)
    setError('')
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

  if (!canEdit) return <OpportunityDetailsView opp={opp} className={className} showValue={showValue} />

  return (
    <section ref={formRef} className={`opportunity-details-editor ${className}`}>
      <div className="opportunity-details-heading">
        <div>
          <div className="workbench-section-title">Opportunity details</div>
        </div>
        {dirty && <span className="opportunity-details-dirty">Unsaved changes</span>}
      </div>

      <div className="opportunity-details-group">Identity</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Opp ID"><div className="ro read-only-field">{displayOpportunityId(opp.id)} <span>(Sl {opp.sl})</span></div></Field>
        <Field label="Owner"><select disabled={!canTransfer} title={!canTransfer ? "Ownership transfers require management permission" : undefined} value={draft.owner} onChange={e => set('owner', e.target.value)}>{OWNERS.map(x => <option key={x} value={x}>{labelFor('owner', x)}</option>)}</select></Field>
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
        <CustomerPicker
          customers={store.customers}
          value={draft.sellTo}
          onChange={value => set('sellTo', value)}
          onCreate={name => {
            const customer = { name, category: draft.category || 'EUC', status: 'Blue', kyc: 'Pending', payment: '—' }
            store.addCustomer(customer)
            return customer
          }}
          label="Sell To Customer"
        />
        <Field label="Category"><select value={draft.category} onChange={e => set('category', e.target.value)}>{[...new Set([CATEGORIES.includes(draft.category) ? null : draft.category, ...CATEGORIES])].filter(Boolean).map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Sell To Customer Location"><input type="text" value={draft.sellToCustomerLocation} onChange={e => { set('sellToCustomerLocation', e.target.value); set('location', e.target.value) }} /></Field>
        <ReadOnlyField label="Customer Status · managed in Customer master" value={store.customers?.find(c => c.name === draft.sellTo)?.status || opp.customerStatus} />
        <CustomerPicker customers={store.customers} value={draft.eucName} onChange={value => set('eucName', value)} allowCreate={false} label="EUC Name" />
        <Field label="EUC Location"><input type="text" value={draft.eucLocation} onChange={e => set('eucLocation', e.target.value)} /></Field>
        <div className="opportunity-details-wide">
          <Field label="Additional customer information"><textarea rows={3} value={draft.additionalCustomerInformation} onChange={e => set('additionalCustomerInformation', e.target.value)} placeholder="Confirmed customer information that does not fit another field" /></Field>
        </div>
      </div>

      <div className="opportunity-details-group">Classification</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Opp Type"><select value={draft.oppType} onChange={e => set('oppType', e.target.value)}>{[...new Set([OPP_TYPES.includes(draft.oppType) ? null : draft.oppType, ...OPP_TYPES])].filter(Boolean).map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="BU"><select value={draft.bu} onChange={e => set('bu', e.target.value)}>{[...new Set([BUS.includes(draft.bu) ? null : draft.bu, ...BUS])].filter(Boolean).map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Segment"><select value={draft.segment} onChange={e => set('segment', e.target.value)}>{SEGMENTS.map(x => <option key={x} value={x}>{labelFor('segment', x)}</option>)}</select></Field>
        {showValue && <Field label="Estimated Value (₹)"><input type="number" min="0" step="any" value={draft.valueK} onChange={e => set('valueK', e.target.value)} /></Field>}
        {showCost && <Field label="COGS (₹)"><input type="number" min="0" step="any" value={draft.cogsK} onChange={e => set('cogsK', e.target.value)} /></Field>}
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
        <Field label="Probability"><select value={draft.prob} onChange={e => set('prob', e.target.value)}><option value="">—</option>{PROB_LEVELS.map(x => <option key={x} value={x}>{labelFor('prob', x)}</option>)}</select></Field>
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

      <div className="opportunity-details-group">Dates and historical reference</div>
      <div className="dgrid2 opportunity-details-grid">
        <ReadOnlyField label="Opp. Ref. ID" value={opp.legacyOppRefId} />
        <Field label="Offer Date"><input type="date" value={draft.offerDate} onChange={e => set('offerDate', e.target.value)} /></Field>
        <Field label="EOD / Order Date"><input type="date" value={draft.orderDate} onChange={e => set('orderDate', e.target.value)} /></Field>
        <Field label="EDD/ADD / Delivery Date"><input type="date" value={draft.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} /></Field>
        <Field label="Invoice Date"><input type="date" value={draft.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></Field>
        <ReadOnlyField label="FQ-FY" value={fiscalQuarter(draft.orderDate)} />
      </div>

      <div className="opportunity-details-group">Contact</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Contact Person *"><input ref={contactPersonRef} type="text" value={draft.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Enter contact name" /></Field>
        <Field label="Contact Phone *"><input ref={contactPhoneRef} type="tel" value={draft.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="Enter contact phone" /></Field>
        <Field label="Contact Email"><input type="email" value={draft.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="customer@example.com" /></Field>
      </div>

      <div className="opportunity-details-group">Commercial information</div>
      <div className="dgrid2 opportunity-details-grid">
        <Field label="Payment terms"><input value={draft.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} /></Field>
        <Field label="Delivery terms"><input value={draft.deliveryTerms} onChange={e => set('deliveryTerms', e.target.value)} /></Field>
        <Field label="Incoterms"><input value={draft.incoterms} onChange={e => set('incoterms', e.target.value)} /></Field>
        <div className="opportunity-details-wide"><Field label="Commercial notes"><textarea rows={3} value={draft.commercialNotes} onChange={e => set('commercialNotes', e.target.value)} /></Field></div>
      </div>

      <Field label="Forecast"><input type="checkbox" checked={draft.forecast} onChange={e => set('forecast', e.target.checked)} /></Field>
      <Field label="Remarks"><textarea rows={3} value={draft.remarks} onChange={e => set('remarks', e.target.value)} /></Field>
      {error && <p role="alert" className="warnbox">{error}</p>}
      <div className="opportunity-details-actions">
        <button className="primary" disabled={!dirty} onClick={save}>Save changes</button>
        <button disabled={!dirty} onClick={cancel}>Cancel</button>
      </div>
    </section>
  )
})

export default OpportunityDetailsEditor
