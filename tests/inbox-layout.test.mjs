import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const inbox = fs.readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8')

test('inbox description retains an accessible title under the shared top bar', () => {
  assert.match(inbox, /<div className="mailbox-head">\s*<div>\s*<h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="inbox" size=\{18\} \/> Lead inbox<\/h2>\s*<p className="hint">\{showArchive \? 'Discarded lead archive' : scope === 'my' \? 'Your assigned leads · AI structures, humans decide' : 'Common sales mailbox · AI structures, humans decide'\}<\/p>/)
  assert.match(css, /\.mailbox-head > div > \.hint \{ color: var\(--text-muted\); font-size: 13px; line-height: 1\.4; \}/)
})

test('inbox keeps every column available in a horizontally scrollable desktop grid', () => {
  assert.match(css, /\.mail-date b, \.mail-date small \{ display: block;[\s\S]*white-space: nowrap; \}/)
  assert.match(css, /--mail-grid-template:[\s\S]*32px 32px[\s\S]*110px 156px minmax\(300px, 1fr\)[\s\S]*76px 116px 82px;/)
  assert.match(css, /grid-template-columns: var\(--mail-grid-template\);[\s\S]*width: max\(100%, 1240px\); min-width: 1240px;/)
  assert.match(css, /\.mailbox-list \{[\s\S]*overflow-x: auto;/)
  assert.match(css, /\.mailbox-list \{ scrollbar-width: none; \}/)
  assert.match(css, /\.mailbox-list::-webkit-scrollbar \{ display: none; \}/)
  assert.match(css, /\.mailbox-horizontal-scrollbar \{ display: none;[\s\S]*?height: 10px;/)
  assert.match(css, /\.mailbox-horizontal-scrollbar::before \{[^}]*background: #E5E7EB;/)
  assert.match(css, /\.mailbox-horizontal-scrollbar:hover \.mailbox-horizontal-scrollbar-thumb \{ background: #ED3F2F; \}/)
  assert.match(inbox, /role="scrollbar"[\s\S]*?aria-orientation="horizontal"[\s\S]*?onPointerMove=\{moveMailboxScrollDrag\}/)
  assert.match(css, /\.mail-list-toolbar \{[\s\S]*min-width: 0;/)
  assert.match(inbox, /<div className="mail-column-head"[^>]*>\s*<div className="mail-list-toolbar">/)
  assert.doesNotMatch(css, /@container \(max-width: (900|1180|1400)px\)/)
  assert.doesNotMatch(css, /\.mail-column-head > :nth-child\((8|10|12)\), \.mail-row > :nth-child\(/)
  for (const label of ['Received', 'Source / sender', 'Subject / preview', 'AI route', 'Urgency', 'Completeness', 'Suggested owner', 'Status', 'Age']) {
    assert.match(inbox, new RegExp(label.replace(/[/.]/g, '\\$&')))
  }
  assert.doesNotMatch(inbox, /filterMenu\('duplicate',/)
  assert.doesNotMatch(inbox, /<div><Chip tone=\{l\.duplicateRisk/)
  assert.match(inbox, /age == null \? '—' : age === 0 \? 'Today' : `\$\{age\} d old`/)
  assert.match(inbox, /filterMenu\('received', receivedF, setReceivedF, 'Received date'/)
  assert.match(inbox, /filterMenu\('source', sourceF, setSourceF, 'Source \/ sender'/)
  assert.match(inbox, /filterMenu\('completeness', completenessF, setCompletenessF,[\s\S]*?'Complete'/)
  assert.match(inbox, /aria-haspopup="menu" aria-expanded=\{isOpen\}/)
  assert.match(inbox, /role="menuitemradio" aria-checked=\{value === entry\.value\}/)
})

test('inbox metadata stays compact while subject content stacks clearly', () => {
  assert.match(css, /\.mail-head-filter \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?cursor: pointer;/)
  assert.match(css, /\.mail-head-filter \{[\s\S]*?border: 0 !important;[\s\S]*?border-radius: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/)
  assert.match(css, /\.mail-column-head \.mail-head-filter:hover \{[\s\S]*?background: transparent !important;[\s\S]*?color: var\(--primary-deep\);/)
  assert.match(css, /\.mail-column-head \.mail-head-filter:focus-visible \{[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;[\s\S]*?outline: 0;[\s\S]*?text-decoration: underline;/)
  assert.match(css, /\.mail-column-head \.mail-head-filter\.active \{[\s\S]*?background: transparent !important;[\s\S]*?color: var\(--primary-deep\);/)
  assert.match(css, /\.mail-header-filter-menu \{[\s\S]*?overflow-y: auto;/)
  assert.match(css, /\.mail-header-filter-option \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-sender b, \.mail-sender small \{[\s\S]*?display: block;[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-row > \.mail-content \{[\s\S]*?display: flex;[\s\S]*?white-space: normal;/)
  assert.match(css, /\.mail-content-stack \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?white-space: normal;/)
  assert.match(css, /\.mail-subject-meta \{[\s\S]*?display: flex;[\s\S]*?white-space: nowrap;/)
  assert.match(css, /\.mail-content small \{[\s\S]*?-webkit-line-clamp: 2;/)
  assert.match(css, /\.shell \.mail-opportunity-link \{\s*border: 0;/)
})

test('inbox rows reserve room for opportunity, subject, and preview lines', () => {
  assert.match(css, /\.mail-row\s*\{[\s\S]*?min-height:\s*106px;/)
  assert.match(css, /\.mail-content small::before \{ content: none; \}/)
  assert.match(css, /\.shell \.mail-row > \.mail-content \.mail-subject-meta > button\.mail-opportunity-link\s*\{[\s\S]*?min-height:\s*0 !important;[\s\S]*?border:\s*0 !important;[\s\S]*?background:\s*transparent !important;/)
})

test('inbox date metadata stacks cleanly without an inline separator', () => {
  assert.match(css, /\.mail-date \{[\s\S]*white-space: normal;[\s\S]*line-height: 1\.2;/)
  assert.match(css, /\.mail-date small::before \{ content: none; \}/)
})

test('inbox owner and status columns keep their metadata readable', () => {
  assert.match(css, /\.mail-owner \{[\s\S]*font-weight: 700;/)
  assert.match(css, /\.mail-row > div > \.pill \{[\s\S]*display: inline-flex;[\s\S]*white-space: nowrap;/)
})

test('inbox headers are bold, Status is left-aligned, and Age is right-aligned', () => {
  assert.match(css, /\.mail-column-head \{[\s\S]*color: var\(--text-main\);[\s\S]*font-weight: 800;/)
  assert.match(css, /\.shell \.mail-column-head \.mail-head-filter,[\s\S]*font-size: clamp\(12px, 1\.05cqi, 14px\);[\s\S]*font-weight: 800;/)
  assert.match(css, /\.mail-column-head \.mail-age-head,\s*\.mail-column-head \.mail-age-head \.mail-head-filter,\s*\.mail-row > \.mail-age \{ text-align: right; \}/)
  assert.doesNotMatch(css, /\.mail-column-head \.mail-status-head,\s*\.mail-column-head \.mail-age-head/)
  assert.match(inbox, /className="mail-head-filter-cell mail-status-head"/)
  assert.match(inbox, /className="mail-head-filter-cell mail-age-head"/)
  assert.match(inbox, /<div className="mail-status"><span className=\{`pill/)
})

test('inbox filter menus keep readable colors outside the themed application shell', () => {
  assert.match(css, /\.mail-header-filter-menu \{[^}]*background: #FFFFFF;[^}]*color: #282828;[^}]*color-scheme: light;/)
  assert.match(css, /\.mail-header-filter-menu \.mail-header-filter-option \{[^}]*background: #FFFFFF !important;[^}]*color: #374151 !important;/)
  assert.match(css, /\.mail-header-filter-menu \.mail-header-filter-option:hover,[\s\S]*?background: #FDEDEB !important; color: #9E1F14 !important;/)
})

test('new enquiry modal imports the hook used by its file picker', () => {
  assert.match(inbox, /import React, \{ useEffect, useRef, useState \} from 'react'/)
  assert.match(inbox, /function PasteLeadModal\(\{ onClose \}\)[\s\S]*const fileInput = useRef\(null\)/)
})

test('inbox omits the redundant result count above the shared header', () => {
  assert.match(css, /\.mail-column-head, \.mail-row \{[\s\S]*?--mail-grid-template:[\s\S]*?grid-template-columns: var\(--mail-grid-template\);/)
  assert.doesNotMatch(css, /\.mail-column-head\s*\{\s*--mail-grid-template:/)
  assert.match(inbox, /<div className="mailbox-list-panel">\s*<div className="mailbox-list"[^>]*>[\s\S]*?<div className="mail-column-head"[^>]*>/)
  assert.doesNotMatch(inbox, /mail-list-summary|1–\$\{mailboxRows\.length\} of/)
  assert.doesNotMatch(inbox, /<div className="mail-column-head"[^>]*>[\s\S]*?mail-list-count/)
})

test('inbox confines its horizontally scrollable grid to the workspace', () => {
  assert.match(css, /\.mailbox-page \{\s*width: 100%;\s*max-width: none;\s*min-width: 0;\s*box-sizing: border-box;/)
  assert.match(css, /\.mailbox-list \{\s*width: 100%;[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;[\s\S]*?overflow-x: auto;/)
  assert.match(css, /\.mail-list-toolbar \{ width: 100%; min-width: 0; \}/)
  assert.match(css, /\.mail-column-head,\s*\.mail-row \{ width: max\(100%, 1240px\); min-width: 1240px; box-sizing: border-box; \}/)
  assert.match(css, /\.mailbox-list \{\s*width: 100%;\s*max-width: 100%;\s*min-width: 0;\s*box-sizing: border-box;\s*overflow-x: auto;\s*border: 0;\s*box-shadow: none;/)
})

test('inbox actions share the compact column header row', () => {
  assert.match(css, /\.mail-list-toolbar \{[\s\S]*grid-column: 1 \/ span 2;[\s\S]*min-height: 0;[\s\S]*height: 100%;/)
  assert.match(css, /\.mail-column-head \{ position: relative; min-height: 44px;/)
  assert.match(css, /\.mail-column-head \{ position: sticky; top: 0; z-index: 3; \}/)
  assert.doesNotMatch(css, /\.mail-column-head \{ position: sticky; top: 44px;/)
})

test('inbox column headings wrap onto readable lines', () => {
  assert.match(css, /\.mail-column-head \.mail-subject-head \{[^}]*white-space: normal;/)
  assert.match(css, /\.mail-column-head span \{[^}]*white-space: normal; overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-head-filter \{[^}]*min-height: 30px;[^}]*white-space: normal;/)
})

test('inbox always uses fitted rows instead of summary cards', () => {
  assert.doesNotMatch(inbox, /LeadSummaryCard|shouldShowSparseCards/)
  assert.doesNotMatch(inbox, /compactMailbox|showDenseView|sparse-view-toggle/)
  assert.doesNotMatch(inbox, /has-sparse-cards|sparse-filter-bar|lead-sparse-cards/)
  assert.match(inbox, /<div className="mail-column-head"[^>]*>/)
  assert.match(inbox, /pageRows\.map\(l => \{[\s\S]*?className=\{`mail-row /)
})

test('inbox keeps pagination visible outside the scrolling message list', () => {
  assert.match(inbox, /React\.cloneElement\(pagination, \{ alwaysVisible: true, label: 'Inbox pages' \}\)/)
  assert.match(inbox, /<div className="mailbox-list-panel">[\s\S]*?<div className="mailbox-list"[^>]*>[\s\S]*?<\/div>[\s\S]*?<\/div>/)
  assert.match(inbox, /<InboxLeadPreview key=\{previewLead\.id\} lead=\{previewLead\} \/>}\s*<\/div>\s*\{inboxPagination\}\s*\{!showArchive && <WorkspaceInsights signals=\{inboxInsights\} \/>\}/)
  assert.match(css, /\.mailbox-split\s*\{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/)
  assert.match(css, /\.mailbox-list-panel\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;/)
  assert.match(css, /\.mailbox-list-panel > \.mailbox-list\s*\{[^}]*overflow-y: auto;/)
  assert.match(css, /\.mailbox-page > \.list-pagination\s*\{[^}]*width: 100%;/)
})

test('inbox reduces the vertical gaps around its filters and summary', () => {
  assert.match(css, /\.mailbox-page\s*\{\s*padding-top: 16px !important;/)
  assert.match(css, /\.mailbox-page > \.mailbox-head\s*\{\s*margin-bottom: 8px;/)
  assert.match(css, /\.mailbox-page > \.mail-search-row\s*\{\s*margin-bottom: 8px;/)
  assert.match(css, /\.mailbox-page > \.workspace-insights\s*\{\s*min-height: 34px; margin: 0 0 6px;[^}]*border-left: 3px solid #D99200;[^}]*background: #FFFBF1;/)
})

test('Lead Preview wraps field columns and scrolls within its panel', () => {
  assert.match(css, /\.mailbox-preview\s*\{[^}]*height: 100%; max-height: 100%;[^}]*overflow-y: auto;/)
  assert.match(css, /\.mailbox-preview-field\s*\{[^}]*grid-template-columns: minmax\(80px, \.8fr\) minmax\(0, 1\.4fr\) 34px;/)
  assert.match(css, /\.mailbox-preview-field b\s*\{[^}]*white-space: normal; overflow-wrap: break-word;/)
  assert.doesNotMatch(css, /\.mailbox-preview-field b\s*\{[^}]*text-overflow: ellipsis;/)
  assert.match(css, /\.mailbox-preview section > p\s*\{[^}]*overflow-wrap: anywhere;/)
  assert.match(css, /\.mailbox-preview-excerpt\s*\{\s*max-height: none; overflow: visible;/)
  assert.match(inbox, /function PreviewFieldText\(\{ value \}\)[\s\S]*?split\(\/\(\[@\._\/-\]\)\/\)[\s\S]*?<wbr \/>/)
  assert.match(inbox, /<PreviewFieldText value=\{field\.v\} \/>/)
  assert.match(inbox, /<PreviewFieldText value=\{`\$\{lead\.sender/)
})

test('inbox aging alert remains a compact full-width banner below pagination', () => {
  assert.match(inbox, /<InboxLeadPreview key=\{previewLead\.id\} lead=\{previewLead\} \/>}\s*<\/div>\s*\{inboxPagination\}\s*\{!showArchive && <WorkspaceInsights signals=\{inboxInsights\} \/>\}/)
  assert.match(css, /\.mailbox-page > \.list-pagination\s*\{[^}]*width: 100%;/)
  assert.match(css, /\.mailbox-page > \.workspace-insights\s*\{[^}]*min-height: 34px;[^}]*border-left: 3px solid #D99200;/)
})

test('inbox controls reflow from workspace width instead of widening the shell', () => {
  assert.match(css, /@container workspace \(max-width: 70rem\) \{[\s\S]*?\.mailbox-page > \.mailbox-head \{[\s\S]*?flex-wrap: wrap;/)
  assert.match(css, /@container workspace \(max-width: 70rem\) \{[\s\S]*?\.mail-search-row \{[\s\S]*?flex-wrap: wrap;/)
  assert.match(css, /@container workspace \(max-width: 44rem\) \{[\s\S]*?\.mail-search \{[\s\S]*?flex-basis: 100%;/)
})

test('desktop inbox uses the compact rail and flat full-width mailbox surface', () => {
  assert.match(css, /\.shell\s*\{\s*--sidenav-w:\s*216px;\s*--shell-nav-w:\s*216px;/)
  assert.match(css, /\.shell\.sidebar-compact\s*\{\s*--sidenav-w:\s*80px;\s*--shell-nav-w:\s*80px;/)
  assert.match(css, /@media \(min-width: 1025px\)[\s\S]*?\.shell:not\(\.tablet-mode\) \.mailbox-page\s*\{[\s\S]*?width:\s*100%;[\s\S]*?padding-inline:/)
  assert.match(css, /@media \(min-width: 1025px\)[\s\S]*?\.shell:not\(\.tablet-mode\) \.mailbox-list\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?box-shadow:\s*none;/)
})

test('simulated inquiries return to the shared inbox after saving', () => {
  assert.match(inbox, /store\.addLead\(lead\)/)
  assert.match(inbox, /store\.addOpportunity\(/)
  assert.match(inbox, /store\.updateLead\(lead\.id, \{ status: 'Converted', oppId \}\)/)
  assert.match(inbox, /reserveOppId\(store\.opportunities, owner, store\.config\?\.roleNames\)/)
  assert.match(inbox, /setSimulationOpen\(false\)\r?\n\s+nav\('\/inbox'\)/)
  // The stop-at-inbox option instead opens the New lead, returning before any
  // opportunity is created — the class gates are then walked manually.
  assert.match(inbox, /if \(!simRegister\) \{/)
  assert.match(inbox, /nav\('\/inbox\/' \+ lead\.id\)\r?\n\s+return/)
})

test('lead inbox does not expose the simulated inquiry header button', () => {
  assert.doesNotMatch(inbox, /<button[^>]*setSimulationOpen\(true\)[\s\S]*?Simulate incoming inquiry/)
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

test('inbox refresh pulls shared data in place', () => {
  assert.match(inbox, /onRefresh=\{\(\) => \{ void store\.refreshSharedData\(\) \}\}/)
  assert.doesNotMatch(inbox, /title="Refresh inbox"[^\n]*window\.location\.reload/)
})

test('stale unavailable AI summaries have a targeted repair path', () => {
  assert.match(inbox, /isUnavailableAiSummary = lead => \/\^AI extraction was unavailable/)
  assert.match(inbox, /const staleAiLeads = \(store\.leads \|\| \[\]\)\.filter\(isUnavailableAiSummary\)/)
  assert.match(inbox, /const repairStaleAi = async \(\) =>/)
  assert.match(inbox, /action: 'lead\.re-extract-stale-summary'/)
  assert.match(inbox, /Repaired stale AI extraction summary/)
  assert.match(inbox, /Repair \$\{staleAiLeads\.length\} stale AI summar/)
})

test('rate-limited extraction is presented as a temporary retry state', () => {
  assert.match(inbox, /aiResult\.errorCode === 'AI_RATE_LIMITED'/)
  assert.match(inbox, /AI extraction is temporarily busy/)
  assert.match(inbox, /retry shortly/)
})

test('subject and preview stay contained inside the inbox cell', () => {
  assert.match(inbox, /className="mail-subject-head"[^>]*title="Subject \/ preview">Subject<\/span>/)
  assert.match(inbox, /className="mail-subject-meta">[\s\S]*className="mail-subject-title">\{l\.subject\}/)
  assert.match(inbox, /<small>\{l\.ai\?\.summary \|\| l\.body\?\.replace/)
  assert.match(inbox, /className="mail-content-stack"/)
  assert.match(css, /\.mail-subject-meta \{[\s\S]*overflow: hidden;/)
  assert.match(css, /\.mail-subject-meta \{[\s\S]*flex-wrap: nowrap;[\s\S]*white-space: nowrap;/)
    assert.match(css, /\.mail-opportunity-link \{[\s\S]*white-space: nowrap;/)
  assert.match(css, /\.mail-opportunity-link \{[\s\S]*background: transparent !important;/)
  assert.match(css, /\.mail-row \{[\s\S]*min-height: 58px;[\s\S]*overflow: hidden;/)
  assert.match(css, /\.mail-subject-title \{[\s\S]*display: block;[\s\S]*white-space: normal;[\s\S]*overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-content small \{[\s\S]*display: -webkit-box;[\s\S]*white-space: normal;[\s\S]*overflow-wrap: anywhere;/)
  assert.match(css, /\.mail-column-head \.mail-subject-head \{[\s\S]*white-space: normal;/)
  assert.match(css, /minmax\(300px, 1fr\)/)
})

test('opportunity scope is optional during lead qualification and registration', () => {
  assert.match(inbox, /const missing = \['Customer name', 'Required quantities and specifications'\]/)
  assert.match(inbox, /if \(text\.includes\('opportunity scope'\)\) return false/)
  assert.match(inbox, /<textarea rows=\{5\} value=\{decisionDraft\.scope\}/)
  assert.match(css, /\.lead-decision-grid input, \.lead-decision-grid select, \.lead-decision-grid textarea \{[\s\S]*border: 1px solid var\(--ws-border-strong\)/)
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
    assert.match(register, /const missingInfo = \[/)
    assert.match(register, /!\/opportunity\\s\+scope\/i\.test/)
})

test('AI missing information is optional for registration', () => {
  assert.match(inbox, /const registrationBlocked = missingIdentity\.length > 0 \|\| inquiryMissing \|\| registrationPendingLow\.length > 0 \|\| verificationBlocked/)
  // The interactive "Missing information" panel (with per-item +Add) is the
  // single source of truth for optional follow-up items — a second static
  // "Optional information still missing" box used to repeat the same list.
  assert.match(inbox, /Missing information<\/span>/)
  assert.doesNotMatch(inbox, /Optional information still missing/)
})

test('compact lead review keeps the AI clarification email action visible', () => {
  assert.match(inbox, /Draft clarification email/)
  assert.match(inbox, /Ask customer for missing information/)
  assert.match(inbox, /Record customer response/)
  assert.doesNotMatch(inbox, /Add customer clarification response/)
  assert.doesNotMatch(inbox, /onDraftClarification={draftClarificationMail}/)
  assert.match(inbox, /title="Ask customer for missing information"/)
  assert.match(inbox, /Compare with original email/)
  assert.match(inbox, /lead-decision-compare-modal/)
  assert.match(inbox, /open={!compact \|\| !!clarDraft}/)
  assert.match(inbox, /clarification-compose-modal mail-compose-modal/)
  assert.match(inbox, /clarification-response-modal mail-compose-modal/)
  assert.match(css, /\.mail-compose-modal[\s\S]*max-height: min\(90vh, 820px\)/)
  assert.match(css, /\.mail-compose-modal textarea[\s\S]*max-height: min\(38vh, 360px\)/)
  assert.match(inbox, /async function draftClarificationMail\(\)/)
  assert.match(inbox, /clarification-rail/)
  assert.doesNotMatch(css, /\.structured-active-sections \.compact-workflow-content \.compact-action-col \.compact-clarification-rail[\s\S]*display: none/)
})

test('compact lead review keeps the two-column rail and left-side review order', () => {
  assert.match(inbox, /className=\{`ws-group\$\{compact \? ' lead-decision-section-head' : ''\}`\}/)
  const leadCard = inbox.indexOf('className="lead-decision-card"')
  const compareCard = inbox.indexOf('className="lead-compare-card"')
  const missingPanel = inbox.indexOf('className="lead-missing-information-panel"')
  assert.ok(leadCard >= 0 && compareCard > leadCard && missingPanel > compareCard)
  assert.match(inbox, /compact-source-rail[\s\S]*LeadSourceContext/)
  assert.match(inbox, /lead-compare-card[\s\S]*Compare with original email/)
  assert.match(css, /\.lead-detail-layout[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 390px\)/)
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
  const inbox = fs.readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8')
  assert.match(workbench, /const leadKycVerified = opp\.leadVerification\?\.status === 'Verified'/)
  assert.match(workbench, /const displayedKycStatus = leadKycVerified \? 'Valid'/)
  assert.match(workbench, /import \{ verificationItem \} from '\.\.\/leadVerification\.js'/)
  assert.match(workbench, /'Verified', undefined, 'simulated'/)
  assert.match(workbench, /item\.value \|\| .*verificationItem\(sourceLead\.verification, name\)\.value/)
  assert.match(workbench, /ID: \{item\.value \|\| verificationItem\(sourceLead\.verification, name\)\.value\}/)
  assert.match(register, /kyc: leadVerification\.status === 'Verified' \? 'Valid' : 'Pending'/)
  assert.match(inbox, /const leadVerification = verificationSnapshot\(\{ \.\.\.lead, existingCustomerKyc: customer\?\.kyc === 'Valid' \}, customerStatus/)
  assert.match(inbox, /kyc: leadVerification\.status === 'Verified' \? 'Valid' : 'Pending'/)
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
  assert.match(inbox, /<CustomerPicker[\s\S]*value=\{decisionDraft\.sellTo\}/)
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
  assert.match(inbox, /<div className="lead-missing-information-panel">\{missingInformationPanel\}<\/div>/)
  assert.match(inbox, /lead-decision-actions[\s\S]*?<\/div>\s*\{compact && <div className="lead-missing-information-panel">/)
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
