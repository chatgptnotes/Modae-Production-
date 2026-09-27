import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { migrate, seedState, emptyState } from '../src/appState.js'

const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
const sparesWorkbench = fs.readFileSync('src/workbench/WbSpares.jsx', 'utf8')
const store = fs.readFileSync('src/store.jsx', 'utf8')
const api = fs.readFileSync('api/ai.js', 'utf8')
const proposal = fs.readFileSync('src/pages/Proposal.jsx', 'utf8')
const register = fs.readFileSync('src/pages/Register.jsx', 'utf8')
const inbox = fs.readFileSync('src/pages/Inbox.jsx', 'utf8')
const editor = fs.readFileSync('src/proposal/ProposalSheetEditor.jsx', 'utf8')

test('clarifications require an answer capture before becoming answered', () => {
  assert.match(workbench, /setAnswerFor\(c\)/, 'the row action must open the answer modal')
  assert.match(workbench, /store\.answerClarification\(answerFor\.id/, 'saving the modal records the answer')
  assert.doesNotMatch(workbench, /store\.updateClarification\(c\.id, \{ status: 'Answered' \}\)/,
    'a clarification must not be blindly marked answered without the response')
  assert.match(workbench, /Files \/ mail evidence/, 'answer evidence upload must be offered')
  assert.match(store, /answerClarification\(id, \{ response, answerSource/, 'store must own answer persistence')
})

test('List Unit keeps only the plain editable amount', () => {
  assert.doesNotMatch(sparesWorkbench, /sourcing-unit-price|sourcing-unit-symbol|sourcing-unit-meta/)
  assert.doesNotMatch(sparesWorkbench, /Source: \{line\.currency\}/)
})

test('sourcing uses one native horizontal scroll container', () => {
  assert.match(sparesWorkbench, /className="sheet-wrap sourcing-sheet-wrap"/)
  assert.doesNotMatch(sparesWorkbench, /sourcing-horizontal-scrollbar|sourcingScrollbarRef|sourcingScrollbarContentRef/)
})

test('sourcing table reserves bottom space for the native horizontal scrollbar', () => {
  const styles = fs.readFileSync('src/styles.css', 'utf8')
  assert.match(styles, /\.sourcing-sheet-wrap \{[\s\S]*box-sizing: border-box;[\s\S]*padding-bottom: 14px;/)
})

test('valid manual sourcing lines are confirmed when added', () => {
  assert.match(sparesWorkbench, /const quantity = Math\.max\(0, n\(newLine\.qty\)\)/)
  assert.match(sparesWorkbench, /confirmed: quantity > 0 && price > 0/)
  assert.match(sparesWorkbench, /priceState: price > 0 \? 'Current' : 'Needs pricing'/)
})

test('editing a row with manual pricing confirms it when the amount is valid', () => {
  assert.match(sparesWorkbench, /patch\.confirmed = isConfirmableSparesLine\(\{ \.\.\.line, \.\.\.patch \}\)/)
})

test('removed sourcing rows keep normal text contrast', () => {
  const styles = fs.readFileSync('src/styles.css', 'utf8')
  assert.match(styles, /\.sourcing-zero-row \{ opacity: 1; \}/)
})

test('support rows are not created automatically', () => {
  assert.match(store, /Compatibility no-op: optional support rows are created only through/)
  assert.match(store, /origin !== 'proposal-support'/)
  assert.match(store, /sparesLines: s\.sparesLines\.map\(l => \(l\.id === id \? updated : l\)\)/)
})

test('Sourcing reconciles missing structured lead rows for existing opportunities', () => {
  assert.match(sparesWorkbench, /reconciledOppRef/, 'reconciliation must run once per opportunity mount')
  assert.match(sparesWorkbench, /Sourcing lines restored from lead/, 'restored rows must be auditable')
  assert.match(sparesWorkbench, /store\.addSparesLinesFromLead\(opp\.id, workbenchRows/, 'missing lead rows must be added to sourcing')
  assert.match(store, /addSparesLinesFromLead\(oppId, rows, \{ auditAction = 'Lead lines imported' \}/)
})

test('Sourcing catalogue reconciliation is stable and does not autosave on render', () => {
  assert.match(sparesWorkbench, /const lines = useMemo\(\(\) => store\.sparesLines\.filter\(/)
  assert.match(sparesWorkbench, /\), \[store\.sparesLines, opp\.id\]\)/)
  assert.match(sparesWorkbench, /const changed = Object\.keys\(reconciled\)\.some\(key => reconciled\[key\] !== line\[key\]\)/)
  assert.match(sparesWorkbench, /\}, \[sourcingDataStatus, lines, store\.priceLists\]\)/)
})

test('a pending pricing approval can explicitly refresh its shared status', () => {
  assert.match(sparesWorkbench, /Refresh approval status/)
  assert.match(sparesWorkbench, /store\.refreshSharedData\(\)/)
  assert.match(sparesWorkbench, /refreshingApproval/)
})

test('vendor quote support remains in shared store modules after Sourcing panels are removed', () => {
  assert.doesNotMatch(workbench, /Vendor \/ price-list versions|Vendor actions \(Coming soon\)|Manufacturer quotes \(Coming soon\)/)
  assert.doesNotMatch(workbench, /Draft manufacturer RFQ|Upload \/ apply response/)
  assert.match(store, /addVendorQuote\(oppId, quote\)/, 'vendor quote records must remain supported')
  assert.match(store, /attachVendorQuoteFile\(id, file\)/, 'manufacturer replies must remain attachable')
  assert.match(store, /applyVendorQuoteToLine\(id, lineId, price\)/, 'quoted prices must remain applicable to sourcing lines')
  assert.match(store, /priceList: label/, 'applying a quote must update the spares line price source')
  assert.match(store, /priceState: 'Current'/, 'applying a quote must clear stale price status')
})

test('vendor quote application cannot confirm an unpriced sourcing line', () => {
  assert.match(store, /const hasPositiveQuotePrice = hasReplacementPrice && unitPrice > 0/)
  assert.match(store, /priceState: hasPositiveQuotePrice \? 'Current' : 'Needs pricing'/)
  assert.match(store, /confirmed: hasPositiveQuotePrice && isConfirmableSparesLine\(normalized\)/)
  assert.match(store, /const unitPrice = hasReplacementPrice[\s\S]*currentLine\?\.listUnitPrice/)
})

test('vendor quote AI contracts remain available outside the removed Sourcing panels', () => {
  assert.doesNotMatch(workbench, /runJson\('vendor\.quote'/)
  assert.doesNotMatch(workbench, /Simulate vendor response/)
  assert.match(api, /vendor\.quote/, 'the Vercel AI route must continue supporting vendor quotes')
  assert.match(api, /vendor\.quote/, 'the Vercel AI route must continue supporting vendor quotes')
  assert.match(workbench, /simulatedVendorRows/, 'existing simulated quotes must remain visible in Communications')
})

test('vendor quote state is backfilled and cleared with demo business records', () => {
  assert.deepEqual(migrate({ ...seedState(), vendorQuotes: undefined }).vendorQuotes, [])
  assert.deepEqual(emptyState({ ...seedState(), vendorQuotes: [{ id: 'VQ-1' }] }).vendorQuotes, [])
})

test('proposal imports PDF/enquiry line items for project and spares routes', () => {
  assert.match(proposal, /store\.leadArchive/, 'archived source enquiries must also be discoverable')
  assert.match(proposal, /opp\.rfqNumber.*l\.ref/, 'the source enquiry can be matched by reference')
  assert.match(proposal, /\['Service', 'Spares'\]\.includes\(routeForType\(opp\.oppType\)\)/, 'service and spares proposals keep their separate workflow flows')
  assert.match(register, /routeForType\(oppType\) !== 'Service'/, 'registered project/spares proposals must carry extracted lines')
  assert.match(inbox, /routeForType\(resolvedOppType\) !== 'Service'/, 'converted project/spares proposals must carry extracted lines')
  assert.match(editor, /Bill of quantities/, 'the imported lines must appear in the editable BOQ')
  assert.doesNotMatch(editor, /Extract BOQ from buyer PDF/, 'BOQ extraction is no longer offered from Edit Sheet')
  assert.doesNotMatch(proposal, /extractPdfText\(file\)/, 'the proposal page does not own a PDF extraction action')
  assert.doesNotMatch(proposal, /boqSource: `PDF:/, 'the proposal page no longer records a PDF extracted from this control')
  assert.match(proposal, /route\.toLowerCase\(\).*proposal template/, 'route notices must not reuse stale template labels')
  assert.match(proposal, /proposal-artifact-tabs/, 'the proposal page must expose one canonical artifact navigation row')
  assert.doesNotMatch(editor, /Extract BOQ from buyer PDF/, 'BOQ extraction remains outside Edit Sheet')
  assert.doesNotMatch(editor, /proposal-workbook-tabs/, 'the duplicate workbook sheet navigation must be removed')
})
