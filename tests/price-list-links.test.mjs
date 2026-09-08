import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const spares = fs.readFileSync('src/workbench/WbSpares.jsx', 'utf8')
const priceLists = fs.readFileSync('src/pages/PriceLists.jsx', 'utf8')

test('Sourcing price-list sources deep-link to the exact part', () => {
  assert.match(spares, /navigate\(`\/pricelists\?list=\$\{encodeURIComponent\(list\)\}&part=\$\{encodeURIComponent\(part\)\}`\)/)
  assert.match(spares, /line\.priceSource === PRICE_SOURCES\.LIST/)
  assert.match(spares, /title="Open this part in the price list"/)
})

test('Price Lists selects and highlights a deep-linked part', () => {
  assert.match(priceLists, /useSearchParams\(\)/)
  assert.match(priceLists, /requestedPartMatch/)
  assert.match(priceLists, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/)
  assert.match(priceLists, /price-list-highlight/)
  assert.match(priceLists, /original source list/)
})
