import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const inbox = fs.readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8')

test('inbox keeps received date and time visible in the narrow grid', () => {
  assert.match(css, /\.mail-date b, \.mail-date small \{ display: block; white-space: nowrap; \}/)
  const narrowStart = css.indexOf('@media (max-width: 900px)', css.indexOf('.mail-date'))
  const narrow = css.slice(narrowStart, css.indexOf('\n@media', narrowStart + 1))
  assert.match(narrow, /26px 24px 78px[\s\S]*?minmax\(0, \.9fr\);/)
  assert.doesNotMatch(narrow, /42px;/)
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

test('subject and preview stay in a contained single-line inbox cell', () => {
  assert.match(inbox, /className="mail-subject-head"[^>]*>Subject \/ preview/)
  assert.match(inbox, /className="mail-subject-line">[\s\S]*<b>\{l\.subject\}<\/b>/)
  assert.match(inbox, /<small>\{l\.ai\?\.summary \|\| l\.body\?\.replace/)
  assert.match(inbox, /className="mail-content-stack"/)
  assert.match(css, /\.mail-subject-line \{[\s\S]*text-overflow: ellipsis; white-space: nowrap;/)
  assert.match(css, /\.mail-content small \{[\s\S]*text-overflow: ellipsis; white-space: nowrap;/)
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

test('customer KYC display honors verified lead-stage data and simulated mode', () => {
  const workbench = fs.readFileSync(new URL('../src/pages/Workbench.jsx', import.meta.url), 'utf8')
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
  assert.match(workbench, /const leadKycVerified = opp\.leadVerification\?\.status === 'Verified'/)
  assert.match(workbench, /const displayedKycStatus = leadKycVerified \? 'Valid'/)
  assert.match(workbench, /'Verified', undefined, 'simulated'/)
  assert.match(register, /kyc: leadVerification\.status === 'Verified' \? 'Valid' : 'Pending'/)
})

test('Opportunity Customer/KYC tab can complete optional customer details', () => {
  const workbench = fs.readFileSync(new URL('../src/pages/Workbench.jsx', import.meta.url), 'utf8')
  assert.match(workbench, /Customer commercial details/)
  assert.match(workbench, /store\.updateOpportunity\(opp\.id, patch\)/)
  assert.match(workbench, /type: 'Customer master change'/)
  assert.match(workbench, /shippingAddress: opp\.shippingAddress/)
  assert.match(workbench, /shippingPincode: opp\.shippingPincode/)
  assert.match(workbench, /GSTIN/)
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
