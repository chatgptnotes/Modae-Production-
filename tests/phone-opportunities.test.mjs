import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'

const require = createRequire(import.meta.url)
function load(entry) {
  assert.ok(fs.existsSync(entry), `Missing mobile opportunity view: ${entry}`)
  const { outputFiles } = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-router-dom'], loader: { '.css': 'empty' }, define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
  return module.exports
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(Component, props)))

test('phone opportunity row protects commercial values and links to the existing record', () => {
  const { PhoneOpportunityRow } = load('src/pages/PhoneOpportunityViews.jsx')
  const opportunity = { id: '2609002PP', sellTo: 'Adani Power', oppName: 'VM600 spares', owner: 'PP', milestone: 'Sourcing', valueK: 618 }
  const hidden = render(PhoneOpportunityRow, { opportunity, canSeeValue: false })
  assert.match(hidden, /href="\/opp\/2609002PP"/)
  assert.match(hidden, /Adani Power/)
  assert.match(hidden, /Sourcing/)
  assert.doesNotMatch(hidden, /6,18,000|618000/)
  assert.match(render(PhoneOpportunityRow, { opportunity, canSeeValue: true }), /6,18,000/)
})

test('phone workflow shows every configured step and keeps future steps locked', () => {
  const { PhoneOpportunityProgress } = load('src/pages/PhoneOpportunityViews.jsx')
  const steps = [{ slug: 'intake', label: 'Intake' }, { slug: 'sourcing', label: 'Sourcing' }, { slug: 'proposal', label: 'Proposal' }]
  const html = render(PhoneOpportunityProgress, { steps, activeStep: 'sourcing', completedThrough: 1 })
  assert.match(html, /Step 2 of 3/)
  assert.match(html, /View all steps/)
  assert.match(html, /disabled=""[^>]*aria-label="Proposal/)
  assert.match(html, /aria-current="step"/)
})

test('phone sourcing cards hide pricing and edit actions from restricted roles', () => {
  const { PhoneSourcingLine } = load('src/workbench/PhoneSourcing.jsx')
  const html = render(PhoneSourcingLine, { line: { id: 'L1', pn: 'IN081', qty: 2 }, description: 'Monitoring spare', item: { qty: 2, adjustedUnitPrice: 999, lineTotal: 1998 }, source: 'Approved price list', canPrice: false, formatMoney: value => `₹${value}` })
  assert.match(html, /IN081/)
  assert.match(html, /Monitoring spare/)
  assert.match(html, /Pricing restricted/)
  assert.doesNotMatch(html, /999|1998|Edit line|Compare|Confirm match/)
})

test('expired sourcing prices never appear confirmed and cannot be confirmed', () => {
  const { PhoneSourcingLine } = load('src/workbench/PhoneSourcing.jsx')
  const html = render(PhoneSourcingLine, { line: { id: 'L1', pn: 'IN081', qty: 2, confirmed: true, priceState: 'Expired' }, item: { qty: 2 }, description: 'Monitoring spare', canPrice: true, confirmable: false, formatMoney: () => '₹100' })
  assert.match(html, /Expired/)
  assert.doesNotMatch(html, /phone-source-status--confirmed/)
  assert.match(html, /disabled=""[^>]*aria-label="Confirm match/)
})

test('opening grouped currency values preserves the numeric amount when committed unchanged', () => {
  const { sourcingNumberDraft } = load('src/workbench/PhoneSourcing.jsx')
  assert.equal(typeof sourcingNumberDraft, 'function')
  assert.equal(Number(sourcingNumberDraft('1,23,456.50')), 123456.5)
  assert.equal(Number(sourcingNumberDraft('1,234')), 1234)
  assert.equal(Number(sourcingNumberDraft('-1,496')), -1496)
  assert.equal(Number(sourcingNumberDraft(0)), 0)
})

test('portaled phone editors inherit changing workflow read-only state explicitly', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  const sourcing = fs.readFileSync('src/workbench/WbSpares.jsx', 'utf8')
  assert.match(workbench, /<SourcingTab[^>]+readOnly=\{workflowReadOnly\}/)
  assert.match(workbench, /<WbSpares[^>]+readOnly=\{readOnly\}/)
  assert.match(sourcing, /phone && comm && !readOnly && editingItem/)
  assert.match(sourcing, /if \(!comm \|\| readOnly\) return/)
})
