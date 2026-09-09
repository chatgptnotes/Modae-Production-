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

test('opportunity scope is optional during lead qualification and registration', () => {
  assert.match(inbox, /const missing = \['Customer name', 'Required quantities and specifications'\]/)
  assert.match(inbox, /if \(text\.includes\('opportunity scope'\)\) return false/)
  const register = fs.readFileSync(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8')
  assert.match(register, /missingInfo = .*filter\(item => !\/opportunity\\s\+scope\/i\.test/)
})

test('red leads explain why payment confirmation is not shown', () => {
  assert.match(inbox, /Red customer — payment confirmation/)
  assert.match(inbox, /Payment confirmation is not required at Lead stage/)
  assert.match(inbox, /joint LJS \+ AH approval shown above/)
})
