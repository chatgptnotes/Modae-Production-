import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from './store.jsx'
import {
  SUBFOLDERS, OWNERS, STAGES, CLOSE_REASONS,
  OPP_TYPES, CATEGORIES, BUS, SEGMENTS, SOLUTIONS,
} from './seed.js'
import { fmt, mmmYY, ddMmmYY, canViewCommercial, canPriceProposal, stageClass, productList } from './utils.js'
import { nextActionWith } from './gates.js'
import * as filestore from './filestore.js'
import { Icon } from './icons.jsx'
import { Chip, ClassChip } from './ui.jsx'
import OpportunityDetailsEditor from './OpportunityDetailsEditor.jsx'
import DetailTabs from './DetailTabs.jsx'

const OPEN_STAGES = STAGES.filter(s => s !== 'Won' && s !== 'Lost')

// The record form is a tab of its own rather than a footer under every folder:
// three of the four folders are usually empty, so a shared footer left every
// tab looking identical and the folder tabs read as decoration.
const DETAILS_TAB = 'Details'

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
  const files = store.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
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
  useEffect(() => { setTab(DETAILS_TAB) }, [oppId])

  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [cloudErr, setCloudErr] = useState('')
  const [lossPending, setLossPending] = useState(false)
  const [lossReason, setLossReason] = useState('')

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
  const gmPct = opp.valueK ? Math.round((gmK / opp.valueK) * 100) + '%' : '#DIV/0!'

  // Same write-through + coupling rules as the tracker grid (Tracker.jsx upd).
  const upd = field => e => {
    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    if (field === 'invoiceDate' && value && opp.orderDate && value <= opp.orderDate) return
    if (field === 'orderDate' && value && opp.invoiceDate && value >= opp.invoiceDate) return
    if (field === 'valueK' || field === 'cogsK') value = e.target.value === '' ? 0 : +e.target.value
    const patch = { [field]: value }
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '', stage: 'Firm Bid' })
    if (field === 'stage' && (value === 'Won' || value === 'Lost')) patch.status = 'Closed'
    // Diagram 02 §7 — "Capture Loss Reason & Close Opportunity". Losing is a
    // decision, not a field edit: closeLost refuses without a reason, so the
    // stage change is held open here until one is picked.
    if (patch.stage === 'Lost' && !opp.closedReason) { setLossPending(true); return }
    if (patch.stage === 'Lost') { store.closeLost(oppId, opp.closedReason); return }
    store.updateOpportunity(oppId, patch)
  }

  // Same bucket keys as the Folders page, so both surfaces list the same objects.
  // The filestore facade picks the backend (SharePoint → Supabase → mock).
  const onUpload = async e => {
    const picked = [...e.target.files]
    e.target.value = ''
    setCloudErr(''); setBusy(true)
    for (const f of picked) {
      try {
        const rec = await filestore.uploadOppFile(opp, activeTab, f)
        store.addFile(oppId, activeTab, rec)
      } catch (ex) {
        setCloudErr(ex.message)
      }
    }
    setBusy(false)
  }

  const addMockFile = () => {
    const name = prompt('File name to upload (mock):', 'Customer_Spec.pdf')
    if (!name) return
    store.addFile(oppId, activeTab, {
      name, date: new Date().toISOString().slice(0, 10), size: `${Math.ceil(Math.random() * 900) + 90} KB`,
    })
  }

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
            <span style={{ flex: 1 }} />
            {cloudErr && <span className="hint" style={{ color: 'var(--lost-text)' }}>{cloudErr}</span>}
            {filestore.activeBackend() !== 'mock' ? (
              <>
                <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={onUpload} />
                <button onClick={() => fileInput.current.click()} disabled={busy}>
                  <Icon name="upload" size={13} /> {busy ? 'Uploading…' : 'Upload'}
                </button>
              </>
            ) : (
              <button onClick={addMockFile}><Icon name="upload" size={13} /> Upload (mock)</button>
            )}
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
                {showValue && <div><label>Value (₹)</label><div className="ro">₹ {fmt(opp.valueK)}</div></div>}
                {comm ? (
                  <>
                    <div><label>COGS (K₹)</label><div className="ro">₹ {fmt(opp.cogsK)}</div></div>
                    <div><label>GM</label><div className="ro">₹ {fmt(gmK)} K · {gmPct}</div></div>
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
      {activeTab === 'Customer Specs' && <SpecsPanel opp={opp} store={store} upd={upd} />}
      {activeTab === 'Partner Docs' && <PartnerPanel opp={opp} store={store} nav={nav} upd={upd} />}
      {activeTab === 'KYC' && <KycPanel opp={opp} store={store} nav={nav} />}

      {isDetails && (
        <div className="drawer-form">
          <OpportunityDetailsEditor opp={opp} store={store} />

          <div className="fgroup">Commercial</div>
          {showValue ? (
            <div className="dgrid2">
              <Field label="Value (₹)"><input type="number" value={opp.valueK || ''} onChange={upd('valueK')} placeholder="-" /></Field>
              {comm && <Field label="COGS (K₹)"><input type="number" value={opp.cogsK || ''} onChange={upd('cogsK')} placeholder="-" /></Field>}
              {comm && <Field label="GM (K₹)"><div className="ro">{opp.valueK ? fmt(gmK) : '-'}</div></Field>}
              {comm && <Field label="GM%"><div className="ro">{gmPct}</div></Field>}
              <Field label="Forecast">
                <div><input type="checkbox" checked={!!opp.forecast} onChange={upd('forecast')} /> Include for roll-up</div>
              </Field>
              {!comm && <div style={{ gridColumn: '1 / -1' }} className="restricted"><Icon name="lock" size={13} /> Cost and margin — approvers/admin only</div>}
            </div>
          ) : (
            <div className="restricted"><Icon name="lock" size={13} /> Commercial data — approvers/admin only</div>
          )}

          <div className="fgroup">Dates</div>
          <div className="dgrid2">
            <Field label="Create Date"><div className="ro">{mmmYY(opp.createDate)}</div></Field>
            <Field label="Proposal Date"><div className="ro">{mmmYY(opp.proposalDate) || '—'}</div></Field>
            <Field label="Expected Order Date *"><input type="date" value={opp.orderDate} max={opp.invoiceDate ? new Date(new Date(`${opp.invoiceDate}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10) : undefined} onChange={upd('orderDate')} /></Field>
            <Field label="Expected Ship Date *"><input type="date" value={opp.invoiceDate} min={opp.orderDate ? new Date(new Date(`${opp.orderDate}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : undefined} onChange={upd('invoiceDate')} /></Field>
            {/* Where the next action sits — derived from the live blockers unless
                someone has named an owner themselves. */}
            <Field label="Next Action Pending">
              <select value={opp.nextActionOwner || ''} onChange={upd('nextActionOwner')} title={na.text}>
                <option value="">{na.owner ? `${na.owner} (auto)` : '— none —'}</option>
                {OWNERS.map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Last Updated"><div className="ro">{ddMmmYY(opp.lastUpdated)}</div></Field>
          </div>

          <div className="fgroup">Status &amp; Stage</div>
          <div className="dgrid2">
            <Field label="Status">
              <select value={opp.status} onChange={upd('status')}>
                <option>Open</option><option>On Hold</option><option>Closed</option>
              </select>
            </Field>
            <Field label="Stage">
              <select value={opp.stage} onChange={upd('stage')}>
                {(opp.status === 'Closed' ? STAGES : OPEN_STAGES.concat(['Won', 'Lost'])).map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            {/* Always rendered — the drawer mirrors every sheet column, so an open
                opp shows the field disabled rather than dropping it entirely. */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Closed Reason {opp.status === 'Closed' && !opp.closedReason && <span className="err-text">— required</span>}</label>
              {lossPending && (
                <div className="errbox">
                  A loss reason is required before this opportunity can be closed as Lost.
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <select value={lossReason} style={{ flex: 1 }} onChange={e => setLossReason(e.target.value)}>
                      <option value="">— select a reason —</option>
                      {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <button className="primary" disabled={!lossReason}
                      onClick={() => { store.closeLost(oppId, lossReason); setLossPending(false); setLossReason('') }}>
                      Close as lost
                    </button>
                    <button onClick={() => { setLossPending(false); setLossReason('') }}>Cancel</button>
                  </div>
                </div>
              )}
              <select value={opp.closedReason} onChange={upd('closedReason')} disabled={opp.status !== 'Closed'}>
                <option value="">{opp.status === 'Closed' ? '— required —' : '—'}</option>
                {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="fgroup">Remarks</div>
          <textarea rows={3} value={opp.remarks} onChange={upd('remarks')} />
          <p className="hint">
            <span className={`pill ${stageClass(opp) === 'won' ? 'won' : stageClass(opp) === 'lost' ? 'lost' : 'Blue'}`}>
              {opp.status === 'Closed' ? opp.stage : `${opp.status} — ${opp.stage}`}
            </span>{' '}
            Last updated {ddMmmYY(opp.lastUpdated)} · edits save instantly to the sheet.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable rows for the drawer's two-column meta tables. These panels used to
// print the same values read-only, which meant a correction found while reading
// the requirement had to be made somewhere else — the tracker grid or the
// Details tab — and then found again here. They write through the same `upd`
// the Details tab and the tracker sheet use, so every surface stays in step.
const MetaSelect = ({ label, value, options, onChange }) => (
  <tr>
    <td>{label}</td>
    <td>
      <select value={value || ''} onChange={onChange}>
        <option value="">—</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </td>
  </tr>
)

// Two fields the read-only table used to join with a separator (name · place).
const MetaPair = ({ label, a, b }) => (
  <tr>
    <td>{label}</td>
    <td>
      <div className="drawer-meta-pair">
        <input value={a.value || ''} onChange={a.onChange} placeholder={a.placeholder} />
        <input value={b.value || ''} onChange={b.onChange} placeholder={b.placeholder} />
      </div>
    </td>
  </tr>
)

// ---------------------------------------------------------------------------
// Customer Specs — what the customer actually asked for. The condensed twin of
// the workbench Requirement tab (pages/Workbench.jsx RequirementTab).
function SpecsPanel({ opp, store, upd }) {
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
        <MetaSelect label="Opp Type" value={opp.oppType} options={OPP_TYPES} onChange={upd('oppType')} />
        {/* Route is derived from the type (seed.routeForType) and recomputed on
            every load, so it is shown rather than offered — typing into it would
            silently revert on the next reload. */}
        <tr>
          <td>Route</td>
          <td>{opp.route || '—'} <span className="hint">· follows the Opp Type</span></td>
        </tr>
        <MetaPair label="End user"
          a={{ value: opp.eucName, onChange: upd('eucName'), placeholder: 'End user' }}
          b={{ value: opp.eucLocation, onChange: upd('eucLocation'), placeholder: 'Location' }} />
        <MetaPair label="Contact"
          a={{ value: opp.contactPerson, onChange: upd('contactPerson'), placeholder: 'Name' }}
          b={{ value: opp.contactPhone, onChange: upd('contactPhone'), placeholder: 'Phone' }} />
      </tbody></table>
      <p className="hint">Edits save instantly to the sheet.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Partner Docs — the OEM/channel side of the deal, and the approvals that gate
// what may be offered through it. Read-only: deciding happens in Approvals.
const apprTone = s =>
  !s ? 'grey' : s === 'Approved' ? 'state-Accepted' : s === 'Rejected' ? 'state-Rejected' : 'state-Review'

function PartnerPanel({ opp, store, nav, upd }) {
  const products = productList(opp.product)
  const approvals = (store.approvals || []).filter(a => a.oppId === opp.id)
  return (
    <section className="drawer-panel">
      <div className="fgroup">OEM &amp; partner context</div>
      <table className="cost-table drawer-meta"><tbody>
        <MetaSelect label="Category" value={opp.category} options={CATEGORIES} onChange={upd('category')} />
        <tr>
          <td>Route</td>
          <td>{opp.route || '—'} <span className="hint">· follows the Opp Type</span></td>
        </tr>
        <MetaSelect label="BU" value={opp.bu} options={BUS} onChange={upd('bu')} />
        <MetaSelect label="Segment" value={opp.segment} options={SEGMENTS} onChange={upd('segment')} />
        <MetaSelect label="Solution" value={opp.solution} options={SOLUTIONS} onChange={upd('solution')} />
      </tbody></table>
      <p className="hint">Edits save instantly to the sheet.</p>
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
      <div className="drawer-panel-actions">
        <button onClick={() => nav(`/opp/${opp.id}/approvals`)}>Open approvals</button>
      </div>
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
  const items = (customer && store.kyc[customer.name])
    || (store.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' }))
  const verifiedAtLead = opp.leadVerification?.status === 'Verified'
  return (
    <section className="drawer-panel">
      <div className="fgroup">Customer</div>
      {customer ? (
        <>
          <p className="drawer-panel-lead"><b>{customer.name}</b> <ClassChip cls={customer.status} /></p>
          <table className="cost-table"><tbody>
            <tr><td>Category</td><td>{customer.category}</td></tr>
            <tr><td>KYC status</td><td>{customer.kyc}</td></tr>
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
        <div className="okbox">
          {opp.leadVerification.type === 'KYC' ? 'KYC verified at Lead stage.' : 'Verification confirmed at Lead stage.'}
          {' '}This Opportunity uses the Lead-stage confirmation.
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
