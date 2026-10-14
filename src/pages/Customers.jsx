import React, { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { useDrawer } from '../drawer.jsx'
import { isAdminRole } from '../utils.js'
import { customerHealth } from '../insights.js'
import { CUSTOMER_CRITERIA, classRule } from '../customerClasses.js'
import { fieldValues, suggestCustomerClass } from '../workbookGovernance.js'
import { parseCustomerFile } from '../customerImport.js'
import { Icon } from '../icons.jsx'
import { Modal, ErrBox } from '../ui.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import { usePagedRows } from '../ui/Pagination.jsx'
import usePhoneLayout from '../tablet/usePhoneLayout.js'
import { customerPageSize } from './customerPageSize.js'

// Customer master — status normally arrives with the accounting-system upload
// (payment pattern / KYC). Admin / super admin can correct a record in place;
// every other role raises a 'Customer master change' approval instead, which
// writes the patch only once AH / BU head clears it.
const STATUSES = ['Green', 'Amber', 'Red', 'Blue']
const KYC_STATES = ['Valid', 'Renewal due', 'Pending', '—']
const FIELDS = [
  ['category', 'Category', 'category'],
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
  const [criteria, setCriteria] = useState(customer.classificationCriteria || {})
  const guidance = store.config?.customerClassificationGuidance || []
  const criteriaRows = store.config.classificationCriteria?.length
    ? store.config.classificationCriteria.filter(row => row.enabled !== false)
    : (guidance.length ? guidance.filter(row => !['Proposed Opp/Lead Actions', 'Typical Accounts'].includes(row.label)).map(row => row.label) : CUSTOMER_CRITERIA).map(label => ({ id: label, label }))
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  const changed = FIELDS
    .filter(([k]) => form[k] !== customer[k])
    .map(([k, label]) => ({ k, label, from: customer[k], to: form[k] }))
    .concat(JSON.stringify(criteria) !== JSON.stringify(customer.classificationCriteria || {}) ? [{ k: 'classificationCriteria', label: 'Classification criteria', from: customer.classificationCriteria || {}, to: criteria }] : [])
    .concat(customer.classificationNeedsReview ? [{ k: 'classificationNeedsReview', label: 'Classification reviewed', from: true, to: false }] : [])

  const submit = e => {
    e.preventDefault()
    if (!changed.length) { setErr('Nothing changed.'); return }
    if (!reason.trim()) { setErr('A reason is required — it goes on the audit trail.'); return }
    const patch = { ...Object.fromEntries(changed.map(c => [c.k, c.to])), classificationReviewedAt: new Date().toISOString(), classificationReviewedBy: store.role, classificationPolicyRevision: store.config.workbookPolicyRevision || 0, classificationAssessment: suggestCustomerClass({ classificationCriteria: criteria }, store.config) }
    if (canEditDirect) {
      store.updateCustomer(customer.name, patch, reason.trim())
    } else {
      store.requestApproval({
        type: 'Customer master change',
        needed: ['AH'],
        approver: 'AH',
        customerName: customer.name,
        patch,
        detail: `${customer.name} — ${changed.map(c => `${c.label} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join('; ')} · ${reason.trim()}`,
      })
    }
    onClose()
  }

  return (
    <Modal title={`${canEditDirect ? 'Edit' : 'Submit customer master change request'} — ${customer.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="drawer-form">
        <div className="dgrid2">
          {FIELDS.map(([k, label, opts]) => (
            <div key={k}>
              <label>{label}</label>
              {opts
                ? (
                  <select value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} name={`customers-${k}`}>
                    {[...new Set([...(opts === 'category' ? fieldValues(store.config, 'category') : opts), form[k]])].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
                : (
                  <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                    placeholder="e.g. Avg 60 days" name={`customers-${k}`} />
                )}
            </div>
          ))}
        </div>

        <details open={customer.classificationNeedsReview}>
          <summary>Customer classification criteria</summary>
          <p className="hint">Record the facts, then confirm the customer colour. Use Admin → Customer governance to review the configured criteria and confirm a suggested colour.</p>
          <div className="dgrid2">
            {criteriaRows.map(({ id, label }) => <div key={id}>
              <label>{label}</label>
              <input value={criteria[id] ?? criteria[label] ?? ''} onChange={e => setCriteria({ ...criteria, [id]: e.target.value })} name="customers-input" />
              {guidance.find(row => row.label === label)?.values?.[form.status] && <small className="hint">{form.status} guidance: {guidance.find(row => row.label === label).values[form.status]}</small>}
            </div>)}
          </div>
        </details>
        <label style={{ marginTop: 8, display: 'block' }}>
          Reason {canEditDirect ? '(audit trail)' : '(shown to the approver)'}
        </label>
        <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
          placeholder={canEditDirect
            ? 'e.g. corrected after accounting extract of 12 Aug'
            : 'e.g. customer cleared the overdue invoices last week'}
          style={{ width: '100%' }} name="customers-reason" />

        {changed.length > 0 && (
          <p className="hint" style={{ marginTop: 6 }}>
            {changed.map(c => `${c.label}: ${String(c.from)} → ${c.to}`).join(' · ')}
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
  const [form, setForm] = useState({ name: '', category: 'EUC', status: 'Blue', kyc: 'Pending', payment: '—' })
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
          placeholder="e.g. Adani Power Ltd" autoFocus style={{ width: '100%' }} name="customers-name" />
        <div className="dgrid2" style={{ marginTop: 8 }}>
          {FIELDS.map(([k, label, opts]) => (
            <div key={k}>
              <label>{label}</label>
              {opts
                ? (
                  <select value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} name={`customers-${k}`}>
                    {(opts === 'category' ? fieldValues(store.config, 'category') : opts).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
                : (
                  <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                    placeholder="e.g. Avg 60 days" name={`customers-${k}`} />
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
  const narrow = usePhoneLayout()
  const phone = narrow && store.viewMode === 'tablet'
  const { scope } = useWorkspaceView()
  const drawer = useDrawer()
  const [editing, setEditing] = useState(null) // customer name
  const [adding, setAdding] = useState(false)
  const [preview, setPreview] = useState(null) // { rows, fileName }
  const [uploadErr, setUploadErr] = useState('')
  const fileRef = useRef(null)
  const pageRef = useRef(null)
  const tableRef = useRef(null)
  const legendRef = useRef(null)
  const [pageSize, setPageSize] = useState(10)
  const canEditDirect = isAdminRole(store.role)
  const scopedOpportunities = scope === 'my' ? store.opportunities.filter(opportunity => opportunity.owner === store.role) : store.opportunities
  const myCustomerNames = new Set(scopedOpportunities.map(opportunity => opportunity.sellTo).filter(Boolean))
  const visibleCustomers = scope === 'my' ? store.customers.filter(customer => myCustomerNames.has(customer.name)) : store.customers
  const { pagedRows: pageCustomers, pagination } = usePagedRows(visibleCustomers, scope, phone ? 10 : pageSize)
  const customer = store.customers.find(c => c.name === editing)

  useLayoutEffect(() => {
    if (phone) return
    const page = pageRef.current
    const table = tableRef.current
    const legend = legendRef.current
    const body = table?.tBodies[0]
    if (!page || !body || !legend) return

    const scrollArea = page.closest('.main-scroll')
    const update = () => {
      const firstRow = body.rows[0]
      const rowHeight = firstRow?.getBoundingClientRect().height || 48
      const viewportBottom = Math.min(window.innerHeight, scrollArea?.getBoundingClientRect().bottom ?? window.innerHeight)
      const nextSize = customerPageSize({
        bodyTop: body.getBoundingClientRect().top,
        viewportBottom,
        rowHeight,
        paginationHeight: page.querySelector('.list-pagination')?.getBoundingClientRect().height || 44,
        legendHeight: legend.getBoundingClientRect().height + parseFloat(getComputedStyle(legend).marginTop || 0),
        bottomPadding: parseFloat(getComputedStyle(page).paddingBottom || 0),
        totalRows: visibleCustomers.length,
      })
      setPageSize(current => current === nextSize ? current : nextSize)
    }

    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    for (const element of [scrollArea, page.querySelector('.toolbar'), table.tHead, legend]) {
      if (element) observer?.observe(element)
    }
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [phone, scope, uploadErr, visibleCustomers.length])

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
    <div className="page" ref={pageRef}>
      <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="users" size={18} /> Customer Master</h2>
      <div className="toolbar">
        <span className="hint">
          Customer facts are saved in the workspace. Admins review the facts and confirm the customer colour.
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
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} name="customers-file" />
          </>
        )}
      </div>
      {uploadErr && <ErrBox>{uploadErr}</ErrBox>}
      {phone ? <section aria-label="Customers">{pageCustomers.map(c => <article key={c.name} className="phone-customer-row"><button className="phone-record" onClick={() => drawer.open({ type: 'customer', id: c.name })}><strong>{c.name}</strong><span>{c.category} · {c.status}</span><small>KYC: {c.kyc} · {c.payment}</small></button>{pendingFor(c.name) ? <small>Change pending</small> : <button onClick={() => setEditing(c.name)}>{canEditDirect ? 'Edit customer' : 'Request change'}</button>}</article>)}{!pageCustomers.length && <p>No customers in this view.</p>}</section> : <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet" ref={tableRef}>
          <thead><tr><th>Customer</th><th>Category</th><th>Status</th><th>KYC</th><th>Payment Pattern</th><th>Health</th><th></th></tr></thead>
          <tbody>
            {pageCustomers.map(c => (
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
                  const h = customerHealth(c, scopedOpportunities, store.config)
                  const driver = h.reasons
                    .filter(reason => reason.delta)
                    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
                  const why = driver
                    ? `Biggest factor: ${driver.why} (${driver.delta > 0 ? '+' : ''}${driver.delta}).`
                    : 'No single factor changed the score.'
                  return (
                    <span
                      className={`health ${h.band === 'Healthy' ? 'ok' : h.band === 'Watch' ? 'warn' : 'bad'}`}
                      tabIndex={0}
                      aria-label={`Customer health ${h.score} out of 100, ${h.band}`}
                      data-explain-title={`Customer health · ${h.score} / 100 · ${h.band}`}
                      data-explain={`Health uses account, KYC, payment and outcome data. ${why}`}
                    >
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
                        <Icon name="edit" size={13} /> {canEditDirect ? 'Edit' : 'Submit change request'}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      }
      {pagination}
      <div className="legend" ref={legendRef} style={{ marginTop: 10 }}>
        {STATUSES.map(colour => <span key={colour}><span className={`pill ${colour}`}>{colour}</span>{' '}{classRule(store.config, colour)?.defaultAction}</span>)}
      </div>

      {customer && (
        <EditCustomer customer={customer} canEditDirect={canEditDirect} onClose={() => setEditing(null)} />
      )}
      {adding && <AddCustomer onClose={() => setAdding(false)} />}
      {preview && <ImportPreview rows={preview.rows} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  )
}
