import React, { useState, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, ROLES } from '../seed.js'
import { runJson } from '../ai.js'
import { extractPdfText, parseTender, buildOpportunityDraft } from '../tenderParse.js'
import { displayRole } from '../utils.js'

const empty = {
  sellTo: '', category: '', location: '', eucName: '', eucLocation: '',
  oppName: '', owner: '', oppType: '', bu: '', segment: '', product: [],
  contactPerson: '', contactPhone: '', contactEmail: '', valueK: '', rfqNumber: '', rfqDate: '',
}

// Shared by the submit gate and by the post-extraction check, so "required" and
// "the document should have given us this" can never drift apart.
const REQUIRED_FIELDS = ['sellTo', 'category', 'eucName', 'eucLocation', 'oppName', 'owner',
  'oppType', 'bu', 'segment', 'product', 'contactPerson', 'contactPhone']

// Select/Pills/Input live at module scope, not inside IntakeForm. A component
// declared in the render body is a brand-new element type on every render, so
// React unmounts and remounts each input — which meant every text field lost
// focus after a single keystroke. The form state reaches them through context so
// the call sites stay as short as `<Input field="eucName" />`.
const FormCtx = React.createContext(null)

// Red once the user has emptied a field they touched; amber when the uploaded
// document simply did not contain it and nobody has filled it in yet.
const fieldClass = (validation, field, aiMissing) => {
  if (validation.fields[field]?.touched && !validation.fields[field]?.valid) return 'error'
  return aiMissing?.has(field) ? 'not-extracted' : ''
}

// Compact dropdown for all select fields
function Select({ field, options, placeholder }) {
  const { f, set, validation, aiMissing } = React.useContext(FormCtx)
  return (
    <select value={f[field]} onChange={set(field)} className={fieldClass(validation, field, aiMissing)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  )
}

// Pill/bubble selection for Classification fields. Product is multi-select
// (several products can sit on one opportunity); business unit and segment stay
// single-select, per the 13 Aug review.
function Pills({ field, options }) {
  const { f, set, selectedProducts, setF, aiMissing } = React.useContext(FormCtx)
  const isProduct = field === 'product'
  return (
    <div className={'pill-group' + (isProduct ? ' product-options' : '') + (aiMissing?.has(field) ? ' not-extracted' : '')}>
      {options.map(o => {
        const on = isProduct ? selectedProducts.includes(o) : f[field] === o
        return (
          <label key={o} className={`pill-opt ${on ? 'on' : ''}`}>
            <input type={isProduct ? 'checkbox' : 'radio'} name={field} value={o} checked={on}
              onChange={isProduct
                ? e => setF(prev => ({ ...prev, product: e.target.checked
                    ? [...selectedProducts, o]
                    : selectedProducts.filter(x => x !== o) }))
                : set(field)} />
            {o}
          </label>
        )
      })}
    </div>
  )
}

function Input({ field, type = 'text', placeholder, list }) {
  const { f, set, validation, aiMissing } = React.useContext(FormCtx)
  return (
    <input type={type} placeholder={placeholder} value={f[field]} onChange={set(field)}
      list={list} className={fieldClass(validation, field, aiMissing)}
      title={aiMissing?.has(field) ? 'Not found in the uploaded document — please fill this in' : undefined} />
  )
}

export default function IntakeForm({ destinationPicker = null }) {
  const store = useStore()
  const nav = useNavigate()
  const fileInputRef = useRef(null)
  // The Lead Inbox pre-fills the form via router state ("Qualify" action).
  const loc = useLocation()
  const [f, setF] = useState(() => ({
    ...empty,
    ...(loc.state?.prefill || {}),
    // Role-based auto-assignment: sales reps are assigned as owner by default
    // Admin/System Owner roles can choose any owner
    owner: (loc.state?.prefill || {}).owner || (OWNERS.includes(store.role) ? store.role : '')
  }))
  const [touched, setTouched] = useState({})

  // Document upload and AI processing state
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const [aiResults, setAiResults] = useState(null)
  const [aiNotice, setAiNotice] = useState(null)
  const [aiError, setAiError] = useState(null)
  const [aiFilledFields, setAiFilledFields] = useState(new Set())
  const [aiMissingFields, setAiMissingFields] = useState(new Set())

  const selectedProducts = Array.isArray(f.product)
    ? f.product
    : String(f.product || '').split(',').map(x => x.trim()).filter(Boolean)

  const set = k => e => {
    setF({ ...f, [k]: e.target.value })
    if (!touched[k]) setTouched({ ...touched, [k]: true })
  }

  const knownCustomer = store.customers.find(c => c.name.toLowerCase() === f.sellTo.trim().toLowerCase())

  const required = REQUIRED_FIELDS

  // Calculate validation status in real-time
  const validation = useMemo(() => {
    const missing = required.filter(k => k === 'product' ? selectedProducts.length === 0 : !f[k])
    const filled = required.length - missing.length
    return {
      missing,
      filled,
      total: required.length,
      isComplete: missing.length === 0,
      fields: required.reduce((acc, field) => {
        acc[field] = {
          valid: !!f[field],
          touched: touched[field],
          error: touched[field] && !f[field] ? 'required' : ''
        }
        return acc
      }, {})
    }
  }, [f, touched, required, selectedProducts.length])

  const submit = e => {
    e.preventDefault()
    if (!validation.isComplete) return
    const today = new Date().toISOString().slice(0, 10)
    const id = nextOppId(store.opportunities, f.owner)
    const maxSl = Math.max(0, ...store.opportunities.map(o => o.sl || 0))
    const extractedFields = [...aiFilledFields]
      .filter(key => f[key] !== undefined && f[key] !== '')
      .map(key => ({
        key,
        value: Array.isArray(f[key]) ? f[key].join(', ') : String(f[key]),
        source: 'Document extraction',
      }))
    const requestedItems = aiResults?.lineItems || aiResults?.items || aiResults?.localDraft?.items || []
    // Two things happen on submit: the tracker row is added AND the
    // opportunity folder is created (same as the current manual process).
    const sellTo = f.sellTo.trim()
    if (!knownCustomer) {
      store.addCustomer({ name: sellTo, category: f.category, status: 'Blue', kyc: 'Pending', payment: '—' })
    }
    store.addOpportunity({
      sl: maxSl + 1, id,
      sellTo, category: f.category, location: f.location,
      customerStatus: knownCustomer ? knownCustomer.status : 'Blue',
      eucName: f.eucName, eucLocation: f.eucLocation, oppName: f.oppName,
      owner: f.owner, oppType: f.oppType, bu: f.bu, segment: f.segment,
      product: selectedProducts,
      // prob is salesperson-set later — the form does not collect it (audio 00:24)
      prob: '',
      valueK: +f.valueK || 0, cogsK: 0,
      rfqNumber: f.rfqNumber || '', rfqDate: f.rfqDate || '',
      extractedFields, requestedItems,
      createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
      status: 'Open', stage: 'Lead', closedReason: '',
      contactPerson: f.contactPerson, contactPhone: f.contactPhone, contactEmail: f.contactEmail || '',
      lastUpdated: today, forecast: false, remarks: '', nextActionOwner: '',
    })
    // A lead qualified from the inbox converts only on actual submit.
    if (loc.state?.leadId) store.updateLead(loc.state.leadId, { status: 'Qualified', oppId: id })
    setAiNotice(`Opportunity ${id} created. A row was added to the Sales Pipeline sheet and its Customer Specs, Partner Docs and Proposal folders were created.`)
    nav(`/folders/${id}`)
  }

  const resetForm = () => {
    setF({ ...empty })
    setTouched({})
    setUploadedFile(null)
    setUploadOpen(false)
    setAiResults(null)
    setAiNotice(null)
    setAiError(null)
    setAiFilledFields(new Set())
    setAiMissingFields(new Set())
  }

  // Handle document file upload
  const handleFileUpload = async (file) => {
    if (!file) return

    // PDF or a saved email. Enquiries reach the common mailbox as .eml far more
    // often than as a tender PDF (see the sample set in "modae doc/"), and
    // rejecting them sent the salesperson back to typing everything by hand.
    const name = file.name.toLowerCase()
    const isPdf = file.type.includes('pdf') || name.endsWith('.pdf')
    const isEmail = name.endsWith('.eml') || name.endsWith('.msg') || file.type === 'message/rfc822'
    if (!isPdf && !isEmail) {
      setAiError('Upload the enquiry as a PDF or a saved email (.eml)')
      return
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setAiError('File size exceeds 10MB limit')
      return
    }

    setUploadedFile(file)
    setUploadOpen(true)
    setAiProcessing(true)
    setAiNotice(null)
    setAiError(null)
    setAiFilledFields(new Set())

    try {
      // Extract real text and positional data from the PDF. The deterministic
      // parser is also the fallback when the optional AI proxy is unavailable.
      // A saved email is already text, so it skips pdfjs entirely.
      const extracted = isEmail
        ? { fullText: await file.text(), struct: [] }
        : await extractPdfText(file)
      const parsed = parseTender(extracted.fullText, extracted.struct)
      const localDraft = buildOpportunityDraft(parsed)

      // Call AI extraction task
      const aiResult = await runJson('tender.extract', {
        filename: file.name,
        pages: extracted.struct.length,
        text: extracted.fullText,
        parsed,
        products: PRODUCTS // Context for product categorization
      }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })

      if (aiResult) {
        const enriched = { ...aiResult, extractedHeader: parsed.header, missing: [...new Set([...(aiResult.missing || []), ...parsed.missing])] }
        setAiResults(enriched)
        applyAiResultsToForm(enriched)
      } else {
        const enriched = { local: true, extractedHeader: parsed.header, missing: parsed.missing, localDraft }
        setAiResults(enriched)
        applyAiResultsToForm(enriched)
        setAiNotice('AI is unavailable, so the PDF was parsed locally. Review the filled fields before submitting.')
      }
    } catch (error) {
      console.error('Document processing error:', error)
      setAiError('Failed to process document. Please try again or fill manually.')
    } finally {
      setAiProcessing(false)
    }
  }

  // Apply AI extraction results to form fields
  const applyAiResultsToForm = (aiResult) => {
    const updates = {}
    const filledFields = new Set()
    const header = aiResult.localDraft
      ? {
          buyer: aiResult.localDraft.sellTo,
          location: aiResult.localDraft.location,
          contactPerson: aiResult.localDraft.contactPerson,
          contactPhone: aiResult.localDraft.contactPhone,
          subject: aiResult.localDraft.oppName,
        }
      : (aiResult.header || {})
    const guesses = aiResult.localDraft
      ? aiResult.localDraft
      : (aiResult.guesses || {})

    // Map header fields to form fields
    if (header.buyer) {
      updates.sellTo = header.buyer
      filledFields.add('sellTo')
    }
    if (header.location) {
      updates.location = header.location
      updates.eucLocation = header.location
      filledFields.add('location'); filledFields.add('eucLocation')
    }
    if (header.contactPerson) {
      updates.contactPerson = header.contactPerson
      filledFields.add('contactPerson')
    }
    if (header.contactPhone) {
      updates.contactPhone = header.contactPhone
      filledFields.add('contactPhone')
    }

    // Map classification guesses to form fields
    if (guesses.category) {
      updates.category = guesses.category
      filledFields.add('category')
    }
    if (guesses.oppType) {
      updates.oppType = guesses.oppType
      filledFields.add('oppType')
    }
    if (guesses.bu) {
      updates.bu = guesses.bu
      filledFields.add('bu')
    }
    if (guesses.segment) {
      updates.segment = guesses.segment
      filledFields.add('segment')
    }
    if (guesses.product) {
      updates.product = guesses.product
      filledFields.add('product')
    }

    // Generate opportunity name from subject
    if (header.subject) {
      updates.oppName = header.subject
      filledFields.add('oppName')
    }

    // The regex parser reads the enquiry reference; the model fills what it
    // missed. Biji, 13 Aug: "AI has to extract the RFQ number. If the RFQ number
    // is missing, AI can say that missing RFQ number — or if there is no RFQ
    // number, can simply say email dated so-and-so." Many enquiries genuinely
    // carry no reference, so the fallback names the document instead of leaving
    // the covering letter with a blank "Your Ref".
    const extractedHeader = aiResult.extractedHeader || {}
    const rfqNumber = extractedHeader.sectionRef || header.sectionRef || ''
    const rfqDate = extractedHeader.rfqDate || header.rfqDate || ''
    if (rfqNumber) { updates.rfqNumber = rfqNumber; filledFields.add('rfqNumber') }
    else if (rfqDate) { updates.rfqNumber = `Email dated ${rfqDate}`; filledFields.add('rfqNumber') }
    if (rfqDate) { updates.rfqDate = rfqDate; filledFields.add('rfqDate') }

    if (header.senderEmail) {
      updates.contactEmail = header.senderEmail
      filledFields.add('contactEmail')
    }

    // Apply updates to form
    setF(prev => ({ ...prev, ...updates }))
    setAiFilledFields(filledFields)
    // Anything the document was supposed to give us and did not is marked on the
    // field itself — a comma-joined sentence at the top of the form was easy to
    // miss, and nothing went red because nothing had been "touched" yet.
    setAiMissingFields(new Set(REQUIRED_FIELDS.filter(k => !filledFields.has(k))))
  }

  // Remove uploaded file
  const removeUploadedFile = () => {
    setUploadedFile(null)
    setAiResults(null)
    setAiNotice(null)
    setAiError(null)
    setAiFilledFields(new Set())
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  return (
    <FormCtx.Provider value={{ f, setF, set, validation, selectedProducts, aiMissing: aiMissingFields }}>
    <div className="forms-bg">
      <form className="forms-card wide" onSubmit={submit}>
        <div className="forms-head">
          <div className="forms-head-top">
            <h1>Create Opportunity</h1>
            <div className="req-note">
              <span className="star">*</span> required ·{' '}
              {validation.isComplete
                ? <span className="ok">✓ All {validation.total} required fields complete</span>
                : <span>{validation.missing.length} of {validation.total} required fields missing</span>}
            </div>
          </div>
          <div className="forms-head-content">
            <div className="forms-note">Register a new sales opportunity — complete every field below in one screen. Submitting creates a pipeline row and an opportunity folder.</div>

            <button
              type="button"
              className={`upload-section-toggle ${uploadOpen ? 'open' : ''}`}
              aria-expanded={uploadOpen}
              aria-controls="opportunity-upload-panel"
              onClick={() => setUploadOpen(value => !value)}
            >
              <span>Upload</span>
              <span className="upload-section-toggle-icon" aria-hidden="true">{uploadOpen ? '−' : '+'}</span>
            </button>

            {uploadOpen && <div className="intake-setup" id="opportunity-upload-panel">
              {/* Document Upload Zone */}
              {!uploadedFile ? (
                <div
                  className="document-upload-zone"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon">📄</div>
                  <div className="upload-text">
                    <strong>Upload the enquiry — tender PDF or saved email</strong> to auto-fill fields with AI
                  </div>
                  <div className="upload-subtext">Drag and drop or click to browse</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf,.eml,.msg,message/rfc822"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    style={{ display: 'none' }}
                  />
                </div>
              ) : (
                <div className="uploaded-file">
                  <div className="file-info">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{uploadedFile.name}</span>
                    <span className="file-size">({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
                    {aiProcessing && <span className="processing-status">AI processing...</span>}
                    {aiResults && <span className={aiResults.local ? 'ai-fallback' : 'ai-success'}>
                      {aiResults.local ? 'Local extraction complete' : '✓ AI extraction complete'}
                    </span>}
                  </div>
                  <button type="button" onClick={removeUploadedFile} className="remove-file">Remove</button>
                </div>
              )}

              {destinationPicker}
            </div>}

            {aiError && (
              <div className="ai-error">
                ⚠️ {aiError}
              </div>
            )}
            {aiNotice && <div className="ai-notice">{aiNotice}</div>}
            {aiResults?.missing?.length > 0 && (
              <div className="ai-notice" style={{ color: 'var(--amber-text)' }}>
                <b>Missing from document:</b> {aiResults.missing.join(', ')}
              </div>
            )}

            <div className="forms-note">Or manually fill in all fields below</div>
          </div>
        </div>

        <div className="forms-grid">
          {/* ---- Group 1 — Customer Info (Fields 1-5) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Customer Info</div>

            <div className="q">
              <div className="q-label">RFQ Number</div>
              <Input field="rfqNumber" placeholder="Extracted or enter RFQ number" />
            </div>

            <div className="q">
              <div className="q-label">RFQ Date</div>
              <Input field="rfqDate" placeholder="Extracted or enter RFQ date" />
            </div>

            <div className="q">
              <div className="q-label">
                1. Sell To Customer<span className="star">*</span>
                {aiFilledFields.has('sellTo') && <span className="ai-badge">AI</span>}
              </div>
              {/* Free text with the master as suggestions, not a closed
                  dropdown: on a fresh install with no demo data the customer
                  list is empty, and a plain <select> would make the first real
                  enquiry impossible to file. Submit already creates the
                  customer (flagged Blue) when the name is a new one. */}
              <Input field="sellTo" list="intake-customers" placeholder="Select or type customer name" />
              <datalist id="intake-customers">
                {store.customers.map(c => <option key={c.name} value={c.name} />)}
              </datalist>
              {f.sellTo && (
                <div className="hint" style={{ marginTop: 2 }}>
                  {knownCustomer
                    ? <>Existing customer — status <span className={`pill ${knownCustomer.status}`}>{knownCustomer.status}</span></>
                    : <>New customer — will be flagged <span className="pill Blue">Blue</span> for admin verification</>}
                </div>
              )}
            </div>

            <div className="q">
              <div className="q-label">
                2. Category<span className="star">*</span>
                {aiFilledFields.has('category') && <span className="ai-badge">AI</span>}
              </div>
              <Select field="category" options={CATEGORIES} placeholder="Select category" />
            </div>

            <div className="q">
              <div className="q-label">
                3. Location
                {aiFilledFields.has('location') && <span className="ai-badge">AI</span>}
              </div>
              <Input field="location" placeholder="Enter location" />
            </div>

            <div className="q">
              <div className="q-label">4. EUC Name<span className="star">*</span></div>
              <Input field="eucName" placeholder="Enter end user/customer name" />
            </div>

            <div className="q">
              <div className="q-label">
                5. EUC Location<span className="star">*</span>
                {aiFilledFields.has('eucLocation') && <span className="ai-badge">AI</span>}
              </div>
              <Input field="eucLocation" placeholder="Enter end user location" />
            </div>
          </div>

          {/* ---- Group 2 — Opportunity Details (Fields 6-11) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Opportunity Details</div>

            <div className="q">
              <div className="q-label">
                6. Opportunity Name / Description<span className="star">*</span>
                {aiFilledFields.has('oppName') && <span className="ai-badge">AI</span>}
              </div>
              <Input field="oppName" placeholder="Enter opportunity description" />
            </div>

            <div className="q">
              <div className="q-label">7. Owner<span className="star">*</span></div>
              <Select field="owner" options={OWNERS} placeholder="Select owner" />
              <div className="hint" style={{ marginTop: 2 }}>
                {OWNERS.includes(store.role) && f.owner === store.role && (
                  <>Auto-filled as {displayRole(store.role)} (your role)</>
                )}
              </div>
            </div>

            <div className="q">
              <div className="q-label">
                8. Opp Type<span className="star">*</span>
                {aiFilledFields.has('oppType') && <span className="ai-badge">AI</span>}
              </div>
              <Select field="oppType" options={OPP_TYPES} placeholder="Select opportunity type" />
            </div>

            <div className="q">
              <div className="q-label">9. Estimated Value (₹)</div>
              <Input field="valueK" type="number" placeholder="Enter estimated value" />
            </div>

            <div className="q">
              <div className="q-label">
                10. Contact Person<span className="star">*</span>
                {aiFilledFields.has('contactPerson') && <span className="ai-badge">AI</span>}
              </div>
              <Input field="contactPerson" placeholder="Enter contact name" />
            </div>

            <div className="q">
              <div className="q-label">
                11. Contact Phone<span className="star">*</span>
                {aiFilledFields.has('contactPhone') && <span className="ai-badge">AI</span>}
              </div>
              <Input field="contactPhone" type="tel" placeholder="Enter contact phone" />
            </div>
          </div>

          {/* ---- Group 3 — Classification (Fields 12-14) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Classification</div>

            <div className="q">
              <div className="q-label">
                12. BU<span className="star">*</span>
                {aiFilledFields.has('bu') && <span className="ai-badge">AI</span>}
              </div>
              <Pills field="bu" options={BUS} />
            </div>

            <div className="q">
              <div className="q-label">
                13. Segment<span className="star">*</span>
                {aiFilledFields.has('segment') && <span className="ai-badge">AI</span>}
              </div>
              <Pills field="segment" options={SEGMENTS} />
            </div>

            <div className="q">
              <div className="q-label">
                14. Products<span className="star">*</span>
                {aiFilledFields.has('product') && <span className="ai-badge">AI</span>}
              </div>
              <Pills field="product" options={PRODUCTS} />
              <div className="hint" style={{ marginTop: 4 }}>Select all products included in this inquiry.</div>
            </div>

            {/* Progress indicator */}
            <div className="q" style={{ marginTop: 'auto' }}>
              <div className="progress-indicator">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(validation.filled / validation.total) * 100}%` }}
                  />
                </div>
                <div className="progress-text">
                  {validation.filled} of {validation.total} fields complete
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="forms-actions">
          <button type="button" onClick={resetForm} className="secondary">Clear Form</button>
          <button type="submit" className="submit" disabled={!validation.isComplete} style={{ marginLeft: '8px' }}
            title={validation.isComplete ? 'Create Opportunity' : `Missing: ${validation.missing.join(', ')}`}>
            Create Opportunity
          </button>
        </div>
      </form>
    </div>
    </FormCtx.Provider>
  )
}
