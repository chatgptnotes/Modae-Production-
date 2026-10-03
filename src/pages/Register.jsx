import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, nextOppId, reserveOppId } from '../store.jsx'
import { OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, SUBFOLDERS, routeForType, newProposal } from '../seed.js'
import { Icon } from '../icons.jsx'
import { ErrBox } from '../ui.jsx'
import { matchCustomer, customerStatusForLead } from './Inbox.jsx'
import { activeBackend, uploadOppFile, fmtSize } from '../filestore.js'
import { take } from '../leadFiles.js'
import { leadVerificationBlockers, verificationSnapshot, redClearanceFor, isRedCleared } from '../leadVerification.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { displayRole } from '../utils.js'
import { isInternalSender, isRegistrationCriticalField, routeOwnerForLocation } from '../leadRules.js'
import { leadFieldValue, splitBuSegment, leadIdentity } from '../leadFieldMapping.js'

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
  const suggested = regionalOwner || OWNERS[0]
  const typeV = fieldVal(fields, /opp type/i)
  const buSegment = splitBuSegment(fields)
  const allText = fields.map(f => f.v).join(' ') + ' ' + (lead?.subject || '')

  const [owner, setOwner] = useState(suggested)
  const [ownerOverrideReason, setOwnerOverrideReason] = useState('')
  const [oppType, setOppType] = useState(guessFromList(typeV, OPP_TYPES) || oppTypeSeed)
  const [bu, setBu] = useState(buSegment.bu || 'Energy')
  const [segment, setSegment] = useState(buSegment.segment || 'Others')
  const [product, setProduct] = useState(leadFieldValue(fields, 'product') || guessFromList(allText, PRODUCTS) || 'Various')
  const identitySeed = leadIdentity(lead, fields)
  const [identityDraft, setIdentityDraft] = useState(identitySeed)
  const [identitySaved, setIdentitySaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [uploadWarn, setUploadWarn] = useState('')
  const createRef = useRef(null)
  const autoCreateStarted = useRef(false)

  useEffect(() => {
    setIdentityDraft({
      ...leadIdentity(lead, lead?.ai?.fields || []),
    })
    setIdentitySaved(false)
  }, [lead?.id])

  // Qualified leads enter the opportunity flow directly. The form remains a
  // fallback for leads that still have a mandatory field or approval gate.
  useEffect(() => {
    if (lead?.status !== 'Qualified' || autoCreateStarted.current) return undefined
    autoCreateStarted.current = true
    const timer = setTimeout(() => createRef.current?.(), 0)
    return () => clearTimeout(timer)
  }, [lead?.id, lead?.status])

  if (!lead) {
    return (
      <div className="page">
        <h2>Registration</h2>
        <ErrBox>Lead not found.</ErrBox>
      </div>
    )
  }

  if (lead.status === 'Converted' && lead.oppId) {
    return (
      <div className="page">
        <h2><Icon name="clipboardCheck" size={18} /> Registration — {lead.subject}</h2>
        {uploadWarn && <ErrBox>{uploadWarn}</ErrBox>}
        <div className="okbox">
          Already registered as <b>{lead.oppId}</b>.{' '}
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
  const redApproval = redClearanceFor(store.approvals, lead.id, store.config)
  const redCleared = isRedCleared(redApproval, store.config)
  const pendingLow = fields.filter(f => f.state === 'pending' && f.conf < med && isRegistrationCriticalField(f.k))
  const deferredLow = fields.filter(f => f.state === 'pending' && f.conf < med && !isRegistrationCriticalField(f.k))
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
  const missingIdentity = [
    ['sellTo', 'Sell To Customer'], ['eucName', 'EUC Name'], ['eucLocation', 'EUC Location'],
    ['contactPerson', 'Contact Person'], ['contactPhone', 'Contact Phone'],
  ].filter(([key]) => !String(identityDraft[key] || '').trim()).map(([, label]) => label)

  const blockers = []
  if (lead.status !== 'Qualified') blockers.push('Lead is not Qualified yet — qualify it in the inbox first')
  pendingLow.forEach(f => blockers.push(`Low-confidence field unresolved: ${f.k} (${f.conf}%)`))
  missingIdentity.forEach(item => blockers.push(`${item} is required before registration`))
  verificationBlockers.forEach(item => blockers.push(item))
  const blocked = blockers.length > 0

  // The registration identity is the final location entered before the
  // permanent ID is minted. Re-route from it so a corrected city/state cannot
  // leave the opportunity under the previous lead suggestion.
  const creationRoutingRegion = identityDraft.eucLocation || routingRegion
  const creationRegionalOwner = routeOwnerForLocation(creationRoutingRegion, store.config, '')
  const creationOverride = creationRegionalOwner && owner !== creationRegionalOwner
  const creationOwner = creationOverride ? owner : (creationRegionalOwner || owner)
  const previewId = nextOppId(store.opportunities, creationOwner)
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
    if (blocked || missingIdentity.length || creating) return
    const isOverride = creationOverride
    if (isOverride && !['LJS', 'AH'].includes(store.role)) return
    if (isOverride && !ownerOverrideReason.trim()) return
    setCreating(true)
    const sellTo = String(identityDraft.sellTo || '').trim()
    const eucName = String(identityDraft.eucName || '').trim()
    const eucLocation = String(identityDraft.eucLocation || '').trim()
    const contactPerson = String(identityDraft.contactPerson || '').trim()
    const contactPhone = String(identityDraft.contactPhone || '').trim()
    store.updateLead(lead.id, { sellTo, eucName, eucLocation, contactPerson, contactPhone }, 'Registration identity details saved')
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
    const id = await reserveOppId(store.opportunities, creationOwner, store.config?.roleNames)
    const opp = {
      id,
      sourceLeadId: lead.id,
      sl: Math.max(0, ...store.opportunities.map(o => o.sl || 0)) + 1,
      sellTo, category, location, sellToCustomerLocation: location,
      customerStatus: leadCustomerStatus,
      leadVerification,
      eucName, eucLocation,
      oppName: lead.subject, opportunityScope: scope, owner: finalOwner, oppType, bu, segment, product,
      suggestedOwner: creationRegionalOwner || finalOwner,
      ownerOverrideReason: isOverride ? ownerOverrideReason.trim() : '',
      prob: 'Low', valueK: 0, cogsK: 0,
      rfqNumber, rfqDate,
      extractedFields: acceptedLeadFields(fields),
      requestedItems: extracted,
      createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
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
      contactEmail: isInternalSender(lead.from, store.config) ? '' : (lead.from || ''),
      lastUpdated: today, forecast: false,
      remarks: 'Registered from lead ' + lead.id,
      route: routeForType(oppType),
    }
    store.addOpportunity(opp)
    if (routeForType(oppType) !== 'Service') {
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
      setUploadWarn(`Cloud upload failed for ${failed.join(', ')} — recorded locally only. Opportunity ${opp.id} was created.`)
      return
    }
    nav('/opp/' + opp.id)
  }

  createRef.current = create

  return (
    <div className="page">
      <h2><Icon name="clipboardCheck" size={18} /> Registration — {lead.subject}</h2>
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
              {blocked ? '— withheld —' : previewId}
            </span>
          </p>
          <p className="hint">
            The opportunity ID is only generated once mandatory information and classification
            are resolved. It never changes, even after ownership transfer.
          </p>

          <div className="section-title" style={{ marginTop: 12 }}>Mandatory identity details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <label className="afield">Sell To Customer <span className="required-mark">*</span>
              <input value={identityDraft.sellTo} onChange={e => updateIdentity('sellTo', e.target.value)} placeholder="Enter customer name" />
            </label>
            <label className="afield">EUC Name <span className="required-mark">*</span>
              <input value={identityDraft.eucName} onChange={e => updateIdentity('eucName', e.target.value)} placeholder="Enter end user/customer name" />
            </label>
            <label className="afield">EUC Location <span className="required-mark">*</span>
              <input value={identityDraft.eucLocation} onChange={e => updateIdentity('eucLocation', e.target.value)} placeholder="Enter end user location" />
            </label>
            <label className="afield">Contact Person <span className="required-mark">*</span>
              <input value={identityDraft.contactPerson} onChange={e => updateIdentity('contactPerson', e.target.value)} placeholder="Enter contact person" />
            </label>
            <label className="afield">Contact Phone <span className="required-mark">*</span>
              <input type="tel" value={identityDraft.contactPhone} onChange={e => updateIdentity('contactPhone', e.target.value)} placeholder="Enter contact phone" />
            </label>
          </div>
          {missingIdentity.length > 0 && <div className="warnbox" style={{ marginTop: 8 }}>Complete: {missingIdentity.join(', ')}.</div>}
          <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
            <button type="button" onClick={saveIdentity} disabled={identitySaved}>Save details</button>
            {identitySaved && <span className="lead-decision-saved">Saved just now</span>}
          </div>

          <label className="afield" style={{ display: 'block', marginTop: 10 }}>
            Owner
            <select value={owner} onChange={e => setOwner(e.target.value)} style={{ display: 'block', marginTop: 2 }}>
              {OWNERS.map(o => <option key={o}>{o}</option>)}
            </select>
          </label>
          <p className="hint">
            System suggested: <b>{regionalOwner || suggested}</b> — regional ownership rule.
            LJS/AH may override with a mandatory reason.
          </p>
          {regionalOwner && owner !== regionalOwner && (
            <label className="afield" style={{ display: 'block', marginTop: 6 }}>
              Owner override reason
              <textarea rows={2} value={ownerOverrideReason} onChange={e => setOwnerOverrideReason(e.target.value)} placeholder="Required for an LJS/AH override" />
            </label>
          )}

          <div className="section-title" style={{ marginTop: 12 }}>Pipeline metadata</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <label className="afield">Opportunity type
              <select value={oppType} onChange={e => setOppType(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }}>
                {OPP_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="afield">Business unit
              <select value={bu} onChange={e => setBu(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }}>
                {BUS.map(b => <option key={b}>{b}</option>)}
              </select>
            </label>
            <label className="afield">Segment
              <select value={segment} onChange={e => setSegment(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }}>
                {SEGMENTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="afield">Equipment / Product Family
              <select value={product} onChange={e => setProduct(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }}>
                {PRODUCTS.map(p => <option key={p} value={p}>{p === 'Various' ? 'Multiple equipment items' : p}</option>)}
              </select>
            </label>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Proposal route: <b>{routeForType(oppType)}</b> — set from the opportunity type.
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
          {!blocked && leadCustomerStatus !== 'Green' && (
            <div className="okbox" style={{ marginTop: 8 }}>
              {leadCustomerStatus === 'Blue' ? 'KYC verified at Lead stage.' : 'Payment confirmed at Lead stage.'}
              {' '}Opportunity creation will use this confirmation; no second verification is required.
            </div>
          )}
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="primary" disabled={blocked || creating}
              title={blocked ? 'Blocked — resolve the items above' : undefined}
              onClick={create}>
              <Icon name="check" size={13} /> {creating ? 'Creating…' : 'Create opportunity'}
            </button>
          </div>
        </div>

        <div className="form-card" style={{ flex: '1 1 300px' }}>
          <div className="section-title">System actions (automatic)</div>
          <p className="hint">
            Run on creation. SharePoint is live when configured; CRM and Teams are simulated in this prototype.
          </p>
          <div className="check-row">
            <Icon name="folder" size={14} />
            <span>
              SharePoint folder <b>/Opportunities/Open/{blocked ? '…' : previewId}/</b> with{' '}
              {SUBFOLDERS.length} subfolders ({SUBFOLDERS.join(' · ')})
              <br /><span className="hint">Backend: {backend}{backend === 'sharepoint' ? ' — live' : ' — SharePoint not configured, stored locally'}</span>
            </span>
          </div>
          <div className="check-row">
            <Icon name="cloud" size={14} />
            <span>
              CRM registration — account + opportunity record, taxonomy mapped 1:1
              <br /><span className="hint">Simulated</span>
            </span>
          </div>
          <div className="check-row">
            <Icon name="send" size={14} />
            <span>
              Teams notification to <b>#modae-pipeline</b> — new opportunity registered, owner {displayRole(owner)}
              <br /><span className="hint">Simulated</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
