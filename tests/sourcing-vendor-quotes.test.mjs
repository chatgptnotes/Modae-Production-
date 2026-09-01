import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { migrate, seedState, emptyState } from '../src/appState.js'

const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
const store = fs.readFileSync('src/store.jsx', 'utf8')
const api = fs.readFileSync('api/ai.js', 'utf8')
const edgeAi = fs.readFileSync('supabase/functions/ai/index.ts', 'utf8')
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

test('manufacturer RFQs are repeatable and can feed spares pricing', () => {
  assert.match(workbench, /Draft manufacturer RFQ/, 'Sourcing must offer a manufacturer RFQ composer')
  assert.doesNotMatch(workbench, /disabled=\{!!rfqDraft\}/, 'one draft must not block more manufacturers')
  assert.match(workbench, /store\.addVendorQuote\(opp\.id/, 'sending an RFQ must create a quote record')
  assert.match(workbench, /store\.attachVendorQuoteFile\(quoteFor\.id/, 'manufacturer replies must attach to quote records')
  assert.match(workbench, /store\.applyVendorQuoteToLine\(quoteFor\.id/, 'quoted price must be applicable to a spares line')
  assert.match(store, /applyVendorQuoteToLine\(id, lineId, price\)/, 'store must own line price application')
  assert.match(store, /priceList: label/, 'applying a quote must update the spares line price source')
  assert.match(store, /priceState: 'Current'/, 'applying a quote must clear stale price status')
})

test('Sourcing can generate and save an AI vendor response simulation', () => {
  assert.match(workbench, /runJson\('vendor\.quote'/, 'Sourcing must call the vendor quote AI task')
  assert.match(workbench, /Simulate vendor response/, 'Sourcing must expose the simulation action')
  assert.match(workbench, /store\.addVendorQuote\(opp\.id/, 'the simulated response must be saved as a vendor quote')
  assert.match(workbench, /store\.recordAiAction\(opp\.id/, 'the simulation must be auditable')
  assert.match(api, /vendor\.quote/, 'the Vercel AI route must support vendor quotes')
  assert.match(edgeAi, /vendor\.quote/, 'the Supabase AI function must support vendor quotes')
})

test('vendor quote state is backfilled and cleared with demo business records', () => {
  assert.deepEqual(migrate({ ...seedState(), vendorQuotes: undefined }).vendorQuotes, [])
  assert.deepEqual(emptyState({ ...seedState(), vendorQuotes: [{ id: 'VQ-1' }] }).vendorQuotes, [])
})

test('proposal imports PDF/enquiry line items for project and spares routes', () => {
  assert.match(proposal, /store\.leadArchive/, 'archived source enquiries must also be discoverable')
  assert.match(proposal, /opp\.rfqNumber.*l\.ref/, 'the source enquiry can be matched by reference')
  assert.match(proposal, /routeForType\(opp\.oppType\) === 'Service'/, 'service proposals keep their separate scope flow')
  assert.match(register, /routeForType\(oppType\) !== 'Service'/, 'registered project/spares proposals must carry extracted lines')
  assert.match(inbox, /routeForType\(resolvedOppType\) !== 'Service'/, 'converted project/spares proposals must carry extracted lines')
  assert.match(editor, /Bill of quantities/, 'the imported lines must appear in the editable BOQ')
  assert.match(editor, /Extract BOQ from buyer PDF/, 'existing opportunities must be able to extract their buyer PDF directly')
  assert.match(proposal, /extractPdfText\(file\)/, 'the BOQ action must read the PDF rather than inventing rows')
  assert.match(proposal, /boqSource: `PDF: \$\{file\.name\}`/, 'the source PDF must be recorded on the proposal')
  assert.match(proposal, /route\.toLowerCase\(\).*proposal template/, 'route notices must not reuse stale template labels')
  assert.match(proposal, /proposal-artifact-tabs/, 'the proposal page must expose one canonical artifact navigation row')
  assert.match(editor, /Extract BOQ from buyer PDF/, 'BOQ extraction remains available inside Edit Sheet')
  assert.doesNotMatch(editor, /proposal-workbook-tabs/, 'the duplicate workbook sheet navigation must be removed')
})
