import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const spares = fs.readFileSync('src/workbench/WbSpares.jsx', 'utf8')
const priceLists = fs.readFileSync('src/pages/PriceLists.jsx', 'utf8')

test('Sourcing price-list sources open an inline preview for the exact part', () => {
  assert.doesNotMatch(spares, /navigate\(`\/pricelists\?list=/)
  assert.match(spares, /const openPriceList = line =>/)
  assert.match(spares, /setPricePreview\(\{/)
  assert.match(spares, /title="Approved price list preview"/)
  assert.match(spares, /source\.source === PRICE_SOURCES\.LIST/)
  assert.match(spares, /Open \$\{source\.full\} in the price list/)
})

test('Price Lists selects and highlights a deep-linked part', () => {
  assert.match(priceLists, /useSearchParams\(\)/)
  assert.match(priceLists, /requestedPartMatch/)
  assert.match(priceLists, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/)
  assert.match(priceLists, /price-list-highlight/)
  assert.match(priceLists, /original source list/)
})
