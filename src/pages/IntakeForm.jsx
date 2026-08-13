import React, { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, ROLES } from '../seed.js'

const empty = {
  sellTo: '', category: '', location: '', eucName: '', eucLocation: '',
  oppName: '', owner: '', oppType: '', bu: '', segment: '', product: '',
  contactPerson: '', contactPhone: '', valueK: '',
}

export default function IntakeForm() {
  const store = useStore()
  const nav = useNavigate()
  // The Lead Inbox pre-fills the form via router state ("Qualify" action).
  const loc = useLocation()
  const [f, setF] = useState(() => ({
    ...empty,
    ...(loc.state?.prefill || {}),
    // Role-based auto-assignment: sales reps are assigned as owner by default
    // Admin/System Owner roles can choose any owner
    owner: (loc.state?.prefill || {}).owner || (OWNERS.includes(store.role) ? store.role : '')
  }))
  const [touched, setTouched] = useState({})
  const set = k => e => {
    setF({ ...f, [k]: e.target.value })
    if (!touched[k]) setTouched({ ...touched, [k]: true })
  }

  const knownCustomer = store.customers.find(c => c.name.toLowerCase() === f.sellTo.trim().toLowerCase())

  const required = ['sellTo', 'category', 'eucName', 'eucLocation', 'oppName', 'owner', 'oppType', 'bu', 'segment', 'product', 'contactPerson', 'contactPhone']

  // Calculate validation status in real-time
  const validation = useMemo(() => {
    const missing = required.filter(k => !f[k])
    const filled = required.length - missing.length
    return {
      missing,
      filled,
      total: required.length,
      isComplete: missing.length === 0,
      fields: required.reduce((acc, field) => {
        acc[field] = {
          valid: !!f[field],
          touched: touched[field],
          error: touched[field] && !f[field] ? 'required' : ''
        }
        return acc
      }, {})
    }
  }, [f, touched, required])

  const submit = e => {
    e.preventDefault()
    if (!validation.isComplete) return
    const today = new Date().toISOString().slice(0, 10)
    const id = nextOppId(store.opportunities, f.owner)
    const maxSl = Math.max(0, ...store.opportunities.map(o => o.sl || 0))
    // Two things happen on submit: the tracker row is added AND the
    // opportunity folder is created (same as the current manual process).
    const sellTo = f.sellTo.trim()
    if (!knownCustomer) {
      store.addCustomer({ name: sellTo, category: f.category, status: 'Blue', kyc: 'Pending', payment: '—' })
    }
    store.addOpportunity({
      sl: maxSl + 1, id,
      sellTo, category: f.category, location: f.location,
      customerStatus: knownCustomer ? knownCustomer.status : 'Blue',
      eucName: f.eucName, eucLocation: f.eucLocation, oppName: f.oppName,
      owner: f.owner, oppType: f.oppType, bu: f.bu, segment: f.segment, product: f.product,
      // prob is salesperson-set later — the form does not collect it (audio 00:24)
      prob: '',
      valueK: +f.valueK || 0, cogsK: 0,
      createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
      status: 'Open', stage: 'Lead', closedReason: '',
      contactPerson: f.contactPerson, contactPhone: f.contactPhone,
      lastUpdated: today, forecast: false, remarks: '',
    })
    // A lead qualified from the inbox converts only on actual submit.
    if (loc.state?.leadId) store.updateLead(loc.state.leadId, { status: 'Qualified', oppId: id })
    alert(`Opportunity ${id} created.\n\n1) Row added to the Sales Pipeline sheet\n2) Folder ${id} created with Customer Specs / Partner Docs / Proposal`)
    nav(`/folders/${id}`)
  }

  const resetForm = () => {
    setF(empty)
    setTouched({})
  }

  // Compact dropdown for all select fields
  const Select = ({ field, options, placeholder }) => (
    <select
      value={f[field]}
      onChange={set(field)}
      className={validation.fields[field]?.touched && !validation.fields[field]?.valid ? 'error' : ''}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  )

  // Pill/bubble selection for Classification fields
  const Pills = ({ field, options }) => (
    <div className="pill-group">
      {options.map(o => (
        <label key={o} className={`pill-opt ${f[field] === o ? 'on' : ''}`}>
          <input type="radio" name={field} value={o} checked={f[field] === o} onChange={set(field)} />
          {o}
        </label>
      ))}
    </div>
  )

  const Input = ({ field, type = 'text', placeholder, list }) => (
    <input
      type={type}
      placeholder={placeholder}
      value={f[field]}
      onChange={set(field)}
      list={list}
      className={validation.fields[field]?.touched && !validation.fields[field]?.valid ? 'error' : ''}
    />
  )

  return (
    <div className="forms-bg">
      <form className="forms-card wide" onSubmit={submit}>
        <div className="forms-head">
          <div>
            <h1>Create Opportunity</h1>
            <div className="forms-note">Register a new sales opportunity — complete every field below in one screen. Submitting creates a pipeline row and an opportunity folder.</div>
            <div className="forms-note">Have a tender / RFQ PDF? <Link to="/tender">Let AI extract it for you ▸</Link></div>
          </div>
          <div className="req-note">
            <span className="star">*</span> required ·{' '}
            {validation.isComplete
              ? <span className="ok">✓ All {validation.total} required fields complete</span>
              : <span>{validation.missing.length} of {validation.total} required fields missing</span>}
          </div>
        </div>

        <div className="forms-grid">
          {/* ---- Group 1 — Customer Info (Fields 1-5) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Customer Info</div>

            <div className="q">
              <div className="q-label">1. Sell To Customer<span className="star">*</span></div>
              <Input field="sellTo" placeholder="Enter customer name" list="customer-list" />
              <datalist id="customer-list">
                {store.customers.map(c => <option key={c.name} value={c.name} />)}
              </datalist>
              {f.sellTo && (
                <div className="hint" style={{ marginTop: 2 }}>
                  {knownCustomer
                    ? <>Existing customer — status <span className={`pill ${knownCustomer.status}`}>{knownCustomer.status}</span></>
                    : <>New customer — will be flagged <span className="pill Blue">Blue</span> for admin verification</>}
                </div>
              )}
            </div>

            <div className="q">
              <div className="q-label">2. Category<span className="star">*</span></div>
              <Select field="category" options={CATEGORIES} placeholder="Select category" />
            </div>

            <div className="q">
              <div className="q-label">3. Location</div>
              <Input field="location" placeholder="Enter location" />
            </div>

            <div className="q">
              <div className="q-label">4. EUC Name<span className="star">*</span></div>
              <Input field="eucName" placeholder="Enter end user/customer name" />
            </div>

            <div className="q">
              <div className="q-label">5. EUC Location<span className="star">*</span></div>
              <Input field="eucLocation" placeholder="Enter end user location" />
            </div>
          </div>

          {/* ---- Group 2 — Opportunity Details (Fields 6-11) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Opportunity Details</div>

            <div className="q">
              <div className="q-label">6. Opportunity Name / Description<span className="star">*</span></div>
              <Input field="oppName" placeholder="Enter opportunity description" />
            </div>

            <div className="q">
              <div className="q-label">7. Owner<span className="star">*</span></div>
              <Select field="owner" options={OWNERS} placeholder="Select owner" />
              <div className="hint" style={{ marginTop: 2 }}>
                {OWNERS.includes(store.role) && f.owner === store.role && (
                  <>Auto-filled as {store.role} (your role)</>
                )}
              </div>
            </div>

            <div className="q">
              <div className="q-label">8. Opp Type<span className="star">*</span></div>
              <Select field="oppType" options={OPP_TYPES} placeholder="Select opportunity type" />
            </div>

            <div className="q">
              <div className="q-label">9. Estimated Value (K₹)</div>
              <Input field="valueK" type="number" placeholder="Enter estimated value" />
            </div>

            <div className="q">
              <div className="q-label">10. Contact Person<span className="star">*</span></div>
              <Input field="contactPerson" placeholder="Enter contact name" />
            </div>

            <div className="q">
              <div className="q-label">11. Contact Phone #<span className="star">*</span></div>
              <Input field="contactPhone" type="tel" placeholder="Enter contact phone" />
            </div>
          </div>

          {/* ---- Group 3 — Classification (Fields 12-14) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Classification</div>

            <div className="q">
              <div className="q-label">12. BU<span className="star">*</span></div>
              <Pills field="bu" options={BUS} />
            </div>

            <div className="q">
              <div className="q-label">13. Segment<span className="star">*</span></div>
              <Pills field="segment" options={SEGMENTS} />
            </div>

            <div className="q">
              <div className="q-label">14. Product<span className="star">*</span></div>
              <Pills field="product" options={PRODUCTS} />
            </div>

            {/* Progress indicator */}
            <div className="q" style={{ marginTop: 'auto' }}>
              <div className="progress-indicator">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(validation.filled / validation.total) * 100}%` }}
                  />
                </div>
                <div className="progress-text">
                  {validation.filled} of {validation.total} fields complete
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="forms-actions">
          <button type="button" onClick={resetForm} className="secondary">Clear Form</button>
          <button type="submit" className="submit" disabled={!validation.isComplete} style={{ marginLeft: '8px' }}
            title={validation.isComplete ? 'Create Opportunity' : `Missing: ${validation.missing.join(', ')}`}>
            Create Opportunity
          </button>
        </div>
      </form>
    </div>
  )
}
