import React, { useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { useDrawer } from '../drawer.jsx'
import { isAdminRole } from '../utils.js'
import { customerHealth } from '../insights.js'
import { parseCustomerFile } from '../customerImport.js'
import { Icon } from '../icons.jsx'
import { Modal, ErrBox } from '../ui.jsx'

// Customer master — status normally arrives with the accounting-system upload
// (payment pattern / KYC). Admin / super admin can correct a record in place;
// every other role raises a 'Customer master change' approval instead, which
// writes the patch only once AH / BU head clears it.
const CATEGORIES = ['OEM', 'EUC', 'EUC/OEM', 'ACP', 'SI', 'RE/TR', '—']
const STATUSES = ['Green', 'Amber', 'Red', 'Blue']
const KYC_STATES = ['Valid', 'Renewal due', 'Pending', '—']
const FIELDS = [
  ['category', 'Category', CATEGORIES],
  ['status', 'Status', STATUSES],
  ['kyc', 'KYC', KYC_STATES],
  ['payment', 'Payment pattern', null],
]

function EditCustomer({ customer, canEditDirect, onClose }) {
  const store = useStore()
  const [form, setForm] = useState({
    category: customer.category, status: customer.status,
    kyc: customer.kyc, payment: customer.payment,
  })
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  const changed = FIELDS
    .filter(([k]) => form[k] !== customer[k])
    .map(([k, label]) => ({ k, label, from: customer[k], to: form[k] }))

  const submit = e => {
    e.preventDefault()
    if (!changed.length) { setErr('Nothing changed.'); return }
    if (!reason.trim()) { setErr('A reason is required — it goes on the audit trail.'); return }
    const patch = Object.fromEntries(changed.map(c => [c.k, c.to]))
    if (canEditDirect) {
      store.updateCustomer(customer.name, patch, reason.trim())
    } else {
      store.requestApproval({
        type: 'Customer master change',
        needed: ['AH'],
        approver: 'AH',
        customerName: customer.name,
        patch,
        detail: `${customer.name} — ${changed.map(c => `${c.label} ${c.from} → ${c.to}`).join('; ')} · ${reason.trim()}`,
      })
    }
    onClose()
  }

  return (
    <Modal title={`${canEditDirect ? 'Edit' : 'Request change'} — ${customer.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="drawer-form">
        <div className="dgrid2">
          {FIELDS.map(([k, label, opts]) => (
            <div key={k}>
              <label>{label}</label>
              {opts
                ? (
                  <select value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}>
                    {[...new Set([...opts, form[k]])].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
                : (
                  <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                    placeholder="e.g. Avg 60 days" />
                )}
            </div>
          ))}
        </div>

        <label style={{ marginTop: 8, display: 'block' }}>
          Reason {canEditDirect ? '(audit trail)' : '(shown to the approver)'}
        </label>
        <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
          placeholder={canEditDirect
            ? 'e.g. corrected after accounting extract of 12 Aug'
            : 'e.g. customer cleared the overdue invoices last week'}
          style={{ width: '100%' }} />

        {changed.length > 0 && (
          <p className="hint" style={{ marginTop: 6 }}>
            {changed.map(c => `${c.label}: ${c.from} → ${c.to}`).join(' · ')}
          </p>
        )}
        {!canEditDirect && (
          <p className="hint">
            Sales cannot write to the master — this goes to AH / BU head and applies only once approved.
          </p>
        )}
        {err && <ErrBox>{err}</ErrBox>}

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">
            <Icon name={canEditDirect ? 'check' : 'send'} size={13} />
            {canEditDirect ? ' Save to master' : ' Submit for approval'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Manual entry of one existing customer — same audited, duplicate-safe path
// as the file upload (store.importCustomers), just for a single row.
function AddCustomer({ onClose }) {
  const store = useStore()
  const [form, setForm] = useState({ name: '', category: 'EUC', status: 'Green', kyc: 'Valid', payment: '—' })
  const [err, setErr] = useState('')
  const exists = form.name.trim()
    && store.customers.some(c => c.name.toLowerCase() === form.name.trim().toLowerCase())

  const submit = e => {
    e.preventDefault()
    if (!form.name.trim()) { setErr('A customer name is required.'); return }
    if (exists) { setErr('This customer is already in the master.'); return }
    store.importCustomers([{ ...form, name: form.name.trim() }], 'added manually')
    onClose()
  }

  return (
    <Modal title="Add existing customer" onClose={onClose}>
      <form onSubmit={submit} className="drawer-form">
        <label>Company name</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Adani Power Ltd" autoFocus style={{ width: '100%' }} />
        <div className="dgrid2" style={{ marginTop: 8 }}>
          {FIELDS.map(([k, label, opts]) => (
            <div key={k}>
              <label>{label}</label>
              {opts
                ? (
                  <select value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
                : (
                  <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                    placeholder="e.g. Avg 60 days" />
                )}
            </div>
          ))}
        </div>
        {err && <ErrBox>{err}</ErrBox>}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit"><Icon name="check" size={13} /> Add to master</button>
        </div>
      </form>
    </Modal>
  )
}

// Preview of a parsed upload — nothing lands in the master until the human
// confirms. Rows already in the master are shown but never overwritten.
function ImportPreview({ rows, fileName, onClose }) {
  const store = useStore()
  const have = new Set(store.customers.map(c => c.name.toLowerCase()))
  const fresh = rows.filter(r => !have.has(r.name.toLowerCase()))

  const confirm = () => {
    store.importCustomers(fresh, `uploaded from ${fileName}`)
    onClose()
  }

  return (
    <Modal title={`Import customers — ${fileName}`} onClose={onClose} wide>
      <p className="hint">
        {rows.length} row{rows.length === 1 ? '' : 's'} read · {fresh.length} new ·{' '}
        {rows.length - fresh.length} already in the master (kept as they are, never overwritten).
      </p>
      <div className="sheet-wrap" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        <table className="sheet">
          <thead><tr><th>Customer</th><th>Category</th><th>Status</th><th>KYC</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.category}</td>
                <td><span className={`pill ${r.status}`}>{r.status}</span></td>
                <td>{r.kyc}</td>
                <td>{r.payment}</td>
                <td>{have.has(r.name.toLowerCase())
                  ? <span className="pill Blue">Exists — skipped</span>
                  : <span className="pill Green">New</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!fresh.length} onClick={confirm}>
          <Icon name="check" size={13} /> Import {fresh.length} customer{fresh.length === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  )
}

export default function Customers() {
  const store = useStore()
  const drawer = useDrawer()
  const [editing, setEditing] = useState(null) // customer name
  const [adding, setAdding] = useState(false)
  const [preview, setPreview] = useState(null) // { rows, fileName }
  const [uploadErr, setUploadErr] = useState('')
  const fileRef = useRef(null)
  const canEditDirect = isAdminRole(store.role)
  const customer = store.customers.find(c => c.name === editing)

  const onFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = '' // same file can be picked again
    if (!file) return
    setUploadErr('')
    try {
      const rows = parseCustomerFile(await file.arrayBuffer())
      if (!rows.length) { setUploadErr('No customer rows found — the sheet needs a name/customer column.'); return }
      setPreview({ rows, fileName: file.name })
    } catch {
      setUploadErr('The file could not be read — an .xlsx, .xls or .csv export is expected.')
    }
  }
  // A change already in flight — don't let the same row be requested twice.
  const pendingFor = name => store.approvals.some(
    a => a.status === 'Pending' && a.type === 'Customer master change' && a.customerName === name)

  return (
    <div className="page">
      <h2>Customer Master</h2>
      <div className="toolbar">
        <span className="hint">
          Status comes from the periodic accounting-system upload (payment pattern, KYC).
          {canEditDirect
            ? ' As admin you can correct a record in place — every edit is audited.'
            : ' Sales is read-only: changes are requested here and applied once AH / BU head approves.'}
          {' '}New customers are flagged Blue until verified.
        </span>
        <span className="spacer" />
        {canEditDirect && (
          <>
            <button onClick={() => setAdding(true)}><Icon name="plus" size={13} /> Add customer</button>
            <button onClick={() => fileRef.current?.click()}>
              <Icon name="folder" size={13} /> Upload customer list
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
          </>
        )}
      </div>
      {uploadErr && <ErrBox>{uploadErr}</ErrBox>}
      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet">
          <thead><tr><th>Customer</th><th>Category</th><th>Status</th><th>KYC</th><th>Payment Pattern</th><th>Health</th><th></th></tr></thead>
          <tbody>
            {store.customers.map(c => (
              <tr key={c.name} className="rowclick"
                onClick={e => {
                  if (e.target.closest('a,button,input,select,label')) return
                  drawer.open({ type: 'customer', id: c.name })
                }}>
                <td>{c.name}</td>
                <td>{c.category}</td>
                <td className={`cstat ${c.status}`}><span className={`pill ${c.status}`}>{c.status}</span></td>
                <td>{c.kyc}</td>
                <td>{c.payment}</td>
                {/* Derived from class, KYC, payment behaviour and win/loss history —
                    hover for the reasons that moved it. */}
                <td>{(() => {
                  const h = customerHealth(c, store.opportunities)
                  const why = h.reasons
                    .map(r => (r.delta ? `${r.delta > 0 ? '+' : ''}${r.delta}  ` : '     ') + r.why)
                    .join('\n')
                  return (
                    <span className={`health ${h.band === 'Healthy' ? 'ok' : h.band === 'Watch' ? 'warn' : 'bad'}`} title={why}>
                      {h.score} · {h.band}
                    </span>
                  )
                })()}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {pendingFor(c.name)
                    ? <span className="pill Blue" title="A change request is awaiting approval">Change pending</span>
                    : (
                      <button onClick={() => setEditing(c.name)}
                        title={canEditDirect ? 'Edit this record' : 'Request a change (needs AH approval)'}>
                        <Icon name="edit" size={13} /> {canEditDirect ? 'Edit' : 'Request change'}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><span className="pill Green">Green</span> good standing</span>
        <span><span className="pill Amber">Amber</span> watch — credit terms need approval</span>
        <span><span className="pill Red">Red</span> hold — prepayment only</span>
        <span><span className="pill Blue">Blue</span> new — pending verification</span>
      </div>

      {customer && (
        <EditCustomer customer={customer} canEditDirect={canEditDirect} onClose={() => setEditing(null)} />
      )}
      {adding && <AddCustomer onClose={() => setAdding(false)} />}
      {preview && <ImportPreview rows={preview.rows} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  )
}
