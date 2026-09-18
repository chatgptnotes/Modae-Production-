import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const inbox = fs.readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8')

test('inbox keeps every column visible and scrolls the complete grid narrowly', () => {
  assert.match(css, /\.mail-date b, \.mail-date small \{ display: block; white-space: nowrap; \}/)
  assert.match(css, /minmax\(130px, \.8fr\) minmax\(100px, 1fr\)\s+72px;/)
  assert.match(css, /--mail-grid-template:[\s\S]*minmax\(180px, 1\.35fr\)[\s\S]*minmax\(320px, 4fr\)/)
  assert.match(css, /grid-template-columns: var\(--mail-grid-template\);[\s\S]*min-width: 1350px;/)
  assert.match(css, /\.mailbox-list \{[\s\S]*overflow-x: auto; overflow-y: auto;/)
  assert.match(css, /\.mail-list-toolbar \{[\s\S]*min-width: 1350px;/)
  assert.doesNotMatch(css, /@container \(max-width: (900|1180|1400)px\)/)
  assert.doesNotMatch(css, /\.mail-column-head > :nth-child\((8|10|12)\), \.mail-row > :nth-child\(/)
  for (const label of ['Received', 'Source / sender', 'Subject / preview', 'AI route', 'Urgency', 'Dup. risk', 'Completeness', 'Sugg. owner', 'Status', 'Age']) {
    assert.match(inbox, new RegExp(label.replace(/[/.]/g, '\\$&')))
  }
  assert.match(inbox, /age == null \? '—' : age === 0 \? 'Today' : `\$\{age\} d old`/)
})

test('simulated inquiries return to the shared inbox after saving', () => {
  assert.match(inbox, /store\.addLead\(lead\)/)
  assert.match(inbox, /store\.addOpportunity\(/)
  assert.match(inbox, /store\.updateLead\(lead\.id, \{ status: 'Converted', oppId \}\)/)
  assert.match(inbox, /nextOppId\(store\.opportunities, owner\)/)
  assert.match(inbox, /setSimulationOpen\(false\)\r?\n\s+nav\('\/inbox'\)/)
  // The stop-at-inbox option instead opens the New lead, returning before any
  // opportunity is created — the class gates are then walked manually.
  assert.match(inbox, /if \(!simRegister\) \{/)
  assert.match(inbox, /nav\('\/inbox\/' \+ lead\.id\)\r?\n\s+return/)
})

test('mailbox bulk toolbar actions are wired', () => {
  assert.match(inbox, /const [bulkMenuOpen, setBulkMenuOpen]/)
  assert.match(inbox, /Select all visible/)
  assert.match(inbox, /Clear selection/)
  assert.match(inbox, /Mark selected as read/)
  assert.match(inbox, /Mark selected as unread/)
  assert.match(inbox, /store\.updateLeads\(selectedIds, \{ readAt:/)
  assert.match(fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8'), /updateLeads\(ids, patch, detail = ''\)/)
})

test('stale unavailable AI summaries have a targeted repair path', () => {
  assert.match(inbox, /isUnavailableAiSummary = lead => \/\^AI extraction was unavailable/)
  assert.match(inbox, /const staleAiLeads = \(store\.leads \|\| \[\]\)\.filter\(isUnavailableAiSummary\)/)
  assert.match(inbox, /const repairStaleAi = async \(\) =>/)
  assert.match(inbox, /action: 'lead\.re-extract-stale-summary'/)
  assert.match(inbox, /Repaired stale AI extraction summary/)
  assert.match(inbox, /Repair \$\{staleAiLeads\.length\} stale AI summar/)
})

test('subject and preview stay in a contained two-line inbox cell', () => {
  assert.match(inbox, /className="mail-subject-head"[^>]*>Subject \/ preview/)
  assert.match(inbox, /className="mail-subject-meta">[\s\S]*className="mail-subject-title">\{l\.subject\}/)
  assert.match(inbox, /<small>\{l\.ai\?\.summary \|\| l\.body\?\.replace/)
  assert.match(inbox, /className="mail-content-stack"/)
  assert.match(css, /\.mail-subject-meta \{[\s\S]*overflow: hidden;/)
  assert.match(css, /\.mail-subject-meta \{[\s\S]*flex-wrap: nowrap;[\s\S]*white-space: nowrap;/)
    assert.match(css, /\.mail-opportunity-link \{[\s\S]*white-space: nowrap;/)
  assert.match(css, /\.mail-opportunity-link \{[\s\S]*background: transparent !important;/)
  assert.match(css, /\.mail-row \{[\s\S]*min-height: 88px;[\s\S]*overflow: visible;/)
  assert.match(css, /\.mail-subject-title \{[\s\S]*-webkit-line-clamp: 2;[\s\S]*overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-content small \{[\s\S]*-webkit-line-clamp: 2;[\s\S]*overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-column-head \.mail-subject-head \{[\s\S]*white-space: nowrap;/)
  assert.match(css, /minmax\(320px, 4fr\)/)
})

test('opportunity scope is optional during lead qualification and registration', () => {
  assert.match(inbox, /const missing = \['Customer name', 'Required quantities and specifications'\]/)
  assert.match(inbox, /if \(text\.includes\('opportunity scope'\)\) return false/)
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
    assert.match(register, /const missingInfo = \[/)
    assert.match(register, /!\/opportunity\\s\+scope\/i\.test/)
})

test('AI missing information is optional for registration', () => {
  assert.match(inbox, /const registrationBlocked = missingIdentity\.length > 0 \|\| registrationPendingLow\.length > 0 \|\| verificationBlocked/)
  // The interactive "Missing information" panel (with per-item +Add) is the
  // single source of truth for optional follow-up items — a second static
  // "Optional information still missing" box used to repeat the same list.
  assert.match(inbox, /Missing information<\/span>/)
  assert.doesNotMatch(inbox, /Optional information still missing/)
})

test('internal senders cannot become customer contacts', () => {
  assert.match(inbox, /normalizeLeadContactFields\(ai\.fields/)
  assert.match(inbox, /contactPerson: value\(\/contact person\/i\) \|\| ''/)
})

test('lead extraction applies a final response hardening pass', () => {
  assert.match(inbox, /const ai = hardenLeadExtraction\(aiRaw/)
  const rules = fs.readFileSync(new URL('../src/leadRules.js', import.meta.url), 'utf8')
  assert.match(rules, /const qty = Number\.isFinite\(rawQty\) && rawQty > 0 \? rawQty : 0/)
})

test('customer requests are displayed separately from accepted facts', () => {
  assert.match(inbox, /f\.factType === 'customer_request'/)
  assert.match(inbox, />Customer request<\/Chip>/)
})

test('non-identity low-confidence fields are deferred until the opportunity exists', () => {
  assert.match(inbox, /const deferredPendingLow = pendingLow\.filter\(f => !isRegistrationCriticalField\(f\.k\)\)/)
  assert.match(inbox, /Follow-up information.*low-confidence sourcing or commercial fields/s)
})

test('regional suggestion and assigned owner are kept separate', () => {
  assert.match(inbox, /const regionalOwner = routeOwner\(initialRegion/)
  assert.match(inbox, /owner: savedOverride \? lead\.assignedOwner : regionalOwner/)
  assert.match(inbox, /suggestedOwner: routedOwner \|\| effectiveOwner/)
  assert.match(inbox, /System suggested owner/)
  assert.match(inbox, /Assigned owner/)
})

test('registration carries optional customer details into the opportunity', () => {
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(register, /missingInfo\.forEach\(item => blockers\.push/)
  assert.match(register, /billingAddress: customer\?\.billingAddress/)
  assert.match(register, /shippingPincode: customer\?\.shippingPincode/)
  assert.match(register, /gstin: customer\?\.gstin/)
  assert.match(register, /Follow-up information.*completed later in the Opportunity/s)
})

test('lead extraction is carried into the opportunity record and details view', () => {
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
  const details = fs.readFileSync(new URL('../src/OpportunityDetailsEditor.jsx', import.meta.url), 'utf8')
  assert.match(register, /const rfqNumber = String\(/)
  assert.match(register, /const rfqDate = String\(/)
  assert.match(register, /opportunityScope: scope/)
  assert.match(register, /extractedFields: acceptedLeadFields\(fields\)/)
  assert.match(register, /requestedItems: extracted/)
  assert.match(register, /rfqNumber,/)
  assert.match(details, /label="RFQ Number" value=\{opp\.rfqNumber\}/)
  assert.match(details, /<label>Opportunity Scope<\/label>/)
  assert.match(details, /Accepted extracted lead data/)
  assert.match(details, /Requested items/)
})

test('converted lead decisions expose the extracted BOQ as a quick preview', () => {
  assert.match(inbox, /<ReadOnlyDecisionForm lead=\{lead\} items=\{items\} \/>/)
  assert.match(inbox, /<Field label="BOQ" fieldKey="boq">/)
  assert.match(inbox, /className="boq-preview-link"[^>]*onClick=\{\(\) => setBoqOpen\(true\)\}/)
  assert.match(inbox, /View BOQ · \$\{boqItems\.length\} line/)
  assert.match(inbox, /className="lead-boq-preview-modal"/)
  assert.match(inbox, /<th>Sr\. No\.<\/th><th>Part \/ description<\/th><th>Part number<\/th><th>Qty<\/th><th>UOM<\/th>/)
  assert.match(inbox, /boqItems\.map\(\(item, index\)/)
  assert.doesNotMatch(inbox, /<Field label="Product" fieldKey="product">\{product\}<\/Field>/)
  assert.match(css, /\.boq-preview-link \{[\s\S]*text-decoration: underline;/)
  assert.match(css, /\.lead-boq-preview-table \{[\s\S]*table-layout: fixed;/)
})

test('customer KYC display honors verified lead-stage data and simulated mode', () => {
  const workbench = fs.readFileSync(new URL('../src/pages/Workbench.jsx', import.meta.url), 'utf8')
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
  assert.match(workbench, /const leadKycVerified = opp\.leadVerification\?\.status === 'Verified'/)
  assert.match(workbench, /const displayedKycStatus = leadKycVerified \? 'Valid'/)
  assert.match(workbench, /import \{ verificationItem \} from '\.\.\/leadVerification\.js'/)
  assert.match(workbench, /'Verified', undefined, 'simulated'/)
  assert.match(workbench, /item\.value \|\| .*verificationItem\(sourceLead\.verification, name\)\.value/)
  assert.match(workbench, /ID: \{item\.value \|\| verificationItem\(sourceLead\.verification, name\)\.value\}/)
  assert.match(register, /kyc: leadVerification\.status === 'Verified' \? 'Valid' : 'Pending'/)
})

test('lead KYC upload scans before verification and keeps user confirmation', () => {
  const workbench = fs.readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8')
  const api = fs.readFileSync(new URL('../api/ai.js', import.meta.url), 'utf8')
  assert.match(workbench, /scanKycDocument = async \(item, file, rec\)/)
  assert.match(workbench, /runTaskResult\('kyc\.extract'/)
  assert.match(workbench, /setPendingUpload\(previous => previous\?\.item === item/)
  assert.match(workbench, /Confirm extracted value and verify/)
  assert.match(workbench, /Review the extracted result before confirming/)
  assert.match(workbench, /fileMeta\.scan = scan/)
  assert.match(api, /kyc\.extract/)
  assert.match(api, /kycExtractSchema/)
})

test('lead-stage KYC rows expose real uploaded documents for viewing', () => {
  const workbench = fs.readFileSync(new URL('../src/pages/Workbench.jsx', import.meta.url), 'utf8')
  assert.match(workbench, /const leadVerificationAttachment = \(sourceLead, name, snapshotItem\)/)
  assert.match(workbench, /sourceLead\?\.attachments \|\| \[\]/)
  assert.match(workbench, /className="kyc-file-open lead-verification-file-open"/)
  assert.match(workbench, /openAttachment\(attachment, sourceLead\?\.id \|\| ''\)/)
  assert.match(workbench, /<AttachmentViewer leadId=\{viewingLeadId\}/)
  assert.match(workbench, /attachment && sourceLead\?\.id/)
})

test('Opportunity Customer/KYC tab can complete optional customer details', () => {
  const workbench = fs.readFileSync(new URL('../src/pages/Workbench.jsx', import.meta.url), 'utf8')
  assert.match(workbench, /Customer commercial details/)
  assert.match(workbench, /store\.updateOpportunity\(opp\.id, patch\)/)
  assert.match(workbench, /type: 'Customer master change'/)
  assert.match(workbench, /shippingAddress: opp\.shippingAddress/)
  assert.match(workbench, /shippingPincode: opp\.shippingPincode/)
  assert.match(workbench, /GSTIN/)
  assert.match(workbench, /customer-detail-changed/)
  assert.match(workbench, /const \[dirtyDetailKeys, setDirtyDetailKeys\] = useState\(\(\) => new Set\(\)\)/)
  assert.match(workbench, /setDirtyDetailKeys\(previous => \{/)
  assert.match(workbench, /const normalizeDetailValue = value => String\(value \?\? ''\)\.trim\(\)/)
  assert.match(workbench, /customer-details-save-button/)
  assert.match(workbench, /detailsDirty \? 'primary customer-details-save-button is-dirty' : 'customer-details-save-button'/)
  assert.match(workbench, /disabled=\{!detailsDirty\}/)
  assert.match(workbench, /className="dgrid2 customer-commercial-grid"/)
  assert.match(workbench, /className="customer-commercial-field">Billing address/)
  assert.match(css, /\.customer-commercial-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.customer-commercial-field \{[\s\S]*display: grid;[\s\S]*min-width: 0;/)
  assert.match(css, /\.customer-commercial-field input,[\s\S]*\.customer-commercial-field textarea \{[\s\S]*display: block;[\s\S]*width: 100%;[\s\S]*box-sizing: border-box;/)
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.customer-commercial-grid \{ grid-template-columns: 1fr; \}/)
})

test('red leads explain why payment confirmation is not shown', () => {
  assert.match(inbox, /Red customer — payment confirmation/)
  assert.match(inbox, /Payment confirmation is not required at Lead stage/)
  assert.match(inbox, /joint LJS \+ AH approval shown above/)
})

test('active structured lead details use the full page width', () => {
  assert.match(css, /\.converted-grid\.active-structured-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(css, /\.active-structured-grid > \.converted-main \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/)
  assert.match(css, /structured-active-sections \.compact-workflow-content \.lead-detail-layout,[\s\S]*?width: 100%;[\s\S]*?max-width: none;/)
  assert.match(css, /structured-active-sections \.compact-workflow-content \.lead-detail-layout \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/)
  assert.match(css, /structured-active-sections \.compact-workflow-content \.ws-grid > \.ws-col:nth-child\(2\) \.ws-body \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /structured-active-sections \.compact-workflow-content \.ws-grid > \.ws-col:nth-child\(2\) \.ws-body \{[\s\S]*?align-content: start;/)
  assert.match(css, /@media \(max-width: 820px\) \{[\s\S]*?structured-active-sections \.compact-workflow-content \.ws-grid > \.ws-col:nth-child\(2\) \.ws-body \{[\s\S]*?grid-template-columns: 1fr;/)
})

test('compact lead review uses one decision form and a bounded review rail', () => {
  assert.match(inbox, /compact \? 'Lead decisions' : 'Qualification &amp; ownership'/)
  assert.match(inbox, /compact \? 'Review summary' : 'AI summary & actions'/)
  assert.match(inbox, /> KYC documents<\/span>/)
  assert.match(inbox, /aria-label=\{compact \? 'Review summary'/)
  assert.match(inbox, /className="icon-action act-accept" aria-label=\{`Accept \$\{field\.k\}`\}/)
  assert.match(inbox, /className="decision-status-icon accepted" role="status" aria-label="Accepted"/)
  assert.match(inbox, /className="decision-status-icon review" role="status" aria-label="Review required"/)
  assert.match(inbox, /className="decision-value-row"><input type="text" value=\{decisionDraft\.sellTo\}/)
  assert.match(inbox, /decisionAiStatus\('sellTo'\)/)
  assert.match(inbox, /className="decision-field-heading">Sell To Customer/)
  assert.match(inbox, /className="decision-field-heading">Assigned owner<\/span>/)
  assert.match(inbox, /className="decision-ai-evidence" aria-label=\{`View evidence for \$\{field\.k\}`\} title="View evidence"/)
  assert.match(inbox, /className="decision-ai-evidence-wrap">[\s\S]*?role="dialog" aria-label=\{`Evidence for \$\{field\.k\}`\}/)
  assert.doesNotMatch(inbox, /className="decision-ai-actions"[\s\S]*?aria-label=\{`Reject \$\{field\.k\}`\}/)
  assert.match(css, /\.decision-status-icon \{[\s\S]*?border-radius: 50%;/)
  assert.match(css, /\.decision-value-row \{[\s\S]*?align-items: center;/)
  assert.match(css, /\.decision-value-row > \.decision-status-icon \{[\s\S]*?position: absolute;[\s\S]*?pointer-events: none;/)
  assert.match(css, /\.decision-value-row:has\(> select\) > \.decision-status-icon \{[\s\S]*?right: 28px;/)
  assert.match(css, /\.decision-field-heading \{[\s\S]*?align-items: center;/)
  assert.match(css, /\.decision-field-heading \{[\s\S]*?min-height: 22px;/)
  assert.match(css, /\.decision-ai-evidence-copy \{[\s\S]*?position: absolute;[\s\S]*?z-index: 20;/)
  assert.match(css, /\.decision-ai-evidence-wrap > button\.decision-ai-evidence \{[\s\S]*?appearance: none;[\s\S]*?background: transparent !important;/)
  assert.match(css, /\.decision-ai-actions > button\.icon-action,[\s\S]*?appearance: none;[\s\S]*?background: transparent !important;/)
  assert.match(css, /\.decision-status-icon \{[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;/)
  assert.match(css, /\.converted-details \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.converted-heading h3 \{[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(inbox, /className="structured-rfq-header"[\s\S]*?Structured RFQ details[\s\S]*?className="converted-details"/)
  assert.match(css, /\.structured-rfq-header \{[\s\S]*?border: 1px solid var\(--ws-border\);[\s\S]*?border-radius: 9px;/)
  assert.match(css, /\.structured-rfq-header \{[\s\S]*?position: sticky;[\s\S]*?z-index: 3;/)
  assert.match(inbox, /<span>Missing information<\/span>/)
  assert.match(css, /converted-grid:not\(\.active-structured-grid\)[\s\S]*?grid-template-columns: minmax\(0, 3fr\) minmax\(320px, 2fr\)/)
  assert.match(inbox, /ReadOnlyDecisionForm[\s\S]*?Read-only after conversion/)
  assert.match(css, /\.readonly-decision-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /compact-workflow-content \.lead-detail-main \{[\s\S]*?display: none;/)
  assert.match(css, /compact-workflow-content \.compact-routing-panel \{[\s\S]*?grid-column: 1;/)
  assert.match(css, /compact-workflow-content \.compact-action-col \{[\s\S]*?grid-column: 2;[\s\S]*?overflow: hidden;/)
  assert.match(css, /compact-action-col > \.ws-body \{[\s\S]*?max-height: calc\(100dvh - 150px\);/)
  assert.match(css, /compact-action-col > \.ws-foot > \.ws-action \{[\s\S]*?align-self: stretch;/,
    'the primary footer action should align with the secondary actions')
  assert.match(css, /compact-action-col > \.ws-foot > \.toolbar \{[\s\S]*?align-items: stretch;/,
    'the secondary action group should share the footer alignment')
  assert.match(inbox, /className="primary ws-action registration-action(?: lead-footer-button)?"/,
    'the registration action should have an explicit placement hook')
  assert.match(inbox, /className="primary ws-action registration-action lead-footer-button"/,
    'the registration action should use the shared footer button sizing')
  assert.match(inbox, /className="lead-footer-button" onClick=\{\(\) => setDropping\(true\)\}/,
    'Disqualify should use the shared footer button sizing')
  assert.match(inbox, /className="secondary-action lead-footer-button" onClick=\{\(\) => setReassignOpen\(true\)\}/,
    'Reassign should use the shared footer button sizing')
  assert.match(css, /compact-action-col > \.ws-foot > \.registration-action \{ order: 1; \}/,
    'Create opportunity should appear before secondary actions')
  assert.match(css, /compact-action-col > \.ws-foot > \.toolbar \{[\s\S]*?order: 2;/,
    'Disqualify and Reassign should follow Create opportunity')
  assert.match(css, /compact-action-col > \.ws-foot:has\(> \.registration-action\) \{[\s\S]*?display: flex;/,
    'qualified footer actions should use a flexible row')
  assert.match(css, /ws-foot:has\(> \.registration-action\) > \.registration-action \{[\s\S]*?flex: 1 1 0;[\s\S]*?min-width: 150px;/,
    'the primary registration action should receive the extra label space')
  assert.match(css, /ws-foot:has\(> \.registration-action\) > \.toolbar \{[\s\S]*?flex: 0 1 auto;/,
    'secondary actions should keep content-appropriate widths')
  assert.match(css, /ws-foot:has\(> \.registration-action\) > \.toolbar > button \{[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
    'all footer buttons should retain the same height')
  assert.match(css, /compact-action-col > \.ws-foot > \.toolbar > button,[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
    'footer buttons should share a stable height')
  assert.match(css, /compact-action-col > \.ws-foot > \.lead-footer-button \{[\s\S]*?height: 38px;[\s\S]*?min-height: 38px;/,
    'all lead footer buttons should share one explicit height rule')
  assert.match(inbox, /<div className="lead-decision-subsection">Customer and contact<\/div>/)
  assert.match(inbox, /<div className="lead-decision-subsection">Routing and ownership<\/div>/)
  assert.match(inbox, /aria-label="Search EUC city or state"/)
  assert.match(inbox, /className="location-suggestions euc-location-suggestions" role="listbox"/)
  assert.match(inbox, /const selectEucLocation = \(item\) =>/)
  assert.match(inbox, /const \[eucLocationOpen, setEucLocationOpen\]/)
  assert.match(inbox, /setEucLocationOpen\(false\)/)
  assert.match(inbox, /const value = `\$\{item\.city\}, \$\{item\.state\}`/)
  assert.doesNotMatch(inbox, /<div className="lead-decision-subsection">Opportunity details<\/div>/)
  assert.match(inbox, /<details className="lead-routing-optional lead-decision-full">/)
  assert.match(css, /\.lead-routing-optional > summary \{[\s\S]*?font-weight: 700;/)
  assert.match(css, /\.lead-decision-subsection \{[\s\S]*?font-weight: 800;[\s\S]*?text-transform: uppercase;/)
  assert.match(css, /\.euc-location-search \{[\s\S]*?position: relative;/)
  assert.match(css, /\.euc-location-suggestions \{[\s\S]*?position: absolute;[\s\S]*?z-index: 30;/)
  assert.match(css, /\.compact-missing-rail \{ width: 100%; min-width: 0; \}/)
  assert.match(inbox, /title="Reassign lead"|>Reassign<\/button>/)
  assert.match(inbox, /Choose the salesperson who should own this lead\./)
  assert.match(inbox, /Confirm reassignment/)
  assert.match(css, /\.reassign-modal \{[\s\S]*?max-width: min\(420px, calc\(100vw - 32px\)\)/)
  assert.match(css, /\.secondary-action \{[\s\S]*?background: var\(--ws-blue-soft\) !important;/)
})

test('compact missing information does not duplicate mandatory registration blockers', () => {
  assert.match(inbox, /const reviewMissing = effectiveMissing\.filter\(item => \{/)
  assert.match(inbox, /contact\\s\+\(\?:phone\|number\)/)
  assert.match(inbox, /const displayedMissing = compact \? reviewMissing : effectiveMissing/)
  assert.match(inbox, /const missingInformationPanel = displayedMissing\.length > 0 && \(/)
  assert.match(inbox, /\{displayedMissing\.map\(\(m, i\) => \(/)
})

test('compact missing information has one heading and a direct item list', () => {
  assert.match(inbox, /const missingInformationPanel = displayedMissing\.length > 0 && \(/)
  assert.match(inbox, /<summary>[\s\S]*Missing information/)
  assert.match(inbox, /<ul className="ws-missing compact-missing-list">/)
  assert.doesNotMatch(inbox, /<b>Missing information<\/b>/)
  assert.match(inbox, /\{compact && missingInformationPanel\}[\s\S]*?<div className="lead-decision-actions">/)
  assert.match(inbox, /\{!compact && missingInformationPanel\}/)
})

test('review rail does not show an unscoped add-information control', () => {
  assert.doesNotMatch(inbox, /Add other information/)
  assert.doesNotMatch(inbox, /const \[addOther, setAddOther\]/)
})

test('active lead approval uses a locked viewport and true 3:2 working split', () => {
  assert.match(css, /\.lead-workspace \{[\s\S]*?height: 100%;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/)
  assert.match(css, /\.lead-workspace:has\(\.active-structured-grid\) \.active-structured-grid \{[\s\S]*?display: flex;[\s\S]*?overflow: hidden;/)
  assert.match(css, /\.lead-workspace:has\(\.active-structured-grid\) \.compact-workflow-content \.lead-detail-layout \{[\s\S]*?grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\);/)
  assert.match(css, /\.lead-workspace:has\(\.active-structured-grid\) \.compact-workflow-content \.compact-routing-panel > \.lead-decision-card \{[\s\S]*?overflow-y: auto;/)
  assert.match(css, /\.lead-workspace:has\(\.active-structured-grid\) \.compact-workflow-content \.compact-action-col > \.ws-body \{[\s\S]*?min-height: 0;[\s\S]*?max-height: none;/)
})

test('active lead approval gives both work columns a bounded scroll container', () => {
  assert.match(css, /\.lead-workspace:has\(\.active-structured-grid\) > \.converted-summary,[\s\S]*?display: flex;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/)
  assert.match(css, /compact-routing-panel > \.lead-decision-card,[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/)
  assert.match(css, /compact-action-col > \.ws-body \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/)
})

test('active lead approval keeps the outer content flexible while inner panels scroll', () => {
  assert.match(css, /\.lead-workspace:has\(\.active-structured-grid\) \.active-structured-grid,[\s\S]*?height: auto;[\s\S]*?flex: 1 1 0%;/)
  assert.match(css, /compact-routing-panel > \.lead-decision-card \{[\s\S]*?flex: 1 1 0%;[\s\S]*?overflow-y: auto;/)
  assert.match(css, /compact-action-col > \.ws-body \{[\s\S]*?flex: 1 1 0%;[\s\S]*?overflow-y: auto;/)
})
