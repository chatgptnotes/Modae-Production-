import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedSales, PERMS, ROLES } from '../src/seed.js'
import { salesPerformance, FY_QUARTERS, FY_MONTHS, fyQuarter } from '../src/kpi.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const store = { sales: seedSales }

// Biji, 13 Aug: "there has to be something called My Dashboard… it will be
// different for all the roles." The page previously split eight roles on one
// boolean and showed everyone the same four cards.
test('My Dashboard branches per role', () => {
  const source = read('src/pages/MyDashboard.jsx')
  for (const fn of ['SalesDashboard', 'ApproverDashboard', 'AdminDashboard', 'TechDashboard']) {
    assert.match(source, new RegExp(`function ${fn}\\(`), `${fn} must exist`)
  }
  assert.match(source, /const sales = isSalesOwner\(role\)/)
  assert.match(source, /const tech = role === 'TECH'/)
  // TECH used to fall into the sales branch and see a near-empty page.
  assert.ok(source.indexOf('if (tech) return <TechDashboard') > 0)
})

// The page must be reachable without a sidebar — the tablet/phone shell has none,
// and the store defaults to tablet mode at <=1024px.
test('My Dashboard is reachable on phone and tablet', () => {
  const app = read('src/App.jsx')
  const tabletApp = read('src/tablet/TabletApp.jsx')
  const tiles = read('src/tablet/tabletTiles.js')
  assert.match(app, /import TabletApp from '\.\/tablet\/TabletApp\.jsx'/,
    'App must delegate tablet mode to the tablet shell')
  assert.match(tabletApp, /const BOTTOM = \[[\s\S]*?to: '\/my-dashboard'/,
    'the tablet bottom tab bar must carry My Dashboard')
  assert.match(tiles, /key: 'mydashboard'/, 'the tablet tile registry must carry My Dashboard')
  // And it must appear in every role group's tablet layout.
  for (const group of ['sales', 'approver', 'admin']) {
    const section = tiles.match(new RegExp(`${group}: \\[[\\s\\S]*?\\n  \\]`))
    assert.ok(section && section[0].includes('mydashboard'),
      `${group} tablet tasks must include mydashboard`)
  }
})

test('every internal role can still open My Dashboard', () => {
  for (const role of Object.keys(ROLES).filter(r => r !== 'CUST')) {
    assert.ok(PERMS[role]?.includes('mydashboard'), `${role} must reach My Dashboard`)
  }
  assert.ok(!PERMS.CUST.includes('mydashboard'))
})

// --------------------------------------------------------------- sales maths
test('a sales owner gets their own target and booked orders', () => {
  const rs = salesPerformance(store, 'RS')
  assert.equal(rs.annual, seedSales.targets.RS.annual)
  assert.deepEqual(rs.quarterTarget, seedSales.targets.RS.q)
  // Achieved is the sum of that owner's booked orders, and of their quarters.
  const own = seedSales.orders.filter(o => o.owner === 'RS')
  assert.equal(rs.achieved, own.reduce((s, o) => s + o.valueK, 0))
  assert.equal(rs.achieved, rs.quarterActual.reduce((a, b) => a + b, 0))
  assert.equal(rs.achieved, rs.monthly.reduce((a, b) => a + b, 0))
  assert.equal(rs.gap, rs.annual - rs.achieved)
})

test('no owner sees another owner"s numbers', () => {
  const rs = salesPerformance(store, 'RS')
  assert.ok(rs.orders.every(o => o.owner === 'RS'))
})

test('an approver sees the whole company, not one owner', () => {
  const all = salesPerformance(store)
  const everyTarget = Object.values(seedSales.targets).reduce((s, t) => s + t.annual, 0)
  assert.equal(all.annual, everyTarget)
  assert.equal(all.achieved, seedSales.orders.reduce((s, o) => s + o.valueK, 0))
})

// Indian financial year — Q1 is April to June, not January to March.
test('booking dates bucket into the Indian financial year', () => {
  assert.equal(FY_QUARTERS.length, 4)
  assert.equal(FY_MONTHS[0], 'Apr')
  assert.equal(FY_MONTHS[11], 'Mar')
  assert.equal(fyQuarter('2026-04-12'), 0)
  assert.equal(fyQuarter('2026-07-08'), 1)
  assert.equal(fyQuarter('2026-11-30'), 2)
  assert.equal(fyQuarter('2027-02-14'), 3)
  assert.equal(fyQuarter(''), -1)
})

test('run rate and expected pace follow months elapsed', () => {
  const rs = salesPerformance(store, 'RS')
  assert.equal(Math.round(rs.expected), Math.round(rs.annual / 12 * seedSales.monthsElapsed))
  assert.equal(Math.round(rs.runRate), Math.round(rs.achieved / seedSales.monthsElapsed * 12))
})

test('an owner with no target does not divide by zero', () => {
  const none = salesPerformance({ sales: { targets: {}, orders: [], monthsElapsed: 0 } }, 'NOBODY')
  assert.equal(none.annual, 0)
  assert.equal(none.attainPct, 0)
  assert.equal(none.runRate, 0)
  assert.ok(Number.isFinite(none.gap))
})
