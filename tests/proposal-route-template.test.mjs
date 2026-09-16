import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const proposal = fs.readFileSync(new URL('../src/pages/Proposal.jsx', import.meta.url), 'utf8')

test('Firm Offer route template defines its own proposal currency symbol', () => {
  const routeTemplate = proposal.slice(proposal.indexOf('function RouteTemplateTab'), proposal.indexOf('// Qty/Unit'))
  assert.match(routeTemplate, /const proposalSymbol = currencySymbol\(p\?\.sourceCurrency \|\| 'INR'\)/)
  assert.match(routeTemplate, /Unit price \(\$\{proposalSymbol\}\)/)
})
