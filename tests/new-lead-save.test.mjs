import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const inbox = fs.readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')

test('New Lead waits for its explicit save instead of scheduling a duplicate', () => {
  const modal = inbox.slice(inbox.indexOf('function PasteLeadModal'), inbox.indexOf('function LeadSourceContext'))
  assert.match(modal, /store\.addLead\([\s\S]{0,1600}scheduleSave: false \}\)/)
  assert.match(modal, /store\.flushPersistence\(\[\{entity:'leads',id\}\]\)/)
})

test('failed New Lead saves retry the same lead ID', () => {
  const modal = inbox.slice(inbox.indexOf('function PasteLeadModal'), inbox.indexOf('function LeadSourceContext'))
  assert.match(modal, /if \(pendingLead\.current\)[\s\S]*?flushPersistence\(\[\{entity:'leads',id:pendingLead\.current\}\]\)/)
})

test('other lead creation paths retain addLead automatic saves by default', () => {
  const addLead = store.slice(store.indexOf('addLead(lead,'), store.indexOf('// Throw away the rows the inbox simulator generated'))
  assert.match(addLead, /scheduleSave = true/)
  assert.match(addLead, /if \(scheduleSave\) setTimeout/)
})
