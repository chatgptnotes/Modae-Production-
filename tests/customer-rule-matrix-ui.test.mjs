import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { workbookDefaults } from '../src/workbookGovernance.js'
import { matrixDraft, compileMatrix } from '../src/admin/customerRuleMatrix.js'

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ entryPoints: ['src/admin/WorkbookGovernanceEditor.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' } })
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const render = (config, canEdit) => renderToStaticMarkup(React.createElement(module.exports.default, { store: { config }, canEdit }))

test('customer governance renders only the Excel matrix with its four ordered colour columns', () => {
  const html = render(workbookDefaults(), true)
  assert.equal((html.match(/<table/g) || []).length, 1)
  assert.match(html, /Criteria<\/th>.*Blue<\/th>.*Red<\/th>.*Amber<\/th>.*Green<\/th>.*Remarks<\/th>/)
  assert.match(html, /value="₹25K pr Quote Fees"/)
  assert.match(html, /Save rules/)
  assert.doesNotMatch(html, /<details|Are we following Excel|Review and confirm|Document checklists|KYC number validation|Price-list/)
  const admin = readFileSync('src/pages/Admin.jsx', 'utf8')
  const customerPanel = admin.split('id="admin-subpanel-customer"')[1].split('id="admin-panel-fields"')[0]
  assert.doesNotMatch(customerPanel, /KYC number validation|ServiceRateSheetEditor/)
})

test('saved matrix wording and remarks survive rendering and viewers cannot edit cells', () => {
  const draft = matrixDraft(workbookDefaults())
  draft.classificationCriteria[0].cells.Blue = '5-10 Years'
  draft.classificationCriteria[0].remarks = 'Check company register'
  const { config } = compileMatrix(draft)
  const html = render(config, false)
  assert.match(html, /value="5-10 Years"/)
  assert.match(html, /value="Check company register"/)
  const inputs = html.match(/<input[^>]*>/g)
  assert.ok(inputs.length > 100)
  assert.ok(inputs.every(input => input.includes('disabled=""')))
})

test('unclear cells provide compact keyboard-accessible help without repeated warning lines', () => {
  const html = render(workbookDefaults(), true)
  assert.match(html, /class="matrix-definition-help"/)
  assert.match(html, /aria-label="Needs definition: Customer Legacy \(Years\) \/ Blue"/)
  assert.match(html, /role="tooltip"/)
  assert.doesNotMatch(html, /<small class="matrix-needs-definition"/)
  assert.match(html, /class="matrix-accounts-row"/)
})
