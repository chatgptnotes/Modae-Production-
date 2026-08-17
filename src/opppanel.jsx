import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from './store.jsx'
import {
  SUBFOLDERS, CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS,
  PROB_LEVELS, STAGES, CLOSE_REASONS,
} from './seed.js'
import { fmt, mmmYY, ddMmmYY, canViewCommercial, canPriceProposal, stageClass, productList } from './utils.js'
import { nextActionWith } from './gates.js'
import * as filestore from './filestore.js'
import { Icon } from './icons.jsx'

const OPEN_STAGES = STAGES.filter(s => s !== 'Won' && s !== 'Lost')

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

  const [tab, setTab] = useState(subNames[0])
  useEffect(() => { setTab(subNames[0]) }, [oppId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [cloudErr, setCloudErr] = useState('')

  if (!opp) return <div className="drawer-body"><p className="hint">This opportunity no longer exists.</p></div>

  // A custom subfolder can be deleted (on the Folders page) while its tab is active.
  const activeTab = subNames.includes(tab) ? tab : subNames[0]
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
    if (field === 'valueK' || field === 'cogsK') value = e.target.value === '' ? 0 : +e.target.value
    const patch = { [field]: value }
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '', stage: 'Firm Bid' })
    if (field === 'stage' && (value === 'Won' || value === 'Lost')) patch.status = 'Closed'
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
      <div className="drawer-tabs">
        {subNames.map(sf => (
          <button key={sf} className={`dtab ${sf === activeTab ? 'active' : ''}`} onClick={() => setTab(sf)}>
            {sf}
          </button>
        ))}
      </div>

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

      <div className="drawer-form">
        <div className="fgroup">Identity</div>
        <div className="dgrid2">
          <Field label="Opp ID"><div className="ro">{opp.id} (Sl {opp.sl})</div></Field>
          <Field label="Owner">
            <select value={opp.owner} onChange={upd('owner')}>{OWNERS.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Opportunity Name/Description</label>
            <input type="text" value={opp.oppName} onChange={upd('oppName')} />
          </div>
        </div>

        <div className="fgroup">Customer</div>
        <div className="dgrid2">
          <Field label="Sell To Customer"><input type="text" value={opp.sellTo} onChange={upd('sellTo')} /></Field>
          <Field label="Category">
            <select value={opp.category} onChange={upd('category')}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Location"><input type="text" value={opp.location} onChange={upd('location')} /></Field>
          <Field label="Customer Status">
            <div><span className={`pill ${opp.customerStatus}`}>{opp.customerStatus}</span>{' '}
              <span className="hint">accounting-fed</span></div>
          </Field>
          <Field label="EUC Name"><input type="text" value={opp.eucName} onChange={upd('eucName')} /></Field>
          <Field label="EUC Location"><input type="text" value={opp.eucLocation} onChange={upd('eucLocation')} /></Field>
        </div>

        <div className="fgroup">Classification</div>
        <div className="dgrid2">
          <Field label="Opp Type">
            <select value={opp.oppType} onChange={upd('oppType')}>{OPP_TYPES.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="BU">
            <select value={opp.bu} onChange={upd('bu')}>{BUS.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Segment">
            <select value={opp.segment} onChange={upd('segment')}>{SEGMENTS.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          {/* Multi-select: one opportunity can carry several products. */}
          <Field label="Product">
            <div className="pill-group">
              {PRODUCTS.map(x => {
                const chosen = productList(opp.product)
                const on = chosen.includes(x)
                return (
                  <label key={x} className={`pill-opt ${on ? 'on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() =>
                      store.updateOpportunity(oppId, {
                        product: on ? chosen.filter(p => p !== x) : [...chosen, x],
                      })} />
                    {x}
                  </label>
                )
              })}
            </div>
          </Field>
          <Field label="Prob (%)">
            <select value={opp.prob || ''} onChange={upd('prob')}>
              <option value=""></option>
              {PROB_LEVELS.map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>

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
          <Field label="Expected Order Date *"><input type="date" value={opp.orderDate} onChange={upd('orderDate')} /></Field>
          <Field label="Expected Ship Date *"><input type="date" value={opp.invoiceDate} onChange={upd('invoiceDate')} /></Field>
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
              <option>Open</option><option>Closed</option>
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
            <select value={opp.closedReason} onChange={upd('closedReason')} disabled={opp.status !== 'Closed'}>
              <option value="">{opp.status === 'Closed' ? '— required —' : '—'}</option>
              {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="fgroup">Contact</div>
        <div className="dgrid2">
          <Field label="Contact Person"><input type="text" value={opp.contactPerson} onChange={upd('contactPerson')} /></Field>
          <Field label="Contact Phone #"><input type="text" value={opp.contactPhone} onChange={upd('contactPhone')} /></Field>
        </div>

        <div className="fgroup">Remarks</div>
        <textarea rows={3} value={opp.remarks} onChange={upd('remarks')} />
        <p className="hint">
          <span className={`pill ${stageClass(opp) === 'won' ? 'won' : stageClass(opp) === 'lost' ? 'lost' : 'Blue'}`}>
            {opp.status === 'Closed' ? opp.stage : `Open — ${opp.stage}`}
          </span>{' '}
          Last updated {ddMmmYY(opp.lastUpdated)} · edits save instantly to the sheet.
        </p>
      </div>
    </div>
  )
}
