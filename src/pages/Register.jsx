import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, SUBFOLDERS, routeForType, ownerForOppType, newProposal } from '../seed.js'
import { Icon } from '../icons.jsx'
import { ErrBox } from '../ui.jsx'
import { matchCustomer, customerStatusForLead } from './Inbox.jsx'
import { activeBackend, uploadOppFile, fmtSize } from '../filestore.js'
import { take } from '../leadFiles.js'
import { leadVerificationBlockers, verificationSnapshot, redClearanceFor, isRedCleared } from '../leadVerification.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { displayRole } from '../utils.js'

// Registration — the moment a qualified lead becomes an opportunity and the
// permanent opportunity ID is minted (YYMM + sequence + owner initials).
// The ID is withheld while anything mandatory is unresolved.

const fieldVal = (fields, re) => {
  const f = fields.find(x => re.test(x.k) && x.state !== 'rejected')
  return f ? f.v : ''
}

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
  const ownerFieldV = fields.find(f => /owner/i.test(f.k) && f.state === 'accepted')?.v || ''
  const oppTypeSeed = OPP_TYPES.includes(lead?.oppType)
    ? lead.oppType
    : (lead?.route === 'Service' ? 'Service' : lead?.route === 'Project' ? 'Project' : 'Spares')
  const suggested = guessFromList(ownerFieldV, OWNERS) || lead?.suggestedOwner || ownerForOppType(oppTypeSeed, store.config)
  const typeV = fieldVal(fields, /opp type/i)
  const buSegV = fieldVal(fields, /bu|segment/i)
  const allText = fields.map(f => f.v).join(' ') + ' ' + (lead?.subject || '')

  const [owner, setOwner] = useState(suggested)
  const [oppType, setOppType] = useState(guessFromList(typeV, OPP_TYPES) || oppTypeSeed)
  const [bu, setBu] = useState(guessFromList(buSegV, BUS) || 'Energy')
  const [segment, setSegment] = useState(guessFromList(buSegV, SEGMENTS) || 'Others')
  const [product, setProduct] = useState(guessFromList(allText, PRODUCTS) || 'Various')
  const [creating, setCreating] = useState(false)
  const [uploadWarn, setUploadWarn] = useState('')

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
  const pendingLow = fields.filter(f => f.state === 'pending' && f.conf < med)
  // Red clears on the joint approval now. The same blocker used to be raised
  // here *and* unconditionally inside leadVerificationBlockers; that second
  // copy read no approvals, so it could never clear and an approved Red lead
  // could never be registered.
  const verificationBlockers = leadVerificationBlockers(lead, leadCustomerStatus, { redCleared, config: store.config })
  // Opportunity scope is useful context but is not required to register a
  // lead; the opportunity can be structured and scoped later in the workbench.
  const missingInfo = (lead?.ai?.missing || []).filter(item => !/opportunity\s+scope/i.test(String(item)))
  const identity = {
    sellTo: identityValue(lead, fields, 'sellTo', /sell-to/i),
    eucName: identityValue(lead, fields, 'eucName', /euc\s*name/i),
    eucLocation: identityValue(lead, fields, 'eucLocation', /euc\s*location/i),
    contactPerson: identityValue(lead, fields, 'contactPerson', /contact\s*person|contact/i),
    contactPhone: identityValue(lead, fields, 'contactPhone', /contact\s*phone|phone/i),
  }
  const missingIdentity = [
    ['sellTo', 'Sell To Customer'], ['eucName', 'EUC Name'], ['eucLocation', 'EUC Location'],
    ['contactPerson', 'Contact Person'], ['contactPhone', 'Contact Phone'],
  ].filter(([key]) => !identity[key]).map(([, label]) => label)

  const blockers = []
  if (lead.status !== 'Qualified') blockers.push('Lead is not Qualified yet — qualify it in the inbox first')
  pendingLow.forEach(f => blockers.push(`Low-confidence field unresolved: ${f.k} (${f.conf}%)`))
  missingInfo.forEach(item => blockers.push(`Missing information: ${item}`))
  missingIdentity.forEach(item => blockers.push(`${item} is required before registration`))
  verificationBlockers.forEach(item => blockers.push(item))
  const blocked = blockers.length > 0

  const previewId = nextOppId(store.opportunities, owner)
  const backend = activeBackend()
  const today = new Date().toISOString().slice(0, 10)

  const create = async () => {
    if (missingIdentity.length) return
    setCreating(true)
    const sellTo = identity.sellTo
    const eucName = identity.eucName
    const eucLocation = identity.eucLocation
    const contactPerson = identity.contactPerson
    const contactPhone = identity.contactPhone
    const catV = fieldVal(fields, /category/i)
    const category = guessFromList(catV, ['EUC', 'EPC', 'OEM', 'ACP', 'SI', 'RE/TR']) || '—'
    const location = fieldVal(fields, /location|region/i) || lead.location || lead.region || ''
    const opp = {
      id: previewId,
      sourceLeadId: lead.id,
      sl: Math.max(0, ...store.opportunities.map(o => o.sl || 0)) + 1,
      sellTo, category, location,
      customerStatus: leadCustomerStatus,
      leadVerification: verificationSnapshot(lead, leadCustomerStatus, { approval: redApproval, config: store.config }),
      eucName, eucLocation,
      oppName: lead.subject, owner, oppType, bu, segment, product,
      prob: 'Low', valueK: 0, cogsK: 0,
      createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
      status: 'Open', stage: 'Lead', milestone: 'Screening', closedReason: '',
      contactPerson, contactPhone,
      // The address the enquiry came from is the address the proposal goes back
      // to — carried here so Email Proposal resolves a recipient by itself.
      contactEmail: lead.from || '',
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
        rfqNumber: lead.ref || '',
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
      store.addCustomer({ name: sellTo, category, status: leadCustomerStatus, kyc: 'Pending', payment: '—' })
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

          <label className="afield" style={{ display: 'block', marginTop: 10 }}>
            Owner
            <select value={owner} onChange={e => setOwner(e.target.value)} style={{ display: 'block', marginTop: 2 }}>
              {OWNERS.map(o => <option key={o}>{o}</option>)}
            </select>
          </label>
          <p className="hint">
            Suggested: <b>{lead.suggestedOwner || suggested}</b> — regional ownership rule.
            LJS/AH may override with a mandatory reason.
          </p>

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
            <label className="afield">Product
              <select value={product} onChange={e => setProduct(e.target.value)} style={{ display: 'block', marginTop: 2, width: '100%' }}>
                {PRODUCTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Proposal route: <b>{routeForType(oppType)}</b> — set from the opportunity type.
          </p>

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
