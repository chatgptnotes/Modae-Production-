import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { migrate, seedState, emptyState } from '../src/appState.js'

const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
const store = fs.readFileSync('src/store.jsx', 'utf8')

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

test('vendor quote state is backfilled and cleared with demo business records', () => {
  assert.deepEqual(migrate({ ...seedState(), vendorQuotes: undefined }).vendorQuotes, [])
  assert.deepEqual(emptyState({ ...seedState(), vendorQuotes: [{ id: 'VQ-1' }] }).vendorQuotes, [])
})