import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from './store.jsx'
import {
  SUBFOLDERS,
} from './seed.js'
import { fmt, fmtRupeesFromK, mmmYY, ddMmmYY, canViewCommercial, canPriceProposal, productList, solutionLabel } from './utils.js'
import { nextActionWith } from './gates.js'
import { Icon } from './icons.jsx'
import { Chip, ClassChip } from './ui.jsx'
import { OpportunityDetailsView } from './OpportunityDetailsEditor.jsx'
import DetailTabs from './DetailTabs.jsx'

// The record form is a tab of its own rather than a footer under every folder:
// three of the four folders are usually empty, so a shared footer left every
// tab looking identical and the folder tabs read as decoration.
const DETAILS_TAB = 'Details'
// Lost drawer edits must use store.closeLost(oppId, reason), never save a Lost stage directly.

const Field = ({ label, children }) => (
  <div><label>{label}</label>{children}</div>
)

const SyncPill = ({ sync }) => {
  if (!sync || !sync.state) return null
  const tone = sync.state === 'synced' ? 'conf-hi' : sync.state === 'error' ? 'conf-lo' : 'grey'
  const title = sync.state === 'synced' ? 'Folder synced to SharePoint'
    : sync.state === 'error' ? `SharePoint sync error: ${sync.error || sync.message || 'unknown'}`
    : 'Local only — not yet synced to SharePoint'
  return <span className={`chip ${tone}`} title={title}>SP</span>
}

export default function OppPanel({ oppId }) {
  const store = useStore()
  const nav = useNavigate()

  const opp = store.opportunities.find(o => o.id === oppId)
  const files = store.files?.[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
  const subNames = Object.keys(files)
  const tabItems = [
    { id: DETAILS_TAB, label: DETAILS_TAB },
    ...subNames.map(name => ({
      id: name,
      label: name,
      // Core folders describe the opportunity even before a file is uploaded;
      // optional folders stay hidden until they contain active content.
      show: ['Customer Specs', 'Partner Docs', 'KYC'].includes(name)
        || name === 'Proposal' && (!!store.proposals?.[oppId] || !!files[name]?.length)
        || !!files[name]?.length,
    })),
  ]

  const [tab, setTab] = useState(DETAILS_TAB)
  useEffect(() => {
    setTab(DETAILS_TAB)
  }, [oppId])
  // useEffect(() => { setTab(DETAILS_TAB) }, [oppId])

  if (!opp) return <div className="drawer-body"><p className="hint">This opportunity no longer exists.</p></div>

  // A custom subfolder can be deleted (on the Folders page) while its tab is active.
  const activeTab = tabItems.some(item => item.show !== false && item.id === tab) ? tab : DETAILS_TAB
  const isDetails = activeTab === DETAILS_TAB
  // Sales owners need cost and margin while building their proposals;
  // org-wide commercial reports remain protected by canViewCommercial.
  const comm = canViewCommercial(store.role) || canPriceProposal(store.role)
  const showValue = canPriceProposal(store.role)
  const na = nextActionWith(opp, store.getProposal(oppId), store)
  const gmK = (opp.valueK || 0) - (opp.cogsK || 0)
  const gmPct = opp.valueK ? Math.round((gmK / opp.valueK) * 100) + '%' : '—'

  const tabFiles = files[activeTab] || []
  const proposal = activeTab === 'Proposal' ? store.getProposal(oppId) : null
  const comms = (store.communications || {})[oppId] || []

  return (
    <div className="drawer-body">
      <DetailTabs ariaLabel="Opportunity files" activeId={activeTab} items={tabItems} onChange={setTab} />

      {!isDetails && (
        <div className="drawer-files">
          <div className="drawer-files-bar">
            <span className="hint">{oppId} › {activeTab}</span>
            <SyncPill sync={(store.spSync || {})[oppId]} />
          </div>
          <table className="sheet">
            <thead><tr><th>Name</th><th>Date</th><th>Size</th></tr></thead>
            <tbody>
              {activeTab === 'Proposal' && !tabFiles.some(fl => fl.name.endsWith('.xlsx')) && (
                <tr className="rowclick" onClick={() => nav(`/proposal/${oppId}`)} title="Open the proposal workbook">
                  <td><Icon name="fileSheet" size={13} /> <b>{oppId} Proposal Workbook.xlsx</b></td>
                  <td>{opp.lastUpdated}</td><td>247 KB</td>
                </tr>
              )}
              {tabFiles.map(fl => {
                const isWorkbook = activeTab === 'Proposal' && fl.name.endsWith('.xlsx')
                const href = fl.webUrl || fl.url
                return (
                  <tr key={fl.name} className={isWorkbook ? 'rowclick' : ''}
                    onClick={isWorkbook ? () => nav(`/proposal/${oppId}`) : undefined}
                    title={isWorkbook ? 'Open the proposal workbook' : fl.webUrl ? 'Opens in SharePoint' : undefined}>
                    <td>
                      <Icon name={isWorkbook ? 'fileSheet' : 'fileText'} size={13} />{' '}
                      {isWorkbook ? <b>{fl.name}</b>
                        : href ? <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{fl.name}</a>
                        : fl.name}
                    </td>
                    <td>{fl.date}</td><td>{fl.size}</td>
                  </tr>
                )
              })}
              {!tabFiles.length && activeTab !== 'Proposal' && (
                <tr><td colSpan={3} className="hint">This folder is empty.</td></tr>
              )}
            </tbody>
          </table>

          {activeTab === 'Proposal' && (
            <div className="drawer-propsum">
              <div className="dgrid2">
                <div><label>Revision</label><div className="ro">{proposal.revision} · {proposal.bidStage} · {proposal.bidType}</div></div>
                <div><label>BoQ lines</label><div className="ro">{(proposal.bom || []).length}</div></div>
                {showValue && <div><label>Value (₹)</label><div className="ro">{fmtRupeesFromK(opp.valueK)}</div></div>}
                {comm ? (
                  <>
                    <div><label>COGS (₹)</label><div className="ro">{fmtRupeesFromK(opp.cogsK)}</div></div>
                    <div><label>GM</label><div className="ro">{fmtRupeesFromK(gmK)} · {gmPct}</div></div>
                  </>
                ) : (
                  <div style={{ gridColumn: '1 / -1' }} className="restricted"><Icon name="lock" size={13} /> Cost and margin — approvers/admin only</div>
                )}
              </div>
              {comms.length > 0 && (
                <>
                  <div className="fgroup">Communications</div>
                  <table className="sheet comms-log">
                    <thead><tr><th>When</th><th>To</th><th>Subject</th></tr></thead>
                    <tbody>
                      {comms.map((c, i) => (
                        <tr key={i}>
                          <td>{ddMmmYY(c.ts.slice(0, 10))}</td><td>{c.to}</td><td title={c.subject}>{c.subject}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Each folder answers a different question, so each carries its own
          context below the file list. A custom subfolder gets the list only. */}
      {activeTab === 'Customer Specs' && <SpecsPanel opp={opp} store={store} />}
      {activeTab === 'Partner Docs' && <PartnerPanel opp={opp} store={store} nav={nav} />}
      {activeTab === 'KYC' && <KycPanel opp={opp} store={store} nav={nav} />}

      {isDetails && (
        <div className="drawer-form">
          <OpportunityDetailsView opp={opp} />

          <div className="fgroup">Commercial</div>
          {showValue ? (
            <div className="dgrid2">
              <Field label="Value (₹)"><div className="ro">{opp.valueK ? fmtRupeesFromK(opp.valueK) : '—'}</div></Field>
              {comm && <Field label="COGS (₹)"><div className="ro">{opp.cogsK ? fmtRupeesFromK(opp.cogsK) : '—'}</div></Field>}
              {comm && <Field label="GM (₹)"><div className="ro">{opp.valueK ? fmtRupeesFromK(gmK) : '-'}</div></Field>}
              {comm && <Field label="GM%"><div className="ro">{gmPct}</div></Field>}
              <Field label="Forecast"><div className="ro">{opp.forecast ? 'Included for roll-up' : 'Not included'}</div></Field>
              {!comm && <div style={{ gridColumn: '1 / -1' }} className="restricted"><Icon name="lock" size={13} /> Cost and margin — approvers/admin only</div>}
            </div>
          ) : (
            <div className="restricted"><Icon name="lock" size={13} /> Commercial data — approvers/admin only</div>
          )}

          <div className="fgroup">Dates</div>
          <div className="dgrid2">
            <Field label="Create Date"><div className="ro">{mmmYY(opp.createDate)}</div></Field>
            <Field label="Proposal Date"><div className="ro">{mmmYY(opp.proposalDate) || '—'}</div></Field>
            <Field label="Expected Order Date *"><div className="ro">{opp.orderDate || '—'}</div></Field>
            <Field label="Expected Ship Date *"><div className="ro">{opp.invoiceDate || '—'}</div></Field>
            <Field label="Next Action Pending"><div className="ro">{opp.nextActionOwner || na.owner || '— none —'}</div></Field>
            <Field label="Last Updated"><div className="ro">{ddMmmYY(opp.lastUpdated)}</div></Field>
          </div>

          <div className="fgroup">Status &amp; Stage</div>
          <div className="dgrid2">
            <Field label="Status"><div className="ro">{opp.status || '—'}</div></Field>
            <Field label="Stage"><div className="ro">{opp.stage || '—'}</div></Field>
            <Field label="Closed Reason"><div className="ro">{opp.closedReason || '—'}</div></Field>
          </div>

          <div className="fgroup">Remarks</div>
          <div className="ro drawer-read-only-remarks">{opp.remarks || '—'}</div>

        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Customer Specs — read-only context; corrections happen in the workbench.
function SpecsPanel({ opp, store }) {
  const lead = (store.leads || []).find(l => l.oppId === opp.id)
  return (
    <section className="drawer-panel">
      <div className="fgroup">Source requirement</div>
      {lead ? (
        <>
          <p className="drawer-panel-lead"><b>{lead.subject}</b> <span className="hint">from {lead.from}</span></p>
          <div className="email-body">{lead.body}</div>
          {(lead.attachments || []).map(a => (
            <div key={a.name} className="attach-row">
              <Icon name="fileText" size={13} /> {a.name} {a.pages && <span className="hint">{a.pages} p.</span>}
            </div>
          ))}
        </>
      ) : (
        <p className="drawer-panel-lead">{opp.remarks || 'No linked lead email — requirement captured at intake.'}</p>
      )}
      <table className="cost-table drawer-meta"><tbody>
        <tr><td>Opp Type</td><td>{opp.oppType || '—'}</td></tr>
        <tr><td>Route</td><td>{opp.route || '—'}</td></tr>
        <tr><td>End user</td><td>{[opp.eucName, opp.eucLocation].filter(Boolean).join(' · ') || '—'}</td></tr>
        <tr><td>Contact</td><td>{[opp.contactPerson, opp.contactPhone].filter(Boolean).join(' · ') || '—'}</td></tr>
      </tbody></table>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Partner Docs — the OEM/channel side of the deal, and the approvals that gate
// what may be offered through it. Read-only: deciding happens in Approvals.
const apprTone = s =>
  !s ? 'grey' : s === 'Approved' ? 'state-Accepted' : s === 'Rejected' ? 'state-Rejected' : 'state-Review'

function PartnerPanel({ opp, store, nav }) {
  const products = productList(opp.product)
  const approvals = (store.approvals || []).filter(a => a.oppId === opp.id)
  return (
    <section className="drawer-panel">
      <div className="fgroup">OEM &amp; partner context</div>
      <table className="cost-table drawer-meta"><tbody>
        <tr><td>Category</td><td>{opp.category || '—'}</td></tr>
        <tr><td>Route</td><td>{opp.route || '—'}</td></tr>
        <tr><td>BU</td><td>{opp.bu || '—'}</td></tr>
        <tr><td>Segment</td><td>{opp.segment || '—'}</td></tr>
        <tr><td>Solution</td><td>{solutionLabel(opp.solution) || '—'}</td></tr>
      </tbody></table>
      <div className="chip-group drawer-panel-chips">
        {products.length
          ? products.map(p => <Chip key={p} tone="grey">{p}</Chip>)
          : <span className="hint">No product line recorded.</span>}
      </div>

      <div className="fgroup">Approvals on this opportunity</div>
      {approvals.length ? (
        <table className="sheet">
          <thead><tr><th>ID</th><th>Type</th><th>Approver</th><th>Status</th></tr></thead>
          <tbody>
            {approvals.map(a => (
              <React.Fragment key={a.id}>
                <tr>
                  <td>{a.id}</td>
                  <td title={a.detail}>{a.type}</td>
                  <td>{a.approver || (a.needed || []).join(' + ') || '—'}</td>
                  <td><Chip tone={apprTone(a.status)}>{a.status}</Chip></td>
                </tr>
                {(a.conditions || []).map((c, i) => (
                  <tr key={`${a.id}-c${i}`}><td /><td colSpan={3} className="hint">Condition: {c.text}</td></tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      ) : <p className="hint">No partner or deviation approvals raised for this opportunity.</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// KYC — who we are selling to, and whether their paperwork stands up. A
// read-only mirror of the workbench Customer/KYC tab; uploading and verifying
// stay there, where the AH role gate and the document viewer live.
const kycTone = s => (s === 'Verified' ? 'state-Accepted' : s === 'Uploaded' ? 'state-Review' : 'state-Blocks')

function KycPanel({ opp, store, nav }) {
  const customer = (store.customers || []).find(c => c.name === opp.sellTo)
  const items = (customer && store.kyc?.[customer.name])
    || (store.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' }))
  const verifiedAtLead = opp.leadVerification?.status === 'Verified'
  const displayedKycStatus = verifiedAtLead ? 'Valid' : (customer?.kyc || '—')
  return (
    <section className="drawer-panel">
      <div className="fgroup">Customer</div>
      {customer ? (
        <>
          <p className="drawer-panel-lead"><b>{customer.name}</b> <ClassChip cls={customer.status} /></p>
          <table className="cost-table"><tbody>
            <tr><td>Category</td><td>{customer.category}</td></tr>
            <tr><td>KYC status</td><td>{displayedKycStatus}</td></tr>
            <tr><td>Payment record</td><td>{customer.payment}</td></tr>
          </tbody></table>
        </>
      ) : (
        <p className="hint">{opp.sellTo} is not in the customer master yet — treated as a new (Blue) customer.</p>
      )}
      {opp.customerStatus === 'Blue' && !verifiedAtLead && (
        <div className="warnbox">Blue class: AH clearance required before proposal release.</div>
      )}
      {opp.kycOverride && (
        <div className="okbox">
          KYC overridden by {opp.kycOverride.by}: {opp.kycOverride.reason}
          <span className="hint"> (logged {ddMmmYY((opp.kycOverride.ts || '').slice(0, 10))})</span>
        </div>
      )}

      <div className="fgroup">{verifiedAtLead ? 'Lead-stage verification' : 'KYC checklist'}</div>
      {verifiedAtLead ? (
        <div className="check-row">
          <span>{opp.leadVerification.type === 'KYC' ? 'KYC' : 'Verification'}</span>
          <Chip tone="state-Accepted">Verified</Chip>
        </div>
      ) : items.map(k => (
        <div className="check-row" key={k.name}>
          <span>{k.name}</span>
          <Chip tone={kycTone(k.state)}>{k.state}</Chip>
          {k.when && <span className="hint">{k.when}</span>}
          {k.file && <span className="hint">{k.file.name}</span>}
        </div>
      ))}
      <div className="drawer-panel-actions">
        <button onClick={() => nav(`/opp/${opp.id}/customer`)}>Open Customer/KYC</button>
      </div>
    </section>
  )
}
// Lost is a close-out action, not a free-form stage edit: patch.stage === 'Lost' && !opp.closedReason must route through closeLost.
