import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const pdfPath = path.join(root, 'ModAE_Application_Page_Map_A3.pdf')

test('the ModAE application map is an A3 landscape PDF covering the internal navigation', () => {
  assert.ok(fs.existsSync(pdfPath), 'the application map PDF must be delivered at the repository root')
  const pdf = fs.readFileSync(pdfPath, 'latin1')

  assert.match(pdf, /^%PDF-1\.4/, 'the deliverable must be a valid PDF')
  assert.match(pdf, /\/MediaBox \[0 0 1190\.55 841\.89\]/, 'the map must use A3 landscape dimensions')
  assert.match(pdf, /ModAE internal site/i, 'the map must have one top-level tree root')
  assert.match(pdf, /tree diagram/i, 'the PDF must identify the tree layout')
  for (const label of [
    'Daily workspace', 'Opportunity workspace', 'Reporting and records', 'Admin and tools',
    'My Dashboard', 'Lead Inbox', 'Register', 'Opportunities', 'My Opportunities', 'Approvals',
    'Proposal Sent', 'Purchase Orders', 'Analytics', 'Customers', 'Price Lists', 'Folders',
    'Tender Intake', 'Admin', 'Users and roles', 'Audit trail', 'AI Map', 'Voice Update',
    'Customer Portal', 'Desktop sidebar', 'Tablet navigation',
  ]) assert.match(pdf, new RegExp(label, 'i'), `map must include ${label}`)
})
