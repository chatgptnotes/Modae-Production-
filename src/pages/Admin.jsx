import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { OWNERS, MILESTONES, seedConfig } from '../seed.js'
import { isAdminRole, canSeePage, displayRoleLabel } from '../utils.js'
import { Icon } from '../icons.jsx'
import { Chip, Modal, DemoDataControls } from '../ui.jsx'
import { uploadAdminTemplate } from '../filestore.js'
import { putFiles } from '../leadBlobs.js'
import WorkbookPreview from '../proposal/WorkbookPreview.jsx'
import { parseProposalWorkbook, serializeProposalWorkbook, updateWorkbookCell } from '../proposal/workbook.js'
import { analyzeProposalTemplate } from '../proposal/templateMapping.js'
import { DEFAULT_COMMON_MAILBOX } from '../leadClarification.js'
import { DEFAULT_CUSTOMER_CLASSES } from '../customerClasses.js'
import { parsePriceListFile } from '../priceListImport.js'
import { normalizedCurrencyRates } from '../currency.js'
import { DEFAULT_KYC_VALIDATION, kycValidationConfig } from '../kycValidation.js'
import { DEFAULT_CLAUSES } from '../clauses.js'
import { mintId } from '../ids.js'
import { BUILT_IN_PROPOSAL_TEMPLATES, loadProposalTemplateBuffer, resolveProposalTemplate } from '../proposal/templateRegistry.js'
import { runTaskResult } from '../ai.js'

// Admin — every runtime rule the app obeys, in one card grid. Data lives in
// store.config; all changes are audited by the store mutators.

const CLASS_ORDER = ['Green', 'Blue', 'Amber', 'Red']
const REGION_OPTIONS = ['North & West India', 'South & East India', 'Unclassified leads']
const PRICING_APPROVER_OPTIONS = ['AH', 'LJS', 'AN']

const isCustomModel = m => {
  const s = (m || '').toLowerCase()
  return s.includes('enter below') || s.includes('deployment')
}
const FALLBACK_PROVIDER = 'Built-in fallback'
const DEMO_CONTROLS_PASSWORD = '32605'
const TEMPLATE_LANES = BUILT_IN_PROPOSAL_TEMPLATES
const ADMIN_TABS = [
  { id: 'workflow', label: 'Workflow & governance', icon: 'shield' },
  { id: 'documents', label: 'Documents & templates', icon: 'upload' },
]
const WORKFLOW_SUB_TABS = [
  { id: 'access', label: 'Access & routing', description: 'Users, ownership rules, and region mappings', icon: 'target' },
  { id: 'clauses', label: 'T&C Clause Library', description: 'Proposal validity, payment terms, and guarantees', icon: 'fileText' },
  { id: 'commercial', label: 'Commercial & automation', description: 'Guided margins, lead controls, and mailbox', icon: 'gear' },
  { id: 'customer', label: 'Customer governance', description: 'Customer class rules and KYC checklist', icon: 'flag' },
]

function NumField({ label, value, disabled, onChange }) {
  return (
    <label className="afield">{label}
      <input type="number" value={value ?? 0} disabled={disabled}
        onChange={e => onChange(Number(e.target.value) || 0)} />
    </label>
  )
}

// The service day rates every service quote and invoice is priced from. These
// used to live in source with no way to change them, while a second, unrelated
// role table on Price Lists claimed to be editable. One sheet now, edited here.
const RATE_FIELDS = [
  ['engineerDay', 'Engineer / day'], ['seniorDay', 'Senior engineer / day'],
  ['travelDay', 'Travel / day'], ['otHour', 'Overtime / hour'],
  ['weekendPct', 'Weekend premium (%)'], ['standbyDay', 'Standby / day'],
  ['flight', 'Flight (each way)'], ['hotelNight', 'Hotel / night'],
  ['transportDay', 'Local transport / day'], ['perDiem', 'Per diem'],
  ['tools', 'Tools & consumables'],
]

function ServiceRateSheetEditor({ canEdit }) {
  const store = useStore()
  const [sheet, setSheet] = useState('India')
  const current = store.rateSheets[sheet]
  const unit = current.currency === 'INR' ? 'K₹' : 'USD'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        {['India', 'International'].map(name => (
          <button key={name} className={sheet === name ? 'primary' : ''} onClick={() => setSheet(name)}>{name}</button>
        ))}
        <Chip tone="state-Accepted">{current.currency} · {unit}</Chip>
      </div>
      {RATE_FIELDS.map(([key, label]) => (
        <NumField key={key} label={`${label}${key === 'weekendPct' ? '' : ` (${unit})`}`}
          value={current.rates[key]} disabled={!canEdit}
          onChange={v => store.updateRateSheets(sheet, { rates: { [key]: Math.max(0, v) } })} />
      ))}
      <NumField label="GST (%)" value={current.gst} disabled={!canEdit}
        onChange={v => store.updateRateSheets(sheet, { gst: Math.max(0, Math.min(100, v)) })} />
      <p className="hint">
        Drives the service estimate, the customer-facing rate schedule and the invoice.
        Changing a rate here is audited and applies to work priced from now on.
      </p>
    </div>
  )
}

// A real <input type="file"> behind a button — metadata only, contents are
// never read or stored in the demo.
function FileButton({ label, disabled, onFile, variant = 'secondary', accept }) {
  const ref = useRef(null)
  return (
    <>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); e.target.value = '' }} />
      <button className={variant} disabled={disabled} onClick={() => ref.current && ref.current.click()}>
        <Icon name="upload" size={11} /> {label}
      </button>
    </>
  )
}

const REQUIRES_OPTIONS = [
  ['none', 'Nothing — cleared on sight'],
  ['documents', 'A document checklist'],
  ['fee', 'A payment confirmation'],
  ['jointApproval', 'An approval record'],
]
const SEVERITY_OPTIONS = ['block', 'wait', 'info']
const CLASS_APPROVER_OPTIONS = ['AH', 'LJS', 'AN']

// One collapsed row per class; expanding reveals just that class's rules, so
// the resting card stays as short as the four-input version it replaced.
function ClassRuleRow({ cls, rule, canEdit, open, onToggle, checklistNames, onPatch, onPatchVerification, onPatchGate }) {
  const verification = rule?.verification || {}
  const gate = rule?.gate || null
  const requiresLabel = (REQUIRES_OPTIONS.find(([k]) => k === verification.requires) || [])[1] || 'Nothing'
  const summary = [
    requiresLabel,
    verification.deadlineDays ? `${verification.deadlineDays} days` : null,
    gate ? `${gate.severity}s at ${gate.milestone}` : 'no gate',
    gate?.approvers?.length ? gate.approvers.join(' + ') : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="class-rule">
      <button type="button" className="class-rule-head" aria-expanded={open} onClick={onToggle}>
        <span className={`pill risk-badge ${cls}`} aria-label={`${cls} customer risk level`}>{cls}</span>
        <span className="class-rule-summary">{summary}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={11} />
      </button>
      {open && (
        <div className="class-rule-body">
          <label className="check-row">
            <input type="checkbox" checked={verification.required !== false} disabled={!canEdit}
              onChange={e => onPatchVerification({ required: e.target.checked })} />
            Requires verification before registration
          </label>

          {verification.required !== false && (
            <>
              <label className="afield">What must be provided
                <select value={verification.requires || 'none'} disabled={!canEdit}
                  onChange={e => onPatchVerification({ requires: e.target.value })}>
                  {REQUIRES_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              {verification.requires === 'documents' && (
                <label className="afield">Document checklist
                  <select value={verification.checklist || ''} disabled={!canEdit}
                    onChange={e => onPatchVerification({ checklist: e.target.value })}>
                    {checklistNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              )}

              {verification.requires === 'jointApproval' && (
                <label className="afield">Approval type
                  <input type="text" value={verification.approvalType || ''} disabled={!canEdit}
                    onChange={e => onPatchVerification({ approvalType: e.target.value })} />
                </label>
              )}

              <NumField label="Deadline (days, 0 = none)" value={verification.deadlineDays ?? 0} disabled={!canEdit}
                onChange={v => onPatchVerification({ deadlineDays: Math.max(0, v) })} />
            </>
          )}

          {gate && (
            <>
              <div className="section-title" style={{ marginTop: 8 }}>Opportunity gate</div>
              <label className="afield">Blocks from milestone
                <select value={gate.milestone} disabled={!canEdit}
                  onChange={e => onPatchGate({ milestone: e.target.value })}>
                  {MILESTONES.map(m => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className="afield">Severity
                <select value={gate.severity} disabled={!canEdit}
                  onChange={e => onPatchGate({ severity: e.target.value })}>
                  {SEVERITY_OPTIONS.map(x => <option key={x}>{x}</option>)}
                </select>
              </label>
              <div className="afield">Signed off by
                <div className="admin-approver-options">
                  {CLASS_APPROVER_OPTIONS.map(role => {
                    const selected = (gate.approvers || []).includes(role)
                    return <label key={role}>
                      <input type="checkbox" checked={selected}
                        disabled={!canEdit || (selected && (gate.approvers || []).length === 1)}
                        onChange={e => {
                          const current = gate.approvers || []
                          const next = e.target.checked
                            ? [...new Set([...current, role])]
                            : current.filter(item => item !== role)
                          if (next.length) onPatchGate({ approvers: next })
                        }} />
                      {displayRoleLabel(role)}
                    </label>
                  })}
                </div>
              </div>
              {(gate.approvers || []).length > 1 && (
                <label className="check-row">
                  <input type="checkbox" checked={!!gate.anyOf} disabled={!canEdit}
                    onChange={e => onPatchGate({ anyOf: e.target.checked })} />
                  Any one of them is enough (otherwise all must sign)
                </label>
              )}
              <label className="check-row">
                <input type="checkbox" checked={gate.exceptionWaivable !== false} disabled={!canEdit}
                  onChange={e => onPatchGate({ exceptionWaivable: e.target.checked })} />
                May be waived by an approved milestone exception
              </label>
            </>
          )}

          <label className="afield">Payment terms on the proposal
            <input type="text" value={rule?.paymentTerms || ''} disabled={!canEdit}
              onChange={e => onPatch({ paymentTerms: e.target.value })} />
          </label>
        </div>
      )}
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
  // Manual AI model selection is not exposed in Admin yet. Template mapping
  // still receives the routine model hint; the server applies its own routing.
  const provider = 'Google'
  const model = 'gemini-3.1-flash-lite'
  const customModel = ''


  // Uploads card drafts.
  const [supplier, setSupplier] = useState('')
  const [plVersion, setPlVersion] = useState('')
  const [newKyc, setNewKyc] = useState('')
  const [openClass, setOpenClass] = useState('')
  const [demoPassword, setDemoPassword] = useState('')
  const [demoUnlocked, setDemoUnlocked] = useState(false)
  const [demoPasswordError, setDemoPasswordError] = useState('')
  const [templateBusy, setTemplateBusy] = useState('')
  const [templateError, setTemplateError] = useState('')
  const [templateAnalysis, setTemplateAnalysis] = useState(null)
  const [templatePreview, setTemplatePreview] = useState(null)
  const [templatePreviewBusy, setTemplatePreviewBusy] = useState(false)
  const [templatePreviewError, setTemplatePreviewError] = useState('')
  const [templateDirty, setTemplateDirty] = useState(false)
  const [currencyRateDraft, setCurrencyRateDraft] = useState({})
  const [adminView, setAdminView] = useState('workflow')
  const [workflowView, setWorkflowView] = useState('access')
  const [regionSearch, setRegionSearch] = useState('')
  const [routingReview, setRoutingReview] = useState(null)
  const [routingReviewBusy, setRoutingReviewBusy] = useState(false)

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

  const patchList = (listKey, i, itemPatch) =>
    store.updateConfig({ [listKey]: config[listKey].map((x, j) => (j === i ? { ...x, ...itemPatch } : x)) })

  const proposalTemplates = uploads.proposalTemplates || []
  const kycTemplates = uploads.kycTemplates || {}
  const currencyRates = normalizedCurrencyRates(config.currencyRates)
  const currencies = [...new Set(['EUR', 'USD', ...Object.keys(currencyRates)].filter(currency => currency !== 'INR' && currency !== 'GBP'))]
  const uploadedTemplateFor = lane => proposalTemplates.find(item => item.lane === lane && item.status === 'Current')
  const templateInfo = lane => resolveProposalTemplate(config, lane)

  const kycTemplateLane = itemName => `kyc-${String(itemName || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  const uploadKycTemplate = async (itemName, file) => {
    const lane = kycTemplateLane(itemName)
    setTemplateError(''); setTemplateBusy(lane)
    try {
      const stored = await uploadAdminTemplate(lane, file)
      store.saveKycTemplate(itemName, { name: file.name, type: file.type, size: file.size, ...stored })
    } catch (error) {
      setTemplateError(error?.message || 'KYC template upload failed')
    } finally {
      setTemplateBusy('')
    }
  }

  const openTemplate = async lane => {
    const info = templateInfo(lane)
    setTemplatePreview({ lane, info, workbook: null })
    setTemplatePreviewError('')
    setTemplatePreviewBusy(true)
    try {
      const workbook = parseProposalWorkbook(await loadProposalTemplateBuffer({ ...info, key: lane }), info.name || info.filename)
      setTemplatePreview({ lane, info, workbook })
      setTemplateDirty(false)
    } catch (error) {
      setTemplatePreviewError(error?.message || 'Template file could not be loaded')
    } finally {
      setTemplatePreviewBusy(false)
    }
  }

  const uploadTemplate = async (lane, file) => {
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setTemplateError('Proposal templates must be Excel workbooks (.xlsx or .xlsm).')
      return
    }
    setTemplateError(''); setTemplateBusy(lane)
    try {
      const workbook = parseProposalWorkbook(await file.arrayBuffer(), file.name)
      const analysis = await analyzeProposalTemplate(workbook, {
        model: isCustomModel(model) ? customModel : model,
        fallback: provider === FALLBACK_PROVIDER,
      })
      const stored = await uploadAdminTemplate(lane, file)
      const template = { lane, name: file.name, size: file.size, ...stored, mapping: analysis.mapping, mappingWarnings: analysis.warnings, mappingAi: analysis.ai }
      store.saveProposalTemplate(template)
      setTemplateAnalysis({ lane, ...analysis })
      setTemplatePreview({ lane, info: template, workbook })
      setTemplateDirty(false)
    } catch (error) {
      setTemplateError(error?.message || 'Template upload failed')
    } finally {
      setTemplateBusy('')
    }
  }

  const updatePreviewCell = (sheetName, rowIndex, columnIndex, value) => {
    setTemplatePreview(current => ({ ...current, workbook: updateWorkbookCell(current.workbook, sheetName, rowIndex, columnIndex, value) }))
    setTemplateDirty(true)
  }

  const saveTemplateEdits = async () => {
    if (!templatePreview?.workbook || !templateDirty) return
    setTemplateError(''); setTemplateBusy(templatePreview.lane)
    try {
      const bytes = serializeProposalWorkbook(templatePreview.workbook)
      const name = templatePreview.info.name.replace(/\.(xlsx|xlsm)$/i, '') + '.xlsx'
      const file = new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const workbook = parseProposalWorkbook(bytes, name)
      const analysis = await analyzeProposalTemplate(workbook, {
        model: isCustomModel(model) ? customModel : model,
        fallback: provider === FALLBACK_PROVIDER,
      })
      const stored = await uploadAdminTemplate(templatePreview.lane, file)
      const template = { lane: templatePreview.lane, name, size: file.size, ...stored, mapping: analysis.mapping, mappingWarnings: analysis.warnings, mappingAi: analysis.ai }
      store.saveProposalTemplate(template)
      setTemplateAnalysis({ lane: templatePreview.lane, ...analysis })
      setTemplatePreview(current => ({ ...current, info: template, workbook }))
      setTemplateDirty(false)
    } catch (error) {
      setTemplateError(error?.message || 'Template changes could not be saved')
    } finally {
      setTemplateBusy('')
    }
  }

  const userCounts = ['Active', 'Pending', 'Suspended']
    .map(st => [st, (store.users || []).filter(u => u.status === st).length])

  const classes = config.customerClasses || DEFAULT_CUSTOMER_CLASSES
  const checklistNames = [...new Set([...Object.keys(config.documentChecklists || {}), 'kycItems'])]
  // updateConfig is a shallow top-level merge, so the whole customerClasses
  // object goes with every write — that also keeps it one audit entry.
  const patchClass = (cls, patch) => store.updateConfig({
    customerClasses: { ...classes, [cls]: { ...classes[cls], ...patch } },
  })

  const thresholds = config.approvalThresholds || {}
  const aiTh = { ...seedConfig.aiThresholds, ...(config.aiThresholds || {}) }
  const kycValidation = kycValidationConfig(config)
  const amber = config.amberFee || {}
  const filteredStateRegions = (config.stateRegions || []).filter(item => {
    const query = regionSearch.trim().toLowerCase()
    if (!query) return true
    return `${item.name || ''} ${item.code || ''}`.toLowerCase().includes(query)
  })

  const reviewRouting = async () => {
    if (routingReviewBusy) return
    setRoutingReviewBusy(true)
    setRoutingReview(null)
    const result = await runTaskResult('admin.routing-review', {
      owners: OWNERS,
      regions: REGION_OPTIONS,
      ownershipRules: config.ownershipRules || [],
      stateRegions: config.stateRegions || [],
    }, { timeoutMs: 30000 })
    if (result.data?.data) {
      setRoutingReview({ ...result.data.data, model: result.data.model || result.model })
    } else {
      setRoutingReview({ status: 'unavailable', summary: result.error || 'AI routing review is unavailable. The deterministic routing rules remain active.' })
    }
    setRoutingReviewBusy(false)
  }

  const addClause = () => {
    if (!canEdit) return
    const existing = config.clauses || DEFAULT_CLAUSES
    store.saveClause({
      id: mintId('CL', existing),
      label: '',
      text: '',
      category: 'legal',
      routes: ['Project', 'Spares', 'Services'],
      scopes: ['domestic', 'international'],
      required: false,
    })
  }

  const unlockDemoControls = event => {
    event.preventDefault()
    if (demoPassword === DEMO_CONTROLS_PASSWORD) {
      setDemoUnlocked(true)
      setDemoPassword('')
      setDemoPasswordError('')
      return
    }
    setDemoPasswordError('Incorrect password.')
  }

  return (
    <div className="page admin-page">
      <header className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Workspace settings</p>
          <h2>Admin configuration</h2>
          <p className="admin-page-lede">Manage the rules, documents, and automation that shape the sales workspace.</p>
        </div>
        <div className="admin-page-actions">
          <DemoDataControls className="secondary" />
        </div>
      </header>

      {!canEdit && (
        <div className="warn-box">Read-only — sign in as an administrator to change configuration</div>
      )}

      <nav className="admin-tabs" role="tablist" aria-label="Admin settings categories">
        {ADMIN_TABS.map(tab => (
          <button key={tab.id} type="button" role="tab" className={adminView === tab.id ? 'active' : ''}
            aria-selected={adminView === tab.id} aria-controls={`admin-panel-${tab.id}`} id={`admin-tab-${tab.id}`}
            onClick={() => setAdminView(tab.id)}>
            <Icon name={tab.icon} size={13} /> {tab.label}
          </button>
        ))}
      </nav>

      <div className="admin-layout">
        <section id="admin-panel-workflow" className={`admin-panel ${adminView === 'workflow' ? 'is-active' : ''}`}
          role="tabpanel" aria-labelledby="admin-tab-workflow" hidden={adminView !== 'workflow'}>
        <div className="admin-workflow-layout">
        <div className="admin-workflow-main">
        <nav className="admin-section-rail admin-workflow-tabs" aria-label="Workflow settings sections" role="tablist">
          {WORKFLOW_SUB_TABS.map(tab => (
            <button key={tab.id} type="button" role="tab"
              className={workflowView === tab.id ? 'active' : ''}
              aria-selected={workflowView === tab.id}
              aria-controls={`admin-subpanel-${tab.id}`}
              id={`admin-subtab-${tab.id}`}
              onClick={() => setWorkflowView(tab.id)}>
              <span className="admin-workflow-tab-icon"><Icon name={tab.icon} size={13} /></span>
              <span><b>{tab.label}</b><small>{tab.description}</small></span>
            </button>
          ))}
        </nav>
        <div id="admin-subpanel-clauses" className="admin-subpanel" role="tabpanel" aria-labelledby="admin-subtab-clauses" hidden={workflowView !== 'clauses'}>
        <section className="clause-library-section" id="admin-clauses">
          <h3><Icon name="fileText" size={14} /> Terms &amp; conditions clause library</h3>
          <p className="hint">Maintain reusable clauses. Changes are versioned through the normal audit log.</p>
          <div className="clause-library-table-wrap">
          <table className="clause-library-table">
            <colgroup>
              <col className="clause-library-title-col" />
              <col />
              <col className="clause-library-actions-col" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Clause title</th>
                <th scope="col">Clause text</th>
                <th scope="col" className="clause-library-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
            {(config.clauses || DEFAULT_CLAUSES).map(clause => (
              <tr key={clause.id}>
                <td className="clause-library-title-cell">
                  <label className="sr-only" htmlFor={`clause-title-${clause.id}`}>Clause title</label>
                  <input id={`clause-title-${clause.id}`} className="clause-library-title-field" aria-label={`${clause.id} clause title`} value={clause.label} disabled={!canEdit}
                    onChange={e => store.updateClause(clause.id, { label: e.target.value })} />
                </td>
                <td className="clause-library-text-cell">
                  <label className="sr-only" htmlFor={`clause-text-${clause.id}`}>Clause text</label>
                  <textarea aria-label={`${clause.id} clause text`} value={clause.text} disabled={!canEdit}
                    id={`clause-text-${clause.id}`} className="clause-library-text-field" onChange={e => store.updateClause(clause.id, { text: e.target.value })} rows={3} />
                </td>
                <td className="clause-library-actions-cell">
                  <button type="button" className="secondary clause-library-remove" disabled={!canEdit}
                    onClick={() => store.removeClause(clause.id)}>Remove</button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
          </div>
          <button type="button" className="secondary clause-library-add" disabled={!canEdit} onClick={addClause}>+ Add New Clause</button>
        </section>
        </div>
        <div className="admin-setting-groups">
        <section id="admin-subpanel-access" className="admin-setting-group" role="tabpanel" aria-labelledby="admin-subtab-access" hidden={workflowView !== 'access'}>
          <div className="admin-setting-grid admin-access-layout">
          <section className="admin-access-controls-panel" aria-labelledby="admin-access-controls-title">
            <header className="admin-access-controls-head">
              <div>
                <h3 id="admin-access-controls-title">Access &amp; Routing Controls</h3>
                <p>Configure user permissions, regional routing, and opportunity ownership.</p>
              </div>
              <button type="button" className="secondary admin-routing-review-button" disabled={!canEdit || routingReviewBusy}
                onClick={reviewRouting}>
                <Icon name="bot" size={12} /> {routingReviewBusy ? 'Reviewing routing…' : 'Review routing with AI'}
              </button>
            </header>
            {routingReview && (
              <div className={`admin-routing-review admin-routing-review--${routingReview.status || 'review'}`} role="status">
                <div className="admin-routing-review-head">
                  <strong>{routingReview.status === 'ok' ? 'AI found no routing issues' : routingReview.status === 'unavailable' ? 'AI routing review unavailable' : 'AI routing review'}</strong>
                  {routingReview.model && <span className="hint">{routingReview.model}</span>}
                </div>
                <p>{routingReview.summary}</p>
                {!!routingReview.findings?.length && (
                  <ul>
                    {routingReview.findings.map((finding, index) => (
                      <li key={`${finding.code || finding.item || 'finding'}-${index}`}>
                        <b>{finding.severity || 'review'}:</b> {finding.item || 'Routing configuration'} — {finding.reason}
                        {finding.suggestion && <span> Suggested: {finding.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="admin-access-controls-grid">

        {/* 1 — Users & roles */}
        <div className="admin-access-column">
          <h3><Icon name="shield" size={14} /> Users &amp; roles</h3>
          {userCounts.map(([st, n]) => (
            <div key={st} className="arow"><span>{st} accounts</span><b>{n}</b></div>
          ))}
          <div className="admin-actions admin-actions-end">
            <button onClick={() => nav('/users')}><Icon name="users" size={11} /> Manage users &amp; roles</button>
          </div>
          <p className="hint">AI Copilot is a system actor, not a login role.</p>
        </div>

        {/* 2 — Ownership rules */}
        <div className="admin-access-column">
          <h3><Icon name="target" size={14} /> Ownership rules</h3>
          {(config.ownershipRules || []).map((r, i) => (
            <div key={i} className="arow admin-ownership-row">
              <input type="text" value={r.region || ''} disabled={!canEdit}
                onChange={e => patchList('ownershipRules', i, { region: e.target.value })} />
              <label className="admin-select-with-badge">
                <span className={`admin-owner-badge owner-${String(r.owner || '').toLowerCase()}`}>{r.owner}</span>
                <select aria-label={`Owner for ${r.region || 'region'}`} value={r.owner} disabled={!canEdit}
                  onChange={e => patchList('ownershipRules', i, { owner: e.target.value })}>
                  {OWNERS.map(o => <option key={o}>{o}</option>)}
                </select>
              </label>
            </div>
          ))}
          <p className="hint">Suggested owner on intake. Overriding a routed owner requires LJS or AH with a mandatory reason.</p>
        </div>

            </div>
          </section>

        {/* 2b — State → region mapping */}
        <div className="admin-card admin-card--list admin-state-map-card">
          <h3><Icon name="target" size={14} /> State → region mapping</h3>
          <p className="hint">Which Ownership-rules region each Indian state/UT feeds into. Location text typed on lead intake is matched to a state, then routed here.</p>
          <label className="admin-region-search">
            <span className="sr-only">Search states and Union Territories</span>
            <Icon name="search" size={12} />
            <input type="search" value={regionSearch} placeholder="Search state or UT"
              onChange={e => setRegionSearch(e.target.value)} />
          </label>
          <div className="admin-scroll-list">
            {filteredStateRegions.map(r => {
              const i = (config.stateRegions || []).findIndex(item => item.code === r.code)
              return (
              <div key={r.code} className="arow">
                <span>{r.name}</span>
                <select value={r.region} disabled={!canEdit}
                  onChange={e => patchList('stateRegions', i, { region: e.target.value })}>
                  {REGION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              )
            })}
            {!filteredStateRegions.length && <p className="admin-empty-filter">No states or UTs match “{regionSearch}”.</p>}
          </div>
        </div>

          </div>
        </section>

        <section id="admin-subpanel-commercial" className="admin-setting-group" role="tabpanel" aria-labelledby="admin-subtab-commercial" hidden={workflowView !== 'commercial'}>
          <header className="admin-setting-group-head">
            <div><h4 id="admin-group-commercial-title">Commercial &amp; automation</h4><p>Thresholds, conversion rates, and automated decision rules.</p></div>
          </header>
          <div className="admin-setting-grid">

        {/* 3 — AI confidence thresholds */}
        <div className="admin-card admin-card--form">
          <h3><Icon name="bot" size={14} /> AI confidence thresholds</h3>
          <NumField label="High ≥ %" value={aiTh.high} disabled={!canEdit}
            onChange={v => store.updateConfig({ aiThresholds: { ...aiTh, high: v } })} />
          <NumField label="Medium ≥ %" value={aiTh.med} disabled={!canEdit}
            onChange={v => store.updateConfig({ aiThresholds: { ...aiTh, med: v } })} />
          <p className="hint">Below medium blocks stage completion; source conflicts always need human resolution.</p>
        </div>

        {/* 4 — Approval thresholds */}
        <div className="admin-card admin-card--featured">
          <h3><Icon name="checkCircle" size={14} /> Approval thresholds</h3>
          <NumField label="Order value break (INR)" value={thresholds.valueBreak} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, valueBreak: v } })} />
          <NumField label="Margin break (%)" value={thresholds.marginBreak} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, marginBreak: v } })} />
          <NumField label="Max discount before approval (%)" value={thresholds.discountPct ?? 5} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, discountPct: Math.max(0, Math.min(100, v)) } })} />
          <NumField label="Max markup before approval (%)" value={thresholds.markupPct ?? 10} disabled={!canEdit}
            onChange={v => store.updateConfig({ approvalThresholds: { ...thresholds, markupPct: Math.max(0, Math.min(100, v)) } })} />
          <div className="afield">Pricing approval required from
            <div className="admin-approver-options">
              {PRICING_APPROVER_OPTIONS.map(role => {
                const selected = (thresholds.pricingApprovers || ['AH', 'LJS']).includes(role)
                return <label key={role}>
                  <input type="checkbox" checked={selected} disabled={!canEdit || (selected && (thresholds.pricingApprovers || ['AH', 'LJS']).length === 1)}
                    onChange={e => {
                      const current = thresholds.pricingApprovers || ['AH', 'LJS']
                      const next = e.target.checked ? [...new Set([...current, role])] : current.filter(item => item !== role)
                      if (next.length) store.updateConfig({ approvalThresholds: { ...thresholds, pricingApprovers: next } })
                    }} />
                  {displayRoleLabel(role)}
                </label>
              })}
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={config.requireFinalQuoteApproval !== false} disabled={!canEdit}
              onChange={e => store.updateConfig({ requireFinalQuoteApproval: e.target.checked })} />
            Require AH + LJS approval before final proposal send
          </label>
          <label className="check-row">
            <input type="checkbox" checked={config.requireCommercialDeviationApproval !== false} disabled={!canEdit}
              onChange={e => store.updateConfig({ requireCommercialDeviationApproval: e.target.checked })} />
            Require AH approval for special customer terms
          </label>
          <p className="hint">Values above the discount or markup limits require one approval from the selected role(s). Existing value/margin routing remains unchanged.</p>
        </div>

        <div className="admin-card admin-card--form">
          <h3><Icon name="tag" size={14} /> Currency &amp; conversion rates</h3>
          <p className="hint">INR is the reporting currency. Source price-list values remain in their original currency.</p>
          {currencies.map(currency => (
            <label key={currency} className="afield">1 {currency} = ₹
              <input type="number" min="0.0001" step="0.0001" disabled={!canEdit}
                value={currencyRateDraft[currency] ?? currencyRates[currency] ?? ''}
                onChange={e => setCurrencyRateDraft({ ...currencyRateDraft, [currency]: e.target.value })} />
              <button type="button" className="primary" disabled={!canEdit}
                onClick={() => {
                  const rate = currencyRateDraft[currency] ?? currencyRates[currency]
                  store.updateCurrencyRate(currency, rate)
                  setCurrencyRateDraft({ ...currencyRateDraft, [currency]: String(rate) })
                }}>Save</button>
            </label>
          ))}
        </div>

        <div className="admin-card admin-card--form">
          <h3><Icon name="gear" size={14} /> Imported costing defaults</h3>
          <p className="hint">These defaults are copied into new proposals. Sourcing can override them for an individual proposal.</p>
          <NumField label="Default Customs Duty (%)" value={config.costingDefaults?.customsDutyPct ?? 8.5} disabled={!canEdit}
            onChange={v => store.updateConfig({ costingDefaults: { ...(config.costingDefaults || {}), customsDutyPct: v } })} />
          <NumField label="Default ERV (%)" value={config.costingDefaults?.ervPct ?? 2.5} disabled={!canEdit}
            onChange={v => store.updateConfig({ costingDefaults: { ...(config.costingDefaults || {}), ervPct: v } })} />
          <NumField label="Default Handling (%)" value={config.costingDefaults?.handlingPct ?? 5} disabled={!canEdit}
            onChange={v => store.updateConfig({ costingDefaults: { ...(config.costingDefaults || {}), handlingPct: v } })} />
          <NumField label="Guided range minimum (%)" value={config.costingDefaults?.cdErvHandlingMinPct ?? 15} disabled={!canEdit}
            onChange={v => store.updateConfig({ costingDefaults: { ...(config.costingDefaults || {}), cdErvHandlingMinPct: v } })} />
          <NumField label="Guided range maximum (%)" value={config.costingDefaults?.cdErvHandlingMaxPct ?? 20} disabled={!canEdit}
            onChange={v => store.updateConfig({ costingDefaults: { ...(config.costingDefaults || {}), cdErvHandlingMaxPct: v } })} />
        </div>

        {/* Lead workflow controls */}
        <div className="admin-card admin-card--form">
          <h3><Icon name="clock" size={14} /> Lead workflow controls</h3>
          <p className="hint">These rules control expiry and fast-track behavior for active leads.</p>
          <NumField label="Clarification deadline (days)" value={config.leadDeadlines?.clarificationDays ?? 7} disabled={!canEdit}
            onChange={v => store.updateConfig({ leadDeadlines: { ...(config.leadDeadlines || {}), clarificationDays: v } })} />
          <NumField label="Proposal validity (days)" value={config.proposalValidityDays ?? 30} disabled={!canEdit}
            onChange={v => store.updateConfig({ proposalValidityDays: Math.max(1, v) })} />
          <p className="hint">Default validity used when creating new proposals. Existing proposals keep their saved terms.</p>
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

          </div>
        </section>

        <section id="admin-subpanel-customer" className="admin-setting-group" role="tabpanel" aria-labelledby="admin-subtab-customer" hidden={workflowView !== 'customer'}>
          <header className="admin-setting-group-head">
            <div><h4 id="admin-group-customer-title">Customer governance</h4><p>Verification, lead controls, and customer-facing registries.</p></div>
          </header>
          <div className="admin-setting-grid">

        {/* 5 — Customer-class rules & Amber fee */}
        <div className="admin-card admin-card--featured">
          <h3><Icon name="flag" size={14} /> Customer-class rules &amp; Amber fee</h3>
          <p className="hint">What each class must verify, who signs it off and where it gates. Open a class to edit it.</p>
          {CLASS_ORDER.map(cls => (
            <ClassRuleRow key={cls} cls={cls} rule={classes[cls]} canEdit={canEdit}
              open={openClass === cls} onToggle={() => setOpenClass(openClass === cls ? '' : cls)}
              checklistNames={checklistNames}
              onPatch={patch => patchClass(cls, patch)}
              onPatchVerification={patch => patchClass(cls, { verification: { ...classes[cls]?.verification, ...patch } })}
              onPatchGate={patch => patchClass(cls, { gate: { ...classes[cls]?.gate, ...patch } })} />
          ))}
          <NumField label="Amber pre-quote processing fee (INR)" value={amber.amount} disabled={!canEdit}
            onChange={v => store.updateConfig({ amberFee: { ...amber, amount: v } })} />
          <p className="hint">Fee is adjustable against the order value once the PO lands. The Amber timer is on the Amber row above.</p>
        </div>

        {/* 6 — KYC checklist */}
        <div className="admin-card admin-card--list">
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
                onChange={e => setNewKyc(e.target.value)} />
              <button onClick={() => {
                const v = newKyc.trim()
                if (v && !config.kycItems.includes(v)) store.updateConfig({ kycItems: [...config.kycItems, v] })
                setNewKyc('')
              }}><Icon name="plus" size={11} /> Add</button>
            </div>
          )}
        </div>

        <div className="admin-card admin-card--list">
          <h3><Icon name="shield" size={14} /> KYC number validation</h3>
          <p className="hint">Choose which GST, PAN, and CIN numbers are checked during KYC. The pattern uses a regular expression.</p>
          {Object.entries(kycValidation).map(([key, rule]) => {
            const builtIn = DEFAULT_KYC_VALIDATION[key]
            const usesBuiltInFormat = rule.pattern === builtIn?.pattern
            return <div key={key} className="admin-card-row admin-kyc-rule-row">
              <div className="admin-kyc-rule-copy">
                <b>{key}</b>
                <div className="hint">{rule.label}</div>
                <div className="hint"><b>Expected format:</b> {usesBuiltInFormat ? rule.format : 'Custom validation rule'}</div>
                <div className="hint"><b>Example:</b> {usesBuiltInFormat ? rule.example : 'Defined by the advanced rule below'}</div>
              </div>
              <label className="check-row"><input type="checkbox" checked={rule.enabled !== false} disabled={!canEdit}
                onChange={e => store.updateConfig({ kycValidation: { ...kycValidation, [key]: { ...rule, enabled: e.target.checked } } })} /> Validate</label>
              <label className="check-row"><input type="checkbox" checked={!!rule.required} disabled={!canEdit || rule.enabled === false}
                onChange={e => store.updateConfig({ kycValidation: { ...kycValidation, [key]: { ...rule, required: e.target.checked } } })} /> Required</label>
              <details className="admin-kyc-advanced" open={!usesBuiltInFormat}>
                <summary>Advanced validation rule</summary>
                <label className="afield">Regular expression
                  <input type="text" value={rule.pattern || ''} disabled={!canEdit || rule.enabled === false} aria-label={`${key} validation pattern`}
                    onChange={e => store.updateConfig({ kycValidation: { ...kycValidation, [key]: { ...rule, pattern: e.target.value } } })} />
                </label>
              </details>
            </div>
          })}
          <p className="hint">Changing these settings affects new KYC checks; previously verified documents remain recorded.</p>
        </div>

        {/* 7 — Price-list & rate registries */}
        <div className="admin-card admin-card--list">
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
          <ServiceRateSheetEditor canEdit={canEdit} />
        </div>

          </div>
        </section>

        </div>
        </div>
        </div>
        </section>

        <section id="admin-panel-documents" className={`admin-panel ${adminView === 'documents' ? 'is-active' : ''}`}
          role="tabpanel" aria-labelledby="admin-tab-documents" hidden={adminView !== 'documents'}>
        <div className="admin-section-heading">
          <div><h3>Documents &amp; templates</h3><p>Keep working files and proposal outputs current for the team.</p></div>
        </div>
        <div className="admin-wide-grid">

        {/* 8 — Document uploads */}
        <div className="admin-card admin-card-wide admin-documents-card">
          <h3><Icon name="upload" size={14} /> Document uploads</h3>
          <p className="hint">Uploaded files are read and stored as usable catalogue or document data.</p>

          <div className="section-title" style={{ marginTop: 6 }}>KYC document templates</div>
          <p className="hint">Configure the template downloaded for each KYC checklist item. The bundled India KYC form is used until a replacement is uploaded.</p>
          <div className="admin-kyc-template-list">
            {(config.kycItems || []).map(item => {
              const current = kycTemplates[item]
              const lane = kycTemplateLane(item)
              return <div key={item} className="arow">
                <span><b>{item}</b><br /><span className="hint">{current ? `${current.name} · uploaded ${current.uploaded}` : 'Built-in default'}</span></span>
                <FileButton variant="secondary" label={current ? 'Replace' : 'Upload'} disabled={!canEdit || templateBusy === lane}
                  onFile={file => uploadKycTemplate(item, file)} />
              </div>
            })}
          </div>

          <div className="section-title" style={{ marginTop: 6 }}>Supplier price list</div>
          <div className="admin-actions">
            <input type="text" value={supplier} placeholder="Supplier (e.g. B&K)" disabled={!canEdit}
              onChange={e => setSupplier(e.target.value)} />
            <input type="text" value={plVersion} placeholder="Version (e.g. 2026-Q3)" disabled={!canEdit}
              onChange={e => setPlVersion(e.target.value)} />
            <FileButton variant="secondary" label="Upload price list" disabled={!canEdit}
              onFile={async f => {
                try {
                  const listName = supplier.trim() || f.name.replace(/\.[^.]+$/, '')
                  const catalog = await parsePriceListFile(await f.arrayBuffer(), 'INR')
                  // Never import an empty or unreadable file as a live price list.
                  if (!catalog.parts.length) {
                    setTemplateError(catalog.errors[0] || 'No parts could be read from that file.')
                    return
                  }
                  store.replacePriceList(listName, catalog, {
                    filename: f.name, version: plVersion.trim() || '—', currency: catalog.currency || 'INR',
                  })
                  setTemplateError(catalog.warnings?.length
                    ? `Imported ${catalog.parts.length} parts into ${listName}. ${catalog.warnings.join(' ')}`
                    : '')
                  setSupplier(''); setPlVersion('')
                } catch (error) {
                  setTemplateError(`Price list could not be imported: ${error?.message || error}`)
                }
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
            <div className="admin-actions admin-actions-end">
              <FileButton variant="secondary" label="Upload matrix" disabled={!canEdit}
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
            <div className="admin-actions admin-actions-end">
              <FileButton variant="secondary" label="Upload classification" disabled={!canEdit}
                onFile={f => store.addUpload('customerClassification', { name: f.name, size: f.size })} />
            </div>
          )}

          <div className="section-title" style={{ marginTop: 10 }}>Manufacturer datasheet library</div>
          <p className="hint">Reusable datasheets available for selection when preparing a customer proposal.</p>
          <div className="admin-actions admin-actions-end">
            <FileButton variant="secondary" label="Upload datasheet" disabled={!canEdit} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onFile={async f => {
                await putFiles('admin-datasheets', [f])
                store.addUpload('datasheets', { name: f.name, type: f.type, size: f.size })
              }} />
          </div>
          {(uploads.datasheets || []).map(file => <div key={file.name} className="arow"><span>{file.name}<br /><span className="hint">uploaded {file.uploaded}</span></span><Chip tone="state-Accepted">Available</Chip></div>)}
        </div>

        {/* 9 — Templates & reminders */}
        <div className="admin-card admin-card-wide">
          <h3><Icon name="fileText" size={14} /> Proposal templates &amp; reminder rules</h3>
          <p className="hint">Current Excel templates are stored in Supabase. Replacements become active immediately and prior versions remain available below.</p>
          {templateError && <div className="errbox" role="alert">{templateError}</div>}
          {templateAnalysis && <div className={templateAnalysis.ai?.ok ? 'okbox' : 'warnbox'}>
            {templateAnalysis.ai?.ok ? `Gemini mapped this template${templateAnalysis.ai.model ? ` using ${templateAnalysis.ai.model}` : ''}.` : 'Gemini was unavailable; deterministic label mapping was used.'}
            {!!templateAnalysis.warnings?.length && <div className="hint">{templateAnalysis.warnings.length} mapping warning{templateAnalysis.warnings.length === 1 ? '' : 's'} — review the preview before using this template.</div>}
          </div>}
          <div className="admin-template-list">
            {TEMPLATE_LANES.map(lane => {
              const current = templateInfo(lane.key)
              const uploaded = uploadedTemplateFor(lane.key)
              const history = proposalTemplates.filter(item => item.lane === lane.key && item.status === 'Archived')
              return <div key={lane.key} className="admin-template-row">
                <div className="admin-template-meta">
                  <b>{lane.label}</b>
                  <span>{current.name || current.filename}</span>
                  <span className="hint">{uploaded ? `uploaded ${uploaded.uploaded || 'recently'} · Supabase` : 'Built-in default · upload a replacement to activate'}</span>
                  {uploaded?.mapping && <span className="hint">{uploaded.mappingWarnings?.length ? 'Analyzed · review warnings' : 'Analyzed · ready for proposal generation'}</span>}
                </div>
                <div className="admin-template-actions">
                  <button type="button" className="secondary" onClick={() => openTemplate(lane.key)} disabled={templateBusy === lane.key || templatePreviewBusy}>
                    <Icon name="eye" size={11} /> View current
                  </button>
                  <FileButton variant="secondary" label={uploaded ? 'Replace' : 'Upload'} disabled={!canEdit || templateBusy === lane.key}
                    accept=".xlsx,.xlsm" onFile={file => uploadTemplate(lane.key, file)} />
                </div>
                {!!history.length && <details className="admin-template-history">
                  <summary>{history.length} archived version{history.length === 1 ? '' : 's'}</summary>
                  {history.map(item => <div key={`${item.path}-${item.uploaded}`} className="arow">
                    <span>{item.name}<br /><span className="hint">uploaded {item.uploaded}</span></span>
                    <button type="button" onClick={() => openTemplate(lane.key)} disabled>Archived</button>
                  </div>)}
                </details>}
              </div>
            })}
          </div>
          {(config.reminders || []).map((r, i) => (
            <label key={r.id || i} className="check-row">
              <input type="checkbox" checked={!!r.on} disabled={!canEdit}
                onChange={() => patchList('reminders', i, { on: !r.on })} />
              {r.label || r.name}
            </label>
          ))}
        </div>

        </div>
        </section>

      </div>

      {templatePreview && (
        <Modal title={`${templatePreview.info.name || templatePreview.info.filename} — ${templatePreview.lane} template`}
          onClose={() => { if (!templateBusy) setTemplatePreview(null) }} wide className="proposal-preview-modal workbook-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Edit the workbook template, then save it as a new current version.</span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button type="button" className="primary" disabled={!canEdit || !templateDirty || !!templateBusy} onClick={saveTemplateEdits}>Save changes</button>
              <button type="button" onClick={() => setTemplatePreview(null)} disabled={!!templateBusy}>Close</button>
            </span>
          </div>
          <WorkbookPreview workbook={templatePreview.workbook} editable={canEdit} onChange={updatePreviewCell}
            loading={templatePreviewBusy} error={templatePreviewError} />
        </Modal>
      )}
    </div>
  )
}
