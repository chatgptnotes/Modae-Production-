import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS } from '../seed.js'

const empty = {
  sellTo: '', category: '', location: '', eucName: '', eucLocation: '',
  oppName: '', owner: '', oppType: '', bu: '', segment: '', product: '',
  contactPerson: '', contactPhone: '', valueK: '',
}

export default function IntakeForm() {
  const store = useStore()
  const nav = useNavigate()
  const [f, setF] = useState(empty)
  const set = k => e => setF({ ...f, [k]: e.target.value })

  const knownCustomer = store.customers.find(c => c.name.toLowerCase() === f.sellTo.trim().toLowerCase())

  const required = ['sellTo', 'category', 'eucName', 'eucLocation', 'oppName', 'owner', 'oppType', 'bu', 'segment', 'product', 'contactPerson']
  const missing = required.filter(k => !f[k])

  const submit = e => {
    e.preventDefault()
    if (missing.length) return
    const today = new Date().toISOString().slice(0, 10)
    const id = nextOppId(store.opportunities, f.owner)
    const maxSl = Math.max(0, ...store.opportunities.map(o => o.sl || 0))
    // Two things happen on submit: the tracker row is added AND the
    // opportunity folder is created (same as the current manual process).
    store.addOpportunity({
      sl: maxSl + 1, id,
      sellTo: f.sellTo, category: f.category, location: f.location,
      customerStatus: knownCustomer ? knownCustomer.status : 'Green',
      eucName: f.eucName, eucLocation: f.eucLocation, oppName: f.oppName,
      owner: f.owner, oppType: f.oppType, bu: f.bu, segment: f.segment, product: f.product,
      valueK: +f.valueK || 0, cogsK: 0,
      createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
      status: 'Open', stage: 'Lead', closedReason: '',
      contactPerson: f.contactPerson, contactPhone: f.contactPhone,
      lastUpdated: today, forecast: false, remarks: '',
    })
    alert(`Opportunity ${id} created.\n\n1) Row added to the Sales Pipeline sheet\n2) Folder ${id} created with Customer Specs / PartnerDocs / Proposal`)
    nav(`/folders/${id}`)
  }

  const Radio = ({ field, options }) => (
    <div>
      {options.map(o => (
        <label className="radio-row" key={o}>
          <input type="radio" name={field} value={o} checked={f[field] === o}
            onChange={set(field)} /> {o}
        </label>
      ))}
    </div>
  )

  return (
    <div className="forms-bg">
      <form className="forms-card" onSubmit={submit}>
        <h1>New Sales Opportunity Intake 2026-2027</h1>
        <div className="forms-note">Use this form to register a new sales opportunity. When you submit this form, a pipeline row and an opportunity folder are created automatically.</div>
        <div className="req-note">* Required</div>

        <div className="q">
          <div className="q-label">1. Sell To Customer<span className="star">*</span></div>
          <input type="text" placeholder="Enter your answer" value={f.sellTo} onChange={set('sellTo')} list="customer-list" />
          <datalist id="customer-list">
            {store.customers.map(c => <option key={c.name} value={c.name} />)}
          </datalist>
          {f.sellTo && (
            <div className="hint" style={{ marginTop: 4 }}>
              {knownCustomer
                ? <>Existing customer — status <span className={`pill ${knownCustomer.status}`}>{knownCustomer.status}</span></>
                : <>New customer — will be flagged <span className="pill Blue">Blue</span> for admin verification</>}
            </div>
          )}
        </div>

        <div className="q">
          <div className="q-label">2. Category<span className="star">*</span></div>
          <select value={f.category} onChange={set('category')}>
            <option value="">Select your answer</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="q">
          <div className="q-label">3. Location</div>
          <input type="text" placeholder="Enter your answer" value={f.location} onChange={set('location')} />
        </div>

        <div className="q">
          <div className="q-label">4. EUC Name<span className="star">*</span></div>
          <input type="text" placeholder="Enter your answer" value={f.eucName} onChange={set('eucName')} />
        </div>

        <div className="q">
          <div className="q-label">5. EUC Location<span className="star">*</span></div>
          <input type="text" placeholder="Enter your answer" value={f.eucLocation} onChange={set('eucLocation')} />
        </div>

        <div className="q">
          <div className="q-label">6. Opportunity Name/Description<span className="star">*</span></div>
          <input type="text" placeholder="Enter your answer" value={f.oppName} onChange={set('oppName')} />
        </div>

        <div className="q">
          <div className="q-label">7. Owner<span className="star">*</span></div>
          <select value={f.owner} onChange={set('owner')}>
            <option value="">Select your answer</option>
            {OWNERS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="q">
          <div className="q-label">8. Opp Type<span className="star">*</span></div>
          <select value={f.oppType} onChange={set('oppType')}>
            <option value="">Select your answer</option>
            {OPP_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="q">
          <div className="q-label">9. BU<span className="star">*</span></div>
          <Radio field="bu" options={BUS} />
        </div>

        <div className="q">
          <div className="q-label">10. Segment<span className="star">*</span></div>
          <Radio field="segment" options={SEGMENTS} />
        </div>

        <div className="q">
          <div className="q-label">11. Product<span className="star">*</span></div>
          <Radio field="product" options={PRODUCTS} />
        </div>

        <div className="q">
          <div className="q-label">12. Contact Person<span className="star">*</span></div>
          <input type="text" placeholder="Enter your answer" value={f.contactPerson} onChange={set('contactPerson')} />
        </div>

        <div className="q">
          <div className="q-label">13. Contact Phone #</div>
          <input type="tel" placeholder="Enter your answer" value={f.contactPhone} onChange={set('contactPhone')} />
        </div>

        <div className="q">
          <div className="q-label">14. Estimated Value (K₹)</div>
          <input type="number" placeholder="Enter your answer" value={f.valueK} onChange={set('valueK')} />
        </div>

        <div className="forms-actions">
          <button type="submit" className="submit" disabled={missing.length > 0}
            title={missing.length ? `Missing: ${missing.join(', ')}` : ''}>
            Submit
          </button>
          <button type="button" onClick={() => setF(empty)}>Clear form</button>
        </div>
      </form>
    </div>
  )
}
