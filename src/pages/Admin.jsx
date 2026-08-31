import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { OWNERS, AI_PROVIDERS } from '../seed.js'
import { isAdminRole, canSeePage } from '../utils.js'
import { Icon } from '../icons.jsx'
import { Chip, WarnBox, DemoDataControls } from '../ui.jsx'
import { saveAiKey, testConnection, usesVercelAi } from '../ai.js'
import * as sp from '../sharepoint.js'
import { DEFAULT_COMMON_MAILBOX } from '../leadClarification.js'

// Admin — every runtime rule the app obeys, in one card grid. Data lives in
// store.config; all changes are audited by the store mutators.

const CLASS_RULES = [
  ['Green', 'OK to quote — 30 days credit'],
  ['Blue', 'New customer — 50% advance, KYC pending'],
  ['Amber', 'Pre-quote processing fee — 100% advance'],
  ['Red', 'No Bid without joint LJS+AH clearance — 100% prepayment only'],
]

const CONNECTOR_CYCLE = {
  'Healthy': 'Degraded (read-only)',
  'Degraded (read-only)': 'Unavailable',
  'Unavailable': 'Healthy',
}

const connDotClass = state =>
  state?.startsWith('Degraded') ? 'Degraded'
    : state === 'Healthy' || state === 'Unavailable' || state === 'Connected' || state === 'Error' ? state
      : 'NotConnected'

const isCustomModel = m => {
  const s = (m || '').toLowerCase()
  return s.includes('enter below') || s.includes('deployment')
}
const FALLBACK_PROVIDER = 'Built-in fallback'

function NumField({ label, value, disabled, onChange }) {
  return (
    <label className="afield">{label}
      <input type="number" value={value ?? 0} disabled={disabled}
        onChange={e => onChange(Number(e.target.value) || 0)} />
    </label>
  )
}

// A real <input type="file"> behind a button — metadata only, contents are
// never read or stored in the demo.
function FileButton({ label, disabled, onFile, primary }) {
  const ref = useRef(null)
  return (
    <>
      <input ref={ref} type="file" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); e.target.value = '' }} />
      <button className={primary ? 'primary' : ''} disabled={disabled} onClick={() => ref.current && ref.current.click()}>
        <Icon name="upload" size={11} /> {label}
      </button>
    </>
  )
}

function SharePointCard({ canEdit }) {
  const call = (fn, fallback) => { try { return fn() } catch { return fallback } }
  const [cfg, setCfg] = useState(() => call(() => ({ ...sp.getConfig() }), {}))
  const [account, setAccount] = useState(() => call(() => sp.getAccount(), null))
  const [test, setTest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)
  const configured = call(() => sp.isConfigured(), false)

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  const save = () => {
    setErr('')
    try { sp.configure(cfg); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500) }
    catch (e) { setErr(String((e && e.message) || e)) }
  }
  const connect = async () => {
    setErr(''); setBusy(true)
    try { setAccount(await sp.signIn()) }
    catch (e) { setErr(String((e && e.message) || e)) }
    setBusy(false)
  }
  const runTest = async () => {
    setErr(''); setTest(null); setBusy(true)
    try { setTest(await sp.testConnection()) }
    catch (e) { setTest({ ok: false, message: String((e && e.message) || e) }) }
    setBusy(false)
  }
  const disconnect = () => {
    setErr('')
    try { sp.signOut() } catch { /* stays local */ }
    setAccount(null); setTest(null)
  }

  const health = err || (test && !test.ok)
    ? <Chip tone="state-Rejected">Error</Chip>
    : account
      ? <Chip tone="state-Accepted">Connected</Chip>
      : <Chip tone="grey">Local demo mode</Chip>

  const fields = [
    ['clientId', 'Client ID', 'Application (client) ID from Azure'],
    ['tenantId', 'Tenant ID', 'blank = any organisation'],
    ['siteHostname', 'Site hostname', 'e.g. contoso.sharepoint.com'],
    ['sitePath', 'Site path', '/sites/Sales'],
    ['library', 'Library', 'Documents'],
    ['rootFolder', 'Root folder', 'Opportunities'],
  ]

  return (
    <div className="admin-card" style={{ gridColumn: '1 / -1' }}>
      <h3><Icon name="cloud" size={14} /> SharePoint connector <span style={{ marginLeft: 'auto' }}>{health}</span></h3>
      <p className="hint">
        Files stay in SharePoint; the app only links to them. Opportunity folders move between
        Open / WON / Closed / Not In Opp List as the status changes. {configured ? 'Connector configured.' : 'Unconfigured — file flows fall back to local demo mode.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0 12px' }}>
        {fields.map(([k, label, ph]) => (
          <label key={k} className="afield">{label}
            <input type="text" value={cfg[k] || ''} placeholder={ph} disabled={!canEdit}
              onChange={e => set(k, e.target.value)} />
          </label>
        ))}
      </div>
      <div className="admin-actions">
        <button className="primary" disabled={!canEdit} onClick={save}>Save configuration</button>
        <button disabled={!canEdit || busy} onClick={connect}><Icon name="key" size={11} /> Connect</button>
        <button disabled={busy} onClick={runTest}><Icon name="refresh" size={11} /> Test connection</button>
        {account && <button disabled={!canEdit} onClick={disconnect}><Icon name="logout" size={11} /> Disconnect</button>}
      </div>
      {savedMsg && <div className="okbox">SharePoint configuration saved.</div>}
      {account && <p className="hint">Signed in as <b>{account.username || account.name || 'connected account'}</b></p>}
      {busy && <p className="hint">Working…</p>}
      {err && <div className="errbox">{err}</div>}
      {test && (test.ok
        ? <div className="okbox">Connection OK — site <b>{test.siteName || '—'}</b>, drive <b>{test.driveName || '—'}</b>{test.webUrl ? <> · {test.webUrl}</> : null}</div>
        : <div className="errbox">{test.message || 'Connection failed.'}</div>)}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: '12.5px' }}>Azure app registration — setup steps</summary>
        <ol className="hint" style={{ margin: '6px 0 0 18px', lineHeight: 1.7 }}>
          <li>Azure Portal → App registrations → New registration</li>
          <li>Supported account types: multitenant (accounts in any organisational directory)</li>
          <li>Authentication → add a Single-page application platform with the deployed staging and production URLs</li>
          <li>API permissions → Microsoft Graph → delegated: <b>User.Read</b>, <b>Files.ReadWrite.All</b>, <b>Sites.ReadWrite.All</b></li>
          <li>Copy the Application (client) ID into this card</li>
        </ol>
      </details>
    </div>
  )
}

export default function Admin() {
  const store = useStore()
  const nav = useNavigate()
  const role = store.role
  const canEdit = isAdminRole(role) || role === 'LJS'
  const config = store.config || {}
  const uploads = config.uploads || {}
  const ai = config.aiModel || {}

  // AI model card — local draft, committed via saveAiModel.
  const [provider, setProvider] = useState(ai.provider || 'Google')
  const [model, setModel] = useState(ai.model || 'gemini-3.6-flash')
  const [customModel, setCustomModel] = useState(ai.customModel || '')
  const [endpoint, setEndpoint] = useState(ai.endpoint || '')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // null | { ok, model, ms }
  const [savingAi, setSavingAi] = useState(false)
  const [saveResult, setSaveResult] = useState(null)

  // Uploads card drafts.
  const [supplier, setSupplier] = useState('')
  const [plVersion, setPlVersion] = useState('')
  const [newKyc, setNewKyc] = useState('')

  // Route-level gate AFTER the hooks (an early return before them would change
  // the hook count when the persona flips while /admin is mounted). Approval
  // thresholds and margin floors are commercial config — PERMS roles only.
  if (!canSeePage(role, 'admin')) {
    return (
      <div className="page">
        <h2>Admin — configuration</h2>
        <div className="restricted" style={{ maxWidth: 520 }}>
          Restricted — configuration is visible to administrators and LJS only.
        </div>
      </div>
    )
  }

  const saveAi = async () => {
    setSaveResult(null)
    setTestResult(null)
    setSavingAi(true)
    try {
      if (provider !== FALLBACK_PROVIDER && apiKey && !usesVercelAi()) await saveAiKey(apiKey, role)
      store.saveAiModel({ provider, model: provider === FALLBACK_PROVIDER ? '' : model, customModel, endpoint,
        configured: provider === FALLBACK_PROVIDER || ai.configured || Boolean(apiKey) })
      setApiKey('')
      setSaveResult({ ok: true, message: 'AI configuration saved securely.' })
    } catch (e) {
      setSaveResult({ ok: false, message: String((e && e.message) || e) })
    } finally {
      setSavingAi(false)
    }
  }
  // Real round-trip through the Supabase Edge Function to the model.
  const testAi = async () => {
    setTesting(true); setTestResult(null)
    const res = await testConnection(isCustomModel(model) ? customModel : model)
    setTesting(false)
    setTestResult(res)
    if (res.ok) store.saveAiModel({ ...ai, provider, model, customModel, endpoint, configured: true })
  }

  const patchList = (listKey, i, itemPatch) =>
    store.updateConfig({ [listKey]: config[listKey].map((x, j) => (j === i ? { ...x, ...itemPatch } : x)) })

  const userCounts = ['Active', 'Pending', 'Suspended']
    .map(st => [st, (store.users || []).filter(u => u.status === st).length])

  const thresholds = config.approvalThresholds || {}
  const aiTh = config.aiThresholds || {}
  const amber = config.amberFee || {}

  return (
    <div className="page">
      <h2>Admin — configuration</h2>
      <div className="toolbar">
        <span className="hint">Configuration is separated from demo data. Changes update behaviour immediately and are audited.</span>
        <span className="spacer" />
        <DemoDataControls size={12} />
      </div>

      {!canEdit && (
        <div className="warn-box">Read-only — sign in as an administrator to change configuration</div>
      )}

      <div className="admin-grid">

        {/* 1 — Users & roles */}
        <div className="admin-card">
          <h3><Icon name="shield" size={14} /> Users &amp; roles</h3>
          {userCounts.map(([st, n]) => (
            <div key={st} className="arow"><span>{st} accounts</span><b>{n}</b></div>
          ))}
          <div className="admin-actions">
            <button onClick={() => nav('/users')}><Icon name="users" size={11} /> Manage users &amp; roles</button>
          </div>
          <p className="hint">AI Copilot is a system actor, not a login role.</p>
        </div>

        {/* 2 — Ownership rules */}
        <div className="admin-card">
          <h3><Icon name="target" size={14} /> Ownership rules</h3>
          {(config.ownershipRules || []).map((r, i) => (
            <div key={i} className="arow">
              <input type="text" value={r.region || ''} disabled={!canEdit} style={{ flex: 1, minWidth: 160 }}
                onChange={e => patchList('ownershipRules', i, { region: e.target.value })} />
              <select value={r.owner} disabled={!canEdit} style={{ width: 'auto' }}
                onChange={e => patchList('ownershipRules', i, { owner: e.target.value })}>
                {OWNERS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <p className="hint">Suggested owner on intake. Overriding a routed owner requires LJS or AH with a mandatory reason.</p>
        </div>

        {/* 3 — AI model configuration */}
        <div className="admin-card" style={{ gridColumn: '1 / -1' }}>
          <h3>
            <Icon name="sparkles" size={14} /> AI model configuration
            <span style={{ marginLeft: 'auto' }}>
              {provider === FALLBACK_PROVIDER
                ? <Chip tone="state-Review">Built-in fallback</Chip>
                : testResult?.ok
                ? <Chip tone="state-Accepted">Proxy reachable</Chip>
                : ai.configured
                  ? <Chip tone="state-Accepted">Proxy configured</Chip>
                  : <Chip tone="grey">Proxy not configured</Chip>}
            </span>
          </h3>
          <p className="hint">
            Chooses which model powers lead extraction, tender parsing, clarification suggestions and
            email drafting. Calls go through the <code>ai</code> Supabase Edge Function — the API key
            lives in that function's secrets and never reaches this browser.
            {ai.updatedBy ? <> Active: <b>{ai.provider} — {isCustomModel(ai.model) ? (ai.customModel || '(model id not set)') : ai.model}</b> · set by {ai.updatedBy} on {ai.updatedOn}</> : null}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0 12px' }}>
            <label className="afield">Provider
              <select value={provider} disabled={!canEdit}
                onChange={e => { setProvider(e.target.value); setModel('') }}>
                <option value="">Select a provider…</option>
                {Object.keys(AI_PROVIDERS).map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="afield">Model
              <select value={model} disabled={!canEdit || !provider} onChange={e => setModel(e.target.value)}>
                <option value="">{provider === FALLBACK_PROVIDER ? 'Not used with fallback' : provider ? 'Select a model…' : 'Choose a provider first'}</option>
                {(AI_PROVIDERS[provider] || []).map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            {!usesVercelAi() && <label className="afield">Gemini API key
              <input type="password" value={apiKey} disabled={!canEdit || savingAi || provider === FALLBACK_PROVIDER}
                autoComplete="new-password" placeholder={ai.configured ? 'Saved securely' : 'Paste Gemini API key'}
                onChange={e => setApiKey(e.target.value)} />
            </label>}
          </div>
          <div className="admin-actions">
            <button className="primary" disabled={!canEdit || savingAi} onClick={saveAi}>Save configuration</button>
            <button disabled={!canEdit || testing || savingAi || provider === FALLBACK_PROVIDER} onClick={testAi}>
              <Icon name="play" size={11} /> Test connection
            </button>
          </div>
          {savingAi && <p className="hint">Saving AI configuration securely…</p>}
          {saveResult?.ok && <div className="okbox">{saveResult.message}</div>}
          {saveResult && !saveResult.ok && <div className="errbox">{saveResult.message}</div>}
          {testing && <p className="hint">Calling the model through the proxy…</p>}
          {testResult?.ok && (
            <div className="okbox">
              Connection OK — <b>{testResult.model}</b> responded in {testResult.ms} ms.
            </div>
          )}
          {testResult && !testResult.ok && (
            <div className="errbox">
              {testResult.error || 'No response.'} {usesVercelAi() ? <>Check the Vercel Production <code>GEMINI_API_KEY</code> and redeploy.</> : <>Check that the configured AI function is deployed.</>}
              <code> GEMINI_API_KEY</code> is set in its secrets — details are in the browser console.
            </div>
          )}
          <WarnBox>
            For Built-in fallback, no key is required. AI credentials are stored server-side and are never returned to this page.
          </WarnBox>
        </div>

        {/* 4 — AI confidence thresholds */}
        <div className="admin-card">
          <h3><Icon name="bot" size={14} /> AI confidence thresholds</h3>
          <NumField label="High ≥ %" value={aiTh.high} disabled={!canEdit}
            onChange={v => store.updateConfig({ aiThresholds: { ...aiTh, high: v } })} />
          <NumField label="Medium ≥ %" value={aiTh.med} disabled={!canEdit}
            onChange={v => store.updateConfig({ aiThresholds: { ...aiTh, med: v } })} />
          <p className="hint">Below medium blocks stage completion; source conflicts always need human resolution.</p>
        </div>

        {/* 5 — Approval thresholds */}
        <div className="admin-card">
          <h3><Icon name="checkCircle" size={14} /> Approval thresholds</h3>
          <NumField label="GM auto-release ≥ %" value={thresholds.gmAuto} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, gmAuto: v } })} />
          <NumField label="Discount auto-release ≤ %" value={thresholds.discAuto} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, discAuto: v } })} />
          <NumField label="GM floor before LJS+AH %" value={thresholds.gmLjs} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, gmLjs: v } })} />
          <NumField label="Discount ceiling before LJS+AH %" value={thresholds.discLjs} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, discLjs: v } })} />
        </div>

        {/* 6 — Customer-class rules & Amber fee */}
        <div className="admin-card">
          <h3><Icon name="flag" size={14} /> Customer-class rules &amp; Amber fee</h3>
          {CLASS_RULES.map(([cls, rule]) => (
            <div key={cls} className="arow"><span className={`pill ${cls}`}>{cls}</span><span className="hint" style={{ textAlign: 'right' }}>{rule}</span></div>
          ))}
          <NumField label="Amber pre-quote processing fee (INR)" value={amber.amount} disabled={!canEdit}
            onChange={v => store.updateConfig({ amberFee: { ...amber, amount: v } })} />
          <NumField label="Amber timer (days)" value={amber.days} disabled={!canEdit}
            onChange={v => store.updateConfig({ amberFee: { ...amber, days: v } })} />
          <p className="hint">Fee is adjustable against the order value once the PO lands.</p>
        </div>

        {/* Lead workflow controls */}
        <div className="admin-card">
          <h3><Icon name="clock" size={14} /> Lead workflow controls</h3>
          <p className="hint">These rules control expiry and fast-track behavior for active leads.</p>
          <NumField label="KYC deadline (days)" value={config.leadDeadlines?.kycDays ?? 7} disabled={!canEdit}
            onChange={v => store.updateConfig({ leadDeadlines: { ...(config.leadDeadlines || {}), kycDays: v } })} />
          <NumField label="Clarification deadline (days)" value={config.leadDeadlines?.clarificationDays ?? 7} disabled={!canEdit}
            onChange={v => store.updateConfig({ leadDeadlines: { ...(config.leadDeadlines || {}), clarificationDays: v } })} />
          {/* Clarification mail goes out from here until a lead is assigned,
              and from the assigned salesperson once it is. */}
          <label className="afield">Common mailbox
            <input type="email" value={config.commonMailbox || ''} disabled={!canEdit}
              placeholder={DEFAULT_COMMON_MAILBOX}
              onChange={e => store.updateConfig({ commonMailbox: e.target.value })} />
          </label>
          <p className="hint">
            Unassigned leads send clarification mail from this address; once a lead is assigned it
            sends from the salesperson, copying this mailbox.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={config.fastTrack?.enabled !== false} disabled={!canEdit}
              onChange={e => store.updateConfig({ fastTrack: { ...(config.fastTrack || {}), enabled: e.target.checked } })} />
            Enable existing Green-customer fast track
          </label>
          <label className="afield">Fast-track customer class
            <select value={config.fastTrack?.customerStatus || 'Green'} disabled={!canEdit}
              onChange={e => store.updateConfig({ fastTrack: { ...(config.fastTrack || {}), customerStatus: e.target.value } })}>
              {['Green', 'Blue', 'Amber', 'Red'].map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>

        {/* 7 — KYC checklist */}
        <div className="admin-card">
          <h3><Icon name="clipboardCheck" size={14} /> KYC checklist</h3>
          {(config.kycItems || []).map((k, i) => (
            <div key={k + i} className="arow">
              <span>{k}</span>
              {canEdit && (
                <button title="Remove item"
                  onClick={() => store.updateConfig({ kycItems: config.kycItems.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={10} />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="admin-actions">
              <input type="text" value={newKyc} placeholder="New checklist item"
                style={{ flex: 1, minWidth: 140 }} onChange={e => setNewKyc(e.target.value)} />
              <button onClick={() => {
                const v = newKyc.trim()
                if (v && !config.kycItems.includes(v)) store.updateConfig({ kycItems: [...config.kycItems, v] })
                setNewKyc('')
              }}><Icon name="plus" size={11} /> Add</button>
            </div>
          )}
        </div>

        {/* 8 — Price-list & rate registries */}
        <div className="admin-card">
          <h3><Icon name="tag" size={14} /> Price-list &amp; rate registries</h3>
          {(uploads.priceLists || []).map((p, i) => (
            <div key={i} className="arow">
              <span>{p.supplier} — {p.name}<br /><span className="hint">{p.version} · uploaded {p.uploaded}</span></span>
              <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {p.dummy && <Chip tone="state-Review">DUMMY — replace with actual</Chip>}
                <Chip tone={p.status === 'Expired' ? 'state-Rejected' : 'state-Accepted'}>{p.status || 'Current'}</Chip>
              </span>
            </div>
          ))}
          <div className="arow"><span>Rate sheet — India (INR, GST 18%)</span><Chip tone="state-Accepted">Current</Chip></div>
          <div className="arow"><span>Rate sheet — International (USD)</span><Chip tone="state-Accepted">Current</Chip></div>
          <p className="hint">Rates are editable on the Price Lists page; registries here track which versions are live.</p>
        </div>

        {/* 9 — Document uploads */}
        <div className="admin-card" style={{ gridColumn: '1 / -1' }}>
          <h3><Icon name="upload" size={14} /> Document uploads</h3>
          <p className="hint">Metadata only in the demo — file contents are not stored.</p>

          <div className="section-title" style={{ marginTop: 6 }}>Supplier price list</div>
          <div className="admin-actions">
            <input type="text" value={supplier} placeholder="Supplier (e.g. B&K)" disabled={!canEdit}
              style={{ flex: 1, minWidth: 120 }} onChange={e => setSupplier(e.target.value)} />
            <input type="text" value={plVersion} placeholder="Version (e.g. 2026-Q3)" disabled={!canEdit}
              style={{ flex: 1, minWidth: 120 }} onChange={e => setPlVersion(e.target.value)} />
            <FileButton primary label="Upload price list" disabled={!canEdit}
              onFile={f => {
                store.addUpload('priceLists', {
                  supplier: supplier.trim() || 'Unspecified supplier',
                  name: f.name, size: f.size,
                  version: plVersion.trim() || '—', status: 'Current',
                })
                setSupplier(''); setPlVersion('')
              }} />
          </div>

          <div className="section-title" style={{ marginTop: 10 }}>Spare-parts interchangeability matrix</div>
          <p className="hint">Equivalent models across manufacturers.</p>
          {uploads.interchangeability ? (
            <div className="arow">
              <span>{uploads.interchangeability.name}<br /><span className="hint">uploaded {uploads.interchangeability.uploaded}</span></span>
              <FileButton label="Replace" disabled={!canEdit}
                onFile={f => store.addUpload('interchangeability', { name: f.name, size: f.size })} />
            </div>
          ) : (
            <div className="admin-actions">
              <FileButton primary label="Upload matrix" disabled={!canEdit}
                onFile={f => store.addUpload('interchangeability', { name: f.name, size: f.size })} />
            </div>
          )}

          <div className="section-title" style={{ marginTop: 10 }}>Customer classification</div>
          <p className="hint">Customer classification Excel from the accounting system (offline upload — no direct integration in phase 1).</p>
          {uploads.customerClassification ? (
            <div className="arow">
              <span>{uploads.customerClassification.name}<br /><span className="hint">uploaded {uploads.customerClassification.uploaded}</span></span>
              <FileButton label="Replace" disabled={!canEdit}
                onFile={f => store.addUpload('customerClassification', { name: f.name, size: f.size })} />
            </div>
          ) : (
            <div className="admin-actions">
              <FileButton primary label="Upload classification" disabled={!canEdit}
                onFile={f => store.addUpload('customerClassification', { name: f.name, size: f.size })} />
            </div>
          )}
        </div>

        {/* 10 — Templates & reminders */}
        <div className="admin-card">
          <h3><Icon name="fileText" size={14} /> Proposal templates &amp; reminder rules</h3>
          {(config.templates || []).map(t => (
            <div key={t} className="arow"><span>{t}</span><Chip tone="grey">Template</Chip></div>
          ))}
          {(config.reminders || []).map((r, i) => (
            <label key={r.id || i} className="check-row">
              <input type="checkbox" checked={!!r.on} disabled={!canEdit}
                onChange={() => patchList('reminders', i, { on: !r.on })} />
              {r.label || r.name}
            </label>
          ))}
        </div>

        {/* 11 — Connector state */}
        <div className="admin-card">
          <h3><Icon name="globe" size={14} /> Connector state</h3>
          {(config.connectors || []).map(c => (
            <div key={c.id} className="arow">
              <span><span className={`conn-dot ${connDotClass(c.state)}`} />{c.label || c.name}</span>
              {c.id === 'sharepoint' ? (
                <span className="hint">Configured on the SharePoint card</span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="hint">{c.state}</span>
                  <button disabled={!canEdit} title="Cycle health state"
                    onClick={() => store.setConnectorState(c.id, CONNECTOR_CYCLE[c.state] || 'Healthy')}>
                    <Icon name="refresh" size={10} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        {/* 12 — SharePoint connector */}
        <SharePointCard canEdit={canEdit} />

      </div>
    </div>
  )
}
