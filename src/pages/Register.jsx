import { parseProbabilityPct } from '../opportunityProbability.js'
import { fiscalQuarter } from '../excelLogic.js'
import { registrationFields } from '../businessRules.js'
import { useFieldLists } from '../useFieldLists.js'
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, nextOppId, reserveOppId } from '../store.jsx'
import { displayOpportunityId, SUBFOLDERS, routeForType, newProposal } from '../seed.js'

import { Icon } from '../icons.jsx'
import { ErrBox } from '../ui.jsx'
import { matchCustomer, customerStatusForLead } from './Inbox.jsx'
import { activeBackend, uploadOppFile, fmtSize } from '../filestore.js'
import { take } from '../leadFiles.js'
import { leadVerificationBlockers, verificationSnapshot, redClearanceFor, isRedCleared } from '../leadVerification.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { displayRole } from '../utils.js'
import { isInternalSender, isRegistrationCriticalField, routeOwnerForLocation } from '../leadRules.js'
import { leadFieldValue, splitBuSegment, leadIdentity, leadRegistrationContext, existingLeadOpportunity } from '../leadFieldMapping.js'
import CustomerPicker from '../CustomerPicker.jsx'

// Registration — the moment a qualified lead becomes an opportunity and the
// permanent opportunity ID is minted (YYMM + three-digit sequence).
// The ID is withheld while anything mandatory is unresolved.

const fieldVal = (fields, re) => {
  const f = fields.find(x => re.test(x.k) && x.state !== 'rejected')
  return f ? f.v : ''
}

const acceptedLeadFields = fields => (fields || [])
  .filter(field => field?.state === 'accepted' && String(field.v ?? '').trim())
  .map(field => ({
    key: field.k,
    value: String(field.v).trim(),
    confidence: field.conf,
    evidence: field.ev || '',
    note: field.note || '',
  }))

const guessFromList = (text, list) =>
  list.find(x => text.toLowerCase().includes(x.toLowerCase())) || ''

const identityValue = (lead, fields, key, pattern) =>
  String(lead?.[key] || fieldVal(fields, pattern) || lead?.parse?.[key] || '').trim()

export default function Register() {
  const { OPP_TYPES, OWNERS, PRODUCTS, BUS, SEGMENTS, labelFor } = useFieldLists()

  const store = useStore()
  const nav = useNavigate()
  const { leadId } = useParams()
  const lead = store.leads.find(l => l.id === leadId)

  const ai = lead?.ai
  const fields = ai?.fields || []
  const med = store.config.aiThresholds?.med ?? 75

  // Prefills derived from the AI extraction.
  const oppTypeSeed = OPP_TYPES.includes(lead?.oppType)
    ? lead.oppType
    : (lead?.route === 'Service' ? 'Service' : lead?.route === 'Project' ? 'Project' : 'Spares')
  const routingRegion = lead?.region || lead?.location || fieldVal(fields, /location|region/i)
  const regionalOwner = routeOwnerForLocation(routingRegion, store.config, '')
  const suggested = lead?.assignedOwner || lead?.owner || regionalOwner || 'LJS'
  const typeV = fieldVal(fields, /opp type/i)
  const buSegment = splitBuSegment(fields)
  const allText = fields.map(f => f.v).join(' ') + ' ' + (lead?.subject || '')

  const [owner, setOwner] = useState(suggested)
  const [ownerOverrideReason, setOwnerOverrideReason] = useState('')
  const [oppType, setOppType] = useState(lead?.oppType || guessFromList(typeV, OPP_TYPES) || oppTypeSeed)
  const [bu, setBu] = useState(lead?.bu || buSegment.bu || '')
  const [segment, setSegment] = useState(lead?.segment || buSegment.segment || '')
  const [product, setProduct] = useState(leadFieldValue(fields, 'product') || guessFromList(allText, PRODUCTS) || '')
  const identitySeed = leadIdentity(lead, fields)
  const [identityDraft, setIdentityDraft] = useState(identitySeed)
  const [details, setDetails] = useState({source:lead?.source || '', oppName:lead?.subject || '', contactEmail:lead?.contactEmail ?? lead?.from ?? '', notes:lead?.notes || '', opportunityScope:lead?.opportunityScope || lead?.body || ''})
  const [prob, setProb] = useState(lead?.prob || 'Low')
  const [probabilityPct, setProbabilityPct] = useState(lead?.probabilityPct == null ? '' : String(lead.probabilityPct))
  const [orderDate, setOrderDate] = useState(lead?.orderDate || '')
  const [forecastError, setForecastError] = useState('')
  const [identitySaved, setIdentitySaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const submitLock = useRef(false)
  const [uploadWarn, setUploadWarn] = useState('')
  const createRef = useRef(null)
  const autoCreateStarted = useRef(false)

  useEffect(() => {
    setIdentityDraft({
      ...leadIdentity(lead, lead?.ai?.fields || []),
      sellToCustomerLocation: lead?.sellToCustomerLocation || matchCustomer(store.customers, lead)?.location || '',
    })
    setIdentitySaved(false)
  }, [lead?.id])


  if (!lead) {
    return (
      <div className="page lead-registration-page">
        <h2>Registration</h2>
        <ErrBox>Lead not found.</ErrBox>
      </div>
    )
  }

  if (lead.status === 'Converted' && lead.oppId) {
    return (
      <div className="page lead-registration-page">
        <h2><Icon name="clipboardCheck" size={18} /> Registration — {lead.subject}</h2>
      {uploadWarn && <ErrBox>{uploadWarn}</ErrBox>}
        {uploadWarn && <><ErrBox>{uploadWarn}</ErrBox><button onClick={async () => {
          const saved = await store.flushPersistence([{entity:'opportunities',id:lead.oppId},{entity:'proposals',id:lead.oppId},{entity:'leads',id:lead.id}])
          const supporting = saved && await store.saveOtherWorkspaceChanges()
          if (supporting) {setUploadWarn('');nav('/opp/' + lead.oppId)}
        }}>Retry saving supporting details</button></>}
        <div className="okbox">
          Already registered as <b>{displayOpportunityId(lead.oppId)}</b>.{' '}
          <button className="primary" onClick={() => nav('/opp/' + lead.oppId)}>Open opportunity</button>
        </div>
      </div>
    )
  }

  const customer = matchCustomer(store.customers, lead)
  // One resolution chain, shared with the inbox — the inline copy here used to
  // drop the `redFlag ? 'Red' : 'Blue'` fallback, so a red-flagged lead with no
  // master match silently registered as Blue.
  const leadCustomerStatus = customerStatusForLead(lead, store.customers)
  const redApproval = redClearanceFor(store.approvals, lead.id, store.config, leadCustomerStatus)
  const redCleared = isRedCleared(redApproval, store.config, leadCustomerStatus)
  const pendingLow = fields.filter(f => f.state === 'pending' && f.conf < med && isRegistrationCriticalField(f.k, store.config))
  const deferredLow = fields.filter(f => f.state === 'pending' && f.conf < med && !isRegistrationCriticalField(f.k, store.config))
  // Red clears on the joint approval now. The same blocker used to be raised
  // here *and* unconditionally inside leadVerificationBlockers; that second
  // copy read no approvals, so it could never clear and an approved Red lead
  // could never be registered.
  const existingCustomerKyc = customer?.kyc === 'Valid'
  const verificationDeferred = !existingCustomerKyc && leadCustomerStatus === 'Blue' && lead.verification?.kycRequestStatus === 'deferred'
  const verificationBlockers = verificationDeferred
    ? []
    : leadVerificationBlockers({ ...lead, existingCustomerKyc }, leadCustomerStatus, { redCleared, config: store.config })
  // Opportunity scope is useful context but is not required to register a
  // lead; the opportunity can be structured and scoped later in the workbench.
  // AI-missing fields are follow-up information, not registration gates. The
  // salesperson can complete customer/commercial details from the Opportunity
  // Customer/KYC tab after the permanent opportunity ID is created.
  const missingInfo = [
    ...(lead?.ai?.missing || []).filter(item => !/opportunity\s+scope/i.test(String(item))),
    ...deferredLow.map(field => `Confirm ${field.k}`),
  ]
  const registrationRequired = new Set(registrationFields(store.config).map(([key]) => key))
  const missingIdentity = registrationFields(store.config).filter(([key]) => !String(identityDraft[key] || '').trim()).map(([, label]) => label)

  const blockers = []
  if (lead.status !== 'Qualified') blockers.push('Lead is not Qualified yet — qualify it in the inbox first')

  missingIdentity.forEach(item => blockers.push(`${item} is required before registration`))
  verificationBlockers.forEach(item => blockers.push(item))
  const blocked = blockers.length > 0

  // The registration identity is the final location entered before the
  // permanent ID is minted. Re-route from it so a corrected city/state cannot
  // leave the opportunity under the previous lead suggestion.
  const creationRoutingRegion = identityDraft.sellToCustomerLocation || identityDraft.eucLocation || routingRegion
  const creationRegionalOwner = routeOwnerForLocation(creationRoutingRegion, store.config, '')
  const creationOverride = creationRegionalOwner && owner !== creationRegionalOwner
  const creationOwner = owner || creationRegionalOwner || 'LJS'
  const previewId = nextOppId(store.opportunities, creationOwner, store.config?.opportunityNumbering)
  const backend = activeBackend()
  const today = new Date().toISOString().slice(0, 10)

  const updateIdentity = (key, value) => {
    setIdentityDraft(previous => ({ ...previous, [key]: value }))
    setIdentitySaved(false)
  }

  const saveIdentity = () => {
    const patch = Object.fromEntries(Object.entries(identityDraft).map(([key, value]) => [key, String(value || '').trim()]))
    store.updateLead(lead.id, patch, 'Registration identity details saved')
    setIdentityDraft(patch)
    setIdentitySaved(true)
  }

  const create = async () => {
    if (blocked || missingIdentity.length || creating || store.canPerform?.('opportunities.create') === false || store.canPerform?.('leads.edit') === false) return
    let parsedProbability
    try {
      parsedProbability = parseProbabilityPct(probabilityPct)
      if (orderDate && !fiscalQuarter(orderDate)) throw new Error('Enter a valid expected order date.')
      setForecastError('')
    } catch (error) { setForecastError(error.message); return }
    const existing = existingLeadOpportunity(store.opportunities, lead)
    if (existing) { nav('/opp/' + existing.id); return }
    const isOverride = creationOverride
    if (submitLock.current) return
    submitLock.current = true
    setCreating(true)
    const sellTo = String(identityDraft.sellTo || '').trim()
    const sellToCustomerLocation = String(identityDraft.sellToCustomerLocation || '').trim()
    const eucName = String(identityDraft.eucName || '').trim()
    const eucLocation = String(identityDraft.eucLocation || '').trim()
    const contactPerson = String(identityDraft.contactPerson || '').trim()
    const contactPhone = String(identityDraft.contactPhone || '').trim()
    store.updateLead(lead.id, { sellTo, sellToCustomerLocation, eucName, eucLocation, contactPerson, contactPhone }, 'Registration identity details saved')
    const catV = fieldVal(fields, /category/i)
    const category = guessFromList(catV, ['EUC', 'EPC', 'OEM', 'ACP', 'SI', 'RE/TR']) || lead.category || customer?.category || '—'
    const location = identityDraft.eucLocation || fieldVal(fields, /euc\s+location|site\s+location|location/i) || lead.location || lead.region || ''
    const rfqNumber = String(
      lead.ref || lead.rfqNumber || fieldVal(fields, /(?:rfq|tender|enquiry)\s*(?:number|no\.?|reference|ref)/i) || '',
    ).trim()
    const rfqDate = String(
      lead.rfqDate || fieldVal(fields, /(?:rfq|tender|enquiry)\s*date/i) || '',
    ).trim()
    const scope = String(lead.opportunityScope || leadFieldValue(fields, 'scope') || '').trim()
    const { extracted } = buildLeadProposalData(lead, store.priceLists, store.adhocParts)
    const leadVerification = verificationSnapshot({ ...lead, existingCustomerKyc }, leadCustomerStatus, { approval: redApproval, config: store.config })
    const finalOwner = isOverride ? owner : creationOwner
    let id
    try { id = await reserveOppId(store.opportunities, creationOwner, store.config?.roleNames, store.config?.opportunityNumbering) }
    catch (error) { submitLock.current = false; setCreating(false); window.alert(error.message); return }
    const opp = {
      id, ...leadRegistrationContext(lead),
      source: details.source, notes: details.notes,
      sl: Math.max(0, ...(store.workspaceNavigation?.opportunities || store.opportunities).map(o => o.sl || 0)) + 1,
      sellTo, category, location, sellToCustomerLocation,
      customerStatus: leadCustomerStatus,
      leadVerification,
      eucName, eucLocation,
      oppName: details.oppName, opportunityScope: details.opportunityScope, owner: finalOwner, oppType, bu, segment, product,
      suggestedOwner: creationRegionalOwner || finalOwner,
      ownerOverrideReason: isOverride ? ownerOverrideReason.trim() : '',
      prob, probabilityPct: parsedProbability, valueK: 0, cogsK: 0,
      rfqNumber, rfqDate,
      extractedFields: acceptedLeadFields(fields),
      requestedItems: extracted,
      createDate: today, proposalDate: '', orderDate, invoiceDate: '',
      status: 'Open', stage: 'Lead', milestone: 'Screening', closedReason: '',
      contactPerson, contactPhone,
      // Commercial/customer master details may be completed after registration
      // from the Opportunity Customer/KYC workspace.
      billingAddress: customer?.billingAddress || lead.billingAddress || '',
      shippingAddress: customer?.shippingAddress || lead.shippingAddress || '',
      shippingPincode: customer?.shippingPincode || lead.shippingPincode || '',
      gstin: customer?.gstin || lead.gstin || '',
      // The address the enquiry came from is the address the proposal goes back
      // to — carried here so Email Proposal resolves a recipient by itself.
      // contactEmail: lead.from || '' is the customer-source value; internal
      // ModAE senders are filtered before it reaches the opportunity.
      contactEmail: details.contactEmail,
      lastUpdated: today, forecast: false,
      remarks: details.notes,
      route: routeForType(oppType, store.config),
    }
    let conversion
    try {
      if (!await store.flushPersistence([{entity:'leads',id:lead.id}])) throw new Error('Save the lead before registering. Review conflicts or retry.')
      conversion = await store.convertLead(lead.id, opp)
    } catch (error) { submitLock.current=false;setCreating(false);setUploadWarn(error.message);return }
    if (conversion.existing) {nav('/opp/' + conversion.opportunity.id);return}

    if (routeForType(oppType, store.config) !== 'Service') {
      const { extracted, workbenchRows, bom } = buildLeadProposalData(lead, store.priceLists, store.adhocParts)
      store.addSparesLinesFromLead(opp.id, workbenchRows)
      const proposal = newProposal(opp.id, opp, { validityDays: store.config?.proposalValidityDays })
      store.saveProposal(opp.id, {
        ...proposal,
        rfqNumber,
        subject: lead.subject || proposal.subject,
        project: lead.subject || proposal.project,
        kindAttn: contactPerson || proposal.kindAttn,
        units: 1,
        ...(bom.length ? { leadImportId: lead.id } : {}),
        // Carry every extracted request into the visible BoQ immediately.
        // Unmatched rows remain unpriced and therefore continue to block
        // readiness until the workbench resolves them.
        bom,
        extractedItems: extracted,
      })
    }
    // Stamp the new opp id onto lead-linked approvals (AP-1) so the Red-class
    // clearance and its conditions follow the opportunity into the workbench.
    store.linkLeadApprovals(lead.id, opp.id)
    if (!customer) {
      store.addCustomer({
        name: sellTo, category, status: leadCustomerStatus, kyc: leadVerification.status === 'Verified' ? 'Valid' : 'Pending', payment: '—',
        billingAddress: opp.billingAddress, shippingAddress: opp.shippingAddress,
        shippingPincode: opp.shippingPincode, gstin: opp.gstin,
      })
    }
    store.updateLead(lead.id, { status: 'Converted', oppId: opp.id })

    // The enquiry's own attachments land in Customer Specs, like a tender does.
    // Blobs persist in IndexedDB (see leadFiles.js), so this survives a reload;
    // if storage was unavailable the lead still keeps its attachment rows.
    const failed = []
    // Inline intake attachments remain downloadable without a cloud integration.
    for (const attachment of lead.attachments || []) {
      if (attachment.dataUrl) store.addFile(opp.id, 'Customer Specs', { ...attachment, date: today, webUrl: attachment.dataUrl })
    }
    for (const file of await take(lead.id)) {
      try {
        store.addFile(opp.id, 'Customer Specs', await uploadOppFile(opp, 'Customer Specs', file))
      } catch (e) {
        store.addFile(opp.id, 'Customer Specs', { name: file.name, date: today, size: fmtSize(file.size) })
        failed.push(file.name)
      }
    }
    setCreating(false)
    if (failed.length) {
      setUploadWarn(`Cloud upload failed for ${failed.join(', ')} — recorded locally only. Opportunity ${displayOpportunityId(opp.id)} was created.`)
      return
    }
    if (!await store.flushPersistence([{entity:'opportunities',id:opp.id},{entity:'proposals',id:opp.id},{entity:'leads',id:lead.id}])) {
      setUploadWarn('Opportunity created, but supporting details have unsaved changes. Retry saving before leaving.');return
    }
    if (store.saveOtherWorkspaceChanges && !await store.saveOtherWorkspaceChanges()) {
      setUploadWarn('Opportunity created, but attachments or customer details could not be saved. Retry saving before leaving.');return
    }
    nav('/opp/' + opp.id)
  }

  createRef.current = create

  return (
    <div className="page lead-registration-page">
      <h2><Icon name="clipboardCheck" size={18} /> Registration — {lead.subject}</h2>
      {uploadWarn && <ErrBox>{uploadWarn}</ErrBox>}
      <p className="hint" style={{ marginTop: -4 }}>
        Lead {lead.ref || lead.id} · {lead.sender || lead.from}
      </p>
      <div className="toolbar">
        <button onClick={() => nav('/inbox/' + lead.id)}><Icon name="inbox" size={13} /> Back to lead</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <div className="form-card" style={{ flex: '2 1 380px' }}>
          <div className="section-title">Identity &amp; ownership</div>
          <p style={{ margin: '6px 0 2px' }}>Generated ID (preview):{' '}
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>
              {blocked ? '— withheld —' : `${previewId} (provisional)`}
            </span>
          </p>
          <p className="hint">
            The opportunity ID is only generated once the company is entered and you submit the form. It never changes, even after ownership transfer.
          </p>

          <div className="section-title" style={{ marginTop: 12 }}>Opportunity details</div>
          <div className="registration-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <label className="afield">Sell To Customer {registrationRequired.has('sellTo') && <span className="required-mark">*</span>}
              <CustomerPicker customers={store.customers} value={identityDraft.sellTo} onChange={value => updateIdentity('sellTo', value)} allowCreate={false} label="" />
            </label>
            <label className="afield">Sell To Customer Location {registrationRequired.has('sellToCustomerLocation') && <span className="required-mark">*</span>}
              <input type="text" value={identityDraft.sellToCustomerLocation || ''} onChange={e => updateIdentity('sellToCustomerLocation', e.target.value)} placeholder="Enter customer location" name="register-enter-customer-location" />
            </label>
            <label className="afield">EUC Name {registrationRequired.has('eucName') && <span className="required-mark">*</span>}
              <CustomerPicker customers={store.customers} value={identityDraft.eucName} onChange={value => updateIdentity('eucName', value)} allowCreate={false} label="" />
            </label>
            <label className="afield">EUC Location {registrationRequired.has('eucLocation') && <span className="required-mark">*</span>}
              <input type="text" value={identityDraft.eucLocation} onChange={e => updateIdentity('eucLocation', e.target.value)} placeholder="Enter end user location" name="register-euc-location" />
            </label>
            <label className="afield">Contact Person {registrationRequired.has('contactPerson') && <span className="required-mark">*</span>}
              <input type="text" value={identityDraft.contactPerson} onChange={e => updateIdentity('contactPerson', e.target.value)} placeholder="Enter contact person" name="register-contact-person" />
            </label>
            <label className="afield">Contact Phone {registrationRequired.has('contactPhone') && <span className="required-mark">*</span>}
              <input type="tel" value={identityDraft.contactPhone} onChange={e => updateIdentity('contactPhone', e.target.value)} placeholder="Enter contact phone" name="register-contact-phone" />
            </label>
          </div>
          <div className="registration-fields" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>{[['source','Source'],['oppName','Opportunity name'],['contactEmail','Contact email'],['notes','Notes'],['opportunityScope','Scope / enquiry details']].map(([key,label]) => <label className="afield" key={key}>{label}<textarea name={`register-${key}`} value={details[key]} onChange={e => setDetails(previous => ({...previous,[key]:e.target.value}))} rows={2} /></label>)}</div>
          <p className="hint">Attachments: {(lead.attachments || []).map(file => file.name).join(', ') || 'None'}</p>
          {missingIdentity.length > 0 && <div className="warnbox" style={{ marginTop: 8 }}>Complete: {missingIdentity.join(', ')}.</div>}
          <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
            <button type="button" onClick={saveIdentity} disabled={identitySaved || store.canPerform?.('leads.edit') === false}>Save details</button>
            {identitySaved && <span className="lead-decision-saved">Saved just now</span>}
          </div>

          <label className="afield" style={{ display: 'block', marginTop: 10 }}>
            Owner
            <select value={owner} onChange={e => setOwner(e.target.value)} style={{ display: 'block', marginTop: 2 }} name="register-owner">
              {OWNERS.map(o => <option key={o} value={o}>{labelFor('owner', o)}</option>)}
            </select>
          </label>
          <p className="hint">
            System suggested: <b>{regionalOwner || suggested}</b> — regional ownership rule.
            The selected owner is used for registration.
          </p>


          <div className="section-title" style={{ marginTop: 12 }}>Pipeline metadata</div>
          <div className="registration-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <label className="afield">Opportunity type
              <select value={oppType} onChange={e => setOppType(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }} name="register-opp-type">
                <option value="">Unspecified</option>
                {OPP_TYPES.map(t => <option key={t} value={t}>{labelFor('oppType', t)}</option>)}
              </select>
            </label>
            <label className="afield">Business unit
              <select value={bu} onChange={e => setBu(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }} name="register-bu">
                <option value="">Unspecified</option>
                {BUS.map(b => <option key={b} value={b}>{labelFor('bu', b)}</option>)}
              </select>
            </label>
            <label className="afield">Segment
              <select value={segment} onChange={e => setSegment(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }} name="register-segment">
                <option value="">Unspecified</option>
                {SEGMENTS.map(s => <option key={s} value={s}>{labelFor('segment', s)}</option>)}
              </select>
            </label>
            <label className="afield">Equipment / Product Family
              <select value={product} onChange={e => setProduct(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }} name="register-product">
                <option value="">Unspecified</option>
                {PRODUCTS.map(p => <option key={p} value={p}>{p === 'Various' ? 'Multiple equipment items' : p}</option>)}
              </select>
            </label>
          </div>
          <div className="section-title" style={{ marginTop: 12 }}>Forecast details (optional)</div>
          <div className="registration-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <label className="afield">Probability band
              <select value={prob} onChange={e => setProb(e.target.value)} name="register-prob"><option value="">Unspecified</option>{['High', 'Medium', 'Low'].map(band => <option key={band} value={band}>{band}</option>)}</select>
            </label>
            <label className="afield">Win probability (%)
              <input type="number" min="0" max="100" step="any" value={probabilityPct} onChange={e => { setProbabilityPct(e.target.value); setForecastError('') }} placeholder="Optional" name="register-probability-pct" />
            </label>
            <label className="afield">Expected order date
              <input type="date" value={orderDate} onChange={e => { setOrderDate(e.target.value); setForecastError('') }} name="register-order-date" />
            </label>
            <label className="afield">Fiscal quarter / year
              <input readOnly value={fiscalQuarter(orderDate)} placeholder="—" name="register-fiscal-quarter" />
            </label>
          </div>
          {forecastError && <p className="warnbox" role="alert">{forecastError}</p>}
          <p className="hint" style={{ marginTop: 6 }}>
            Proposal route: <b>{routeForType(oppType, store.config)}</b> — set from the opportunity type.
          </p>

          {missingInfo.length > 0 && (
            <div className="warnbox" style={{ marginTop: 8 }}>
              <b>Follow-up information</b> — these details can be completed later in the Opportunity:
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {missingInfo.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          {blocked && (
            <ErrBox>
              <b>Create opportunity is blocked</b> until:
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </ErrBox>
          )}
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="primary" disabled={blocked || creating || store.canPerform?.('opportunities.create') === false || store.canPerform?.('leads.edit') === false}
              title={blocked ? 'Blocked — resolve the items above' : undefined}
              onClick={create}>
              <Icon name="check" size={13} /> {creating ? 'Creating…' : 'Create opportunity'}
            </button>
          </div>
        </div>


      </div>
    </div>
  )
}
