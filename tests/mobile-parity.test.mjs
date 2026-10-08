import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildTabletTiles } from '../src/tablet/tabletTiles.js'
import { canSeePage } from '../src/utils.js'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('every full-site workspace route has a mobile counterpart', () => {
  const routes = source => [...source.matchAll(/<Route path="([^"]+)"/g)].map(match => match[1])
  const mobile = new Set(routes(read('src/tablet/TabletApp.jsx')))
  for (const route of routes(read('src/App.jsx'))) assert.ok(mobile.has(route), `Mobile route missing: ${route}`)
})

test('home tiles use combined permissions without excluding the active role', () => {
  const store = { role: 'RS', roles: ['RS', 'ADMIN'], opportunities: [], approvals: [], leads: [], poCompare: {} }
  const tiles = buildTabletTiles(store)
  assert.ok(tiles.some(tile => tile.key === 'users'))
  assert.ok(tiles.some(tile => tile.key === 'inbox'))
  for (const tile of tiles) assert.ok(canSeePage(store.roles, tile.page))
})
