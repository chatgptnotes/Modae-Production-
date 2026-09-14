import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const source = read('src/pages/IntakeForm.jsx')
const bodyStart = source.indexOf('export default function IntakeForm')

// A component declared inside the render body is a new element type on every
// render, so React unmounts and remounts it — which made every text field in
// Create Opportunity lose focus after a single keystroke. Keep Select/Pills/Input
// at module scope.
test('field components are declared at module scope, not inside the render body', () => {
  assert.ok(bodyStart > 0, 'IntakeForm component must be found')
  const head = source.slice(0, bodyStart)
  const body = source.slice(bodyStart)

  for (const name of ['Select', 'Pills', 'Input']) {
    assert.match(head, new RegExp(`function ${name}\\(`),
      `${name} must be declared at module scope`)
    assert.doesNotMatch(body, new RegExp(`(const|function)\\s+${name}\\s*[=(]`),
      `${name} must not be re-declared inside IntakeForm — it causes focus loss`)
  }
})

test('field components receive form state through context', () => {
  assert.match(source, /const FormCtx = React\.createContext/)
  const provider = source.match(/<FormCtx\.Provider value=\{\{([^}]*)\}\}>/)
  assert.ok(provider, 'the form must be wrapped in the provider')
  for (const key of ['f', 'setF', 'set', 'validation', 'selectedProducts']) {
    assert.ok(provider[1].includes(key), `the context must carry ${key}`)
  }
  assert.match(source, /<\/FormCtx\.Provider>/)
})

// Set.prototype.add ignores extra arguments, so add('location', 'eucLocation')
// silently dropped eucLocation and its "AI" badge could never render.
test('every AI-filled field is added to the badge set individually', () => {
  const multiArg = source.match(/filledFields\.add\([^)]*,[^)]*\)/g)
  assert.equal(multiArg, null,
    `Set.add takes one value; found ${multiArg?.join(', ')}`)
  assert.match(source, /filledFields\.add\('eucLocation'\)/)
})

// Products are multi-select; business unit and segment stay single-select.
test('products use a compact checkbox dropdown while other classification pills are radios', () => {
  assert.match(source, /function ProductDropdown\(/)
  assert.match(source, /className={`product-dropdown/)
  assert.match(source, /type="checkbox"/)
  assert.match(source, /if \(field === 'product'\) return <ProductDropdown options=\{options\} \/>/)
  assert.match(source, /type="radio" name=\{field\}/)
})

// The intake form stored `selectedProducts.join(', ')`, so the tracker's and
// drawer's single-value <select> rendered blank for a multi-product opportunity
// and silently overwrote the list on the next change.
test('the intake form stores product as an array, not a joined string', () => {
  assert.match(source, /product: selectedProducts,/)
  assert.doesNotMatch(source, /product: selectedProducts\.join/)
})

test('product readers normalise through productList/productLabel', () => {
  for (const [file, symbol] of [
    ['src/pages/Tracker.jsx', 'productLabel'],
    ['src/opppanel.jsx', 'productList'],
    ['src/pages/Analytics.jsx', 'productList'],
    ['src/proposalDoc.js', 'productLabel'],
  ]) {
    assert.match(read(file), new RegExp(symbol), `${file} must normalise product values`)
  }
  // A raw equality filter silently drops every multi-product opportunity.
  assert.doesNotMatch(read('src/pages/Analytics.jsx'), /o\.product === f\.product/)
  // A single-value <select> cannot represent a list.
  assert.doesNotMatch(read('src/pages/Tracker.jsx'), /<select value=\{o\.product\}/)
  assert.doesNotMatch(read('src/opppanel.jsx'), /<select value=\{opp\.product\}/)
})
