import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ entryPoints: ['src/pages/PhoneInbox.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' }, define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) } })
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const { PhoneLeadRow, phoneSender } = module.exports
const render = lead => renderToStaticMarkup(React.createElement(PhoneLeadRow, { lead, onOpen() {}, onStar() {}, onSelect() {} }))
test('phone inbox shows readable sender identity and accessible star outside selection mode', () => {
  const html = render({ id: 'A', sender: 'Ruchika Zade <ruchika@example.com>', subject: 'Long industrial quotation request', status: 'Converted', starred: true, ts: '2026-09-25' })
  assert.match(html, /Ruchika Zade/)
  assert.match(html, /phone-lead-avatar/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /Remove star/)
  assert.match(html, /phone-lead-status/)
  assert.doesNotMatch(html, /type="checkbox"/)
})
test('phone inbox handles missing sender, subject, timestamp and preview', () => {
  const html = render({ id: 'B', status: 'New' })
  assert.match(html, /Unknown sender/)
  assert.match(html, /Untitled enquiry/)
  assert.match(html, /No preview available/)
  assert.doesNotMatch(html, /Invalid Date|undefined/)
})
test('sender display never invents a contact name from an email address', () => {
  assert.equal(phoneSender({ from: 'procurement@example.com' }), 'procurement')
  assert.equal(phoneSender({ sender: '"Eastern Alloy Works" <rfq@example.com>' }), 'Eastern Alloy Works')
  assert.equal(phoneSender({ sender: 'rfq@example.com', senderName: 'Sales office' }), 'Sales office')
})

test('archive stars remain visible but do not offer an unsupported update', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneLeadRow, { lead: { id: 'archive', subject: 'Archived lead', starred: true }, archived: true, onOpen() {}, onStar() {} }))
  assert.match(html, /aria-pressed="true" disabled=""/);
})
