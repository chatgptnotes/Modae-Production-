import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('inbox list and detail routes always call the pagination hook before returning', () => {
  const source = readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8').split('export default function Inbox()')[1]
  const pagination = source.indexOf('usePagedRows(mailboxRows')
  const detailReturn = source.indexOf('if (sel) {')
  assert.ok(pagination > 0 && detailReturn > pagination, 'An early detail return changes the hook count when opening a lead')
})

test('lead customer is resolved before initializing decision fields', () => {
  const source = readFileSync(new URL('../src/pages/Inbox.jsx', import.meta.url), 'utf8').split('function AiLeadDetail(')[1]
  assert.ok(source.indexOf('const customer = matchCustomer') < source.indexOf('useState(initialDecisions)'), 'Initial decision fields read customer location during render')
})
