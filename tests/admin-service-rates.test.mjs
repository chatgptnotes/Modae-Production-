import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { seedRateSheets } from '../src/seed.js'

const source = fs.readFileSync(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8')
const fields = source.slice(source.indexOf('function NumField('), source.indexOf('function AutoSizingTextarea('))
const editor = source.slice(source.indexOf('const RATE_FIELDS ='), source.indexOf('// A real <input'))
const code = transformSync(fields + editor, { loader: 'jsx', format: 'cjs' }).code
function harness(rateSheets, canEdit = true) {
  const values = [], changes = []
  let index = 0
  const store = { rateSheets, refreshSharedData: async () => false, updateRateSheets: (...args) => changes.push(args) }
  const Component = new Function('React', 'useState', 'useStore', 'Chip', code + '; return ServiceRateSheetEditor')(
    React, initial => { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value }] },
    () => store, ({ children }) => React.createElement('span', null, children),
  )
  const tree = () => { index = 0; return Component({ canEdit }) }
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(elements)]
  return { store, changes, tree, html: () => renderToStaticMarkup(tree()), nodes: () => elements(tree()) }
}

for (const [label, sheets] of [
  ['missing collection', undefined], ['empty collection', {}], ['International only', { International: seedRateSheets.International }],
  ['missing rates', { India: { currency: 'INR', gst: 18 } }],
  ['missing field', { India: { ...seedRateSheets.India, rates: { engineerDay: 45 } } }],
  ['missing currency', { India: { ...seedRateSheets.India, currency: undefined } }],
]) {
  test(`Admin stays usable with ${label}`, () => {
    const h = harness(sheets)
    const html = h.html()
    assert.match(html, /Service rates unavailable/)
    assert.match(html, /Retry/)
    assert.doesNotMatch(html, /type="number"/)
    assert.equal(h.changes.length, 0)
  })
}

test('International rates remain selectable when India rates are missing', () => {
  const h = harness({ International: seedRateSheets.International })
  h.nodes().find(n => n.type === 'button' && n.props.children === 'International').props.onClick()
  assert.match(h.html(), /USD/)
  assert.match(h.html(), /value="900"/)
})

test('retry recovers the editor using shared refresh without manufacturing rates', async () => {
  const h = harness({})
  let calls = 0
  h.store.refreshSharedData = async () => { calls++; h.store.rateSheets = structuredClone(seedRateSheets); return true }
  const retry = h.nodes().find(n => n.type === 'button' && n.props.children === 'Retry')
  assert.ok(retry)
  await retry.props.onClick()
  assert.equal(calls, 1)
  assert.match(h.html(), /value="45"/)
  assert.equal(h.changes.length, 0)
})

test('failed retry stays usable and reports the failure', async () => {
  const h = harness({})
  const retry = h.nodes().find(n => n.type === 'button' && n.props.children === 'Retry')
  assert.ok(retry)
  await retry.props.onClick()
  assert.match(h.html(), /could not be refreshed/i)
  assert.match(h.html(), /Retry/)
})

test('valid rates preserve editing and read-only permissions', () => {
  const h = harness(structuredClone(seedRateSheets))
  const field = h.nodes().find(n => n.props.label === 'Engineer / day (K₹)')
  assert.equal(field.props.disabled, false)
  field.props.onChange(52)
  assert.deepEqual(h.changes, [['India', { rates: { engineerDay: 52 } }]])
  const readOnly = harness(seedRateSheets, false)
  assert.ok(readOnly.nodes().filter(n => n.props.label).every(n => n.props.disabled))
})
