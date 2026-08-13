import React, { useState, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, ROLES } from '../seed.js'
import { runJson } from '../ai.js'

const empty = {
  sellTo: '', category: '', location: '', eucName: '', eucLocation: '',
  oppName: '', owner: '', oppType: '', bu: '', segment: '', product: '',
  contactPerson: '', contactPhone: '', valueK: '',
}

export default function IntakeForm() {
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
  const [aiProcessing, setAiProcessing] = useState(false)
  const [aiResults, setAiResults] = useState(null)
  const [aiError, setAiError] = useState(null)
  const [aiFilledFields, setAiFilledFields] = useState(new Set())

  const set = k => e => {
    setF({ ...f, [k]: e.target.value })
    if (!touched[k]) setTouched({ ...touched, [k]: true })
  }

  const knownCustomer = store.customers.find(c => c.name.toLowerCase() === f.sellTo.trim().toLowerCase())

  const required = ['sellTo', 'category', 'eucName', 'eucLocation', 'oppName', 'owner', 'oppType', 'bu', 'segment', 'product', 'contactPerson', 'contactPhone']

  // Calculate validation status in real-time
  const validation = useMemo(() => {
    const missing = required.filter(k => !f[k])
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
  }, [f, touched, required])

  const submit = e => {
    e.preventDefault()
    if (!validation.isComplete) return
    const today = new Date().toISOString().slice(0, 10)
    const id = nextOppId(store.opportunities, f.owner)
    const maxSl = Math.max(0, ...store.opportunities.map(o => o.sl || 0))
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
      owner: f.owner, oppType: f.oppType, bu: f.bu, segment: f.segment, product: f.product,
      // prob is salesperson-set later — the form does not collect it (audio 00:24)
      prob: '',
      valueK: +f.valueK || 0, cogsK: 0,
      createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
      status: 'Open', stage: 'Lead', closedReason: '',
      contactPerson: f.contactPerson, contactPhone: f.contactPhone,
      lastUpdated: today, forecast: false, remarks: '',
    })
    // A lead qualified from the inbox converts only on actual submit.
    if (loc.state?.leadId) store.updateLead(loc.state.leadId, { status: 'Qualified', oppId: id })
    alert(`Opportunity ${id} created.\n\n1) Row added to the Sales Pipeline sheet\n2) Folder ${id} created with Customer Specs / Partner Docs / Proposal`)
    nav(`/folders/${id}`)
  }

  const resetForm = () => {
    setF(empty)
    setTouched({})
    setUploadedFile(null)
    setAiResults(null)
    setAiError(null)
    setAiFilledFields(new Set())
  }

  // Handle document file upload
  const handleFileUpload = async (file) => {
    if (!file) return

    // Check file type (only PDF for now)
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setAiError('Please upload a PDF document')
      return
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setAiError('File size exceeds 10MB limit')
      return
    }

    setUploadedFile(file)
    setAiProcessing(true)
    setAiError(null)
    setAiFilledFields(new Set())

    try {
      // Extract text from PDF
      const text = await extractTextFromPDF(file)

      // Call AI extraction task
      const aiResult = await runJson('tender.extract', {
        filename: file.name,
        pages: Math.ceil(file.size / 50000), // Rough estimate
        text: text,
        parsed: {}, // Could add rule-based parsing results here
        products: PRODUCTS // Context for product categorization
      })

      if (aiResult) {
        setAiResults(aiResult)
        applyAiResultsToForm(aiResult)
      } else {
        setAiError('AI extraction failed. Please fill the form manually.')
      }
    } catch (error) {
      console.error('Document processing error:', error)
      setAiError('Failed to process document. Please try again or fill manually.')
    } finally {
      setAiProcessing(false)
    }
  }

  // Extract text content from PDF (basic implementation)
  const extractTextFromPDF = async (file) => {
    // This is a placeholder - in production you'd use a proper PDF parsing library
    // For now, we'll return a placeholder that the AI can work with
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        // Basic text extraction - in production, use pdf.js or similar
        const text = `PDF Document: ${file.name}\n\n[Document content would be extracted here using a PDF parsing library]`
        resolve(text)
      }
      reader.onerror = () => resolve('[Could not extract text from PDF]')
      reader.readAsText(file)
    })
  }

  // Apply AI extraction results to form fields
  const applyAiResultsToForm = (aiResult) => {
    const updates = {}
    const filledFields = new Set()

    // Map header fields to form fields
    if (aiResult.header?.buyer) {
      updates.sellTo = aiResult.header.buyer
      filledFields.add('sellTo')
    }
    if (aiResult.header?.location) {
      updates.location = aiResult.header.location
      updates.eucLocation = aiResult.header.location
      filledFields.add('location', 'eucLocation')
    }
    if (aiResult.header?.contactPerson) {
      updates.contactPerson = aiResult.header.contactPerson
      filledFields.add('contactPerson')
    }
    if (aiResult.header?.contactPhone) {
      updates.contactPhone = aiResult.header.contactPhone
      filledFields.add('contactPhone')
    }

    // Map classification guesses to form fields
    if (aiResult.guesses?.category) {
      updates.category = aiResult.guesses.category
      filledFields.add('category')
    }
    if (aiResult.guesses?.oppType) {
      updates.oppType = aiResult.guesses.oppType
      filledFields.add('oppType')
    }
    if (aiResult.guesses?.bu) {
      updates.bu = aiResult.guesses.bu
      filledFields.add('bu')
    }
    if (aiResult.guesses?.segment) {
      updates.segment = aiResult.guesses.segment
      filledFields.add('segment')
    }
    if (aiResult.guesses?.product) {
      updates.product = aiResult.guesses.product
      filledFields.add('product')
    }

    // Generate opportunity name from subject
    if (aiResult.header?.subject) {
      updates.oppName = aiResult.header.subject
      filledFields.add('oppName')
    }

    // Apply updates to form
    setF(prev => ({ ...prev, ...updates }))
    setAiFilledFields(filledFields)
  }

  // Remove uploaded file
  const removeUploadedFile = () => {
    setUploadedFile(null)
    setAiResults(null)
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

  // Compact dropdown for all select fields
  const Select = ({ field, options, placeholder }) => (
    <select
      value={f[field]}
      onChange={set(field)}
      className={validation.fields[field]?.touched && !validation.fields[field]?.valid ? 'error' : ''}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  )

  // Pill/bubble selection for Classification fields
  const Pills = ({ field, options }) => (
    <div className="pill-group">
      {options.map(o => (
        <label key={o} className={`pill-opt ${f[field] === o ? 'on' : ''}`}>
          <input type="radio" name={field} value={o} checked={f[field] === o} onChange={set(field)} />
          {o}
        </label>
      ))}
    </div>
  )

  const Input = ({ field, type = 'text', placeholder, list }) => (
    <input
      type={type}
      placeholder={placeholder}
      value={f[field]}
      onChange={set(field)}
      list={list}
      className={validation.fields[field]?.touched && !validation.fields[field]?.valid ? 'error' : ''}
    />
  )

  return (
    <div className="forms-bg">
      <form className="forms-card wide" onSubmit={submit}>
        <div className="forms-head">
          <div>
            <h1>Create Opportunity</h1>
            <div className="forms-note">Register a new sales opportunity — complete every field below in one screen. Submitting creates a pipeline row and an opportunity folder.</div>

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
                  <strong>Upload tender/RFQ PDF</strong> to auto-fill fields with AI
                </div>
                <div className="upload-subtext">Drag and drop or click to browse</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
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
                  {aiResults && <span className="ai-success">✓ AI extraction complete</span>}
                </div>
                <button type="button" onClick={removeUploadedFile} className="remove-file">Remove</button>
              </div>
            )}

            {aiError && (
              <div className="ai-error">
                ⚠️ {aiError}
              </div>
            )}

            <div className="forms-note">Or manually fill in all fields below</div>
          </div>
          <div className="req-note">
            <span className="star">*</span> required ·{' '}
            {validation.isComplete
              ? <span className="ok">✓ All {validation.total} required fields complete</span>
              : <span>{validation.missing.length} of {validation.total} required fields missing</span>}
          </div>
        </div>

        <div className="forms-grid">
          {/* ---- Group 1 — Customer Info (Fields 1-5) ---- */}
          <div className="forms-col">
            <div className="forms-col-head">Customer Info</div>

            <div className="q">
              <div className="q-label">
                1. Sell To Customer<span className="star">*</span>
                {aiFilledFields.has('sellTo') && <span className="ai-badge">AI</span>}
              </div>
              <Select field="sellTo" options={store.customers.map(c => c.name)} placeholder="Select customer" />
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
                  <>Auto-filled as {store.role} (your role)</>
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
                14. Product<span className="star">*</span>
                {aiFilledFields.has('product') && <span className="ai-badge">AI</span>}
              </div>
              <Pills field="product" options={PRODUCTS} />
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
  )
}
