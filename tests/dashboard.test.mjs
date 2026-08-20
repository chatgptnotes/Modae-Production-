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

// 20 Aug review, on the Monthly Bookings chart: show all months (April–March),
// a dotted Target Run Rate against a solid Actual Run Rate, and actuals only up
// to the current date. The reference is `chartTrend` in the BT prototype.

test('the target run rate comes from the quarter, not a flat annual twelfth', () => {
  // A flat annual/12 line understates a front-loaded quarter and overstates a
  // back-loaded one. The prototype spreads each quarter's number over its own
  // three months: t.q[Math.floor(i / 3)] / 3.
  const uneven = {
    sales: {
      monthsElapsed: 5, currentQ: 2, orders: [],
      targets: { RS: { annual: 120, q: [60, 30, 20, 10] } },
    },
  }
  const perf = salesPerformance(uneven, 'RS')
  assert.equal(perf.monthlyTarget.length, 12)
  assert.deepEqual(perf.monthlyTarget.slice(0, 3), [20, 20, 20], 'Q1 60 over three months')
  assert.deepEqual(perf.monthlyTarget.slice(9), [10 / 3, 10 / 3, 10 / 3], 'Q4 10 over three months')
  // And it must still add up to the year.
  assert.equal(Math.round(perf.monthlyTarget.reduce((a, b) => a + b, 0)), perf.annual)
})

test('the run-rate series covers the whole financial year', () => {
  const rs = salesPerformance(store, 'RS')
  assert.equal(rs.monthly.length, 12)
  assert.equal(rs.monthlyTarget.length, 12)
  assert.equal(FY_MONTHS.length, 12)
  assert.equal(rs.monthsElapsed, seedSales.monthsElapsed, 'the chart needs to know where "today" is')
})

test('the chart stops the actual line at the current month', () => {
  const source = read('src/pages/MyDashboard.jsx')
  // Truncation, not a full-year series padded with zeros.
  assert.match(source, /const actual = perf\.monthly\.slice\(0, elapsed\)/)
  assert.match(source, /perf\.monthsElapsed/)
  // Target is drawn across all twelve; only the actual is cut short.
  assert.match(source, /points=\{pts\(target\)\}/)
  assert.match(source, /points=\{pts\(actual\)\}/)

  // With the seeded data the year is five months old, so seven months of the
  // actual series must not be drawn as zeros.
  const rs = salesPerformance(store, 'RS')
  assert.ok(rs.monthsElapsed < 12)
  assert.ok(rs.monthly.slice(rs.monthsElapsed).every(v => v === 0),
    'the months being dropped are unbooked, which is exactly why they must not be plotted')
})

test('target is dotted, actual is solid, and neither colour is hardcoded', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /strokeDasharray="5 4"/, 'the target run rate is the dashed line')
  assert.match(source, /stroke="var\(--primary-accent\)" strokeWidth="2\.6"/, 'the actual is the solid brand line')
  assert.doesNotMatch(source, /#94a3b8/, 'the target colour was a hardcoded slate literal')
  const css = read('src/styles.css')
  assert.doesNotMatch(css, /\.legend-line\.target \{ border-top-color: #94a3b8/)
  // The legend has to name both series the way the client does.
  assert.match(source, /Target run rate/)
  assert.match(source, /Actual run rate/)
})

test('the gradient id is unique per chart instance', () => {
  // dashviz's `sparkFade` and Analytics' `fnlRamp` are global literals: two on
  // one page and the second silently inherits the first one's fill.
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /const gradientId = `runrate-fade-\$\{useId\(\)/)
  assert.match(source, /id=\{gradientId\}/)
  assert.match(source, /fill=\{`url\(#\$\{gradientId\}\)`\}/)
})

test('there is one monthly bookings card, not two', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.equal((source.match(/title="Monthly bookings"/g) || []).length, 1)
  // The old sparkline card plotted the same array with no target and no labels.
  assert.doesNotMatch(source, /<Sparkline points=\{monthPoints\}/)
  assert.doesNotMatch(source, /title="Monthly performance against run rate"/)
  assert.doesNotMatch(source, /import \{ ArcGauge, Sparkline \}/, 'the unused import must go too')
})

// dataviz, interaction reference: "An HTML chart is interactive by default — the
// hover layer is part of the deliverable, not an upgrade." Twelve months against
// a target line with no way to read a value is not a finished chart.

test('the bookings chart has a crosshair and a tooltip', () => {
  const source = read('src/pages/MyDashboard.jsx')
  // The crosshair finds the X — the reader aims at a month, not at a 2px line.
  assert.match(source, /onPointerMove=\{event => setHover\(monthAt\(event\)\)\}/)
  assert.match(source, /onPointerLeave=\{\(\) => setHover\(null\)\}/)
  assert.match(source, /className="runrate-crosshair"/)
  // Snapping happens through the viewBox, because the svg scales to the card.
  assert.match(source, /const monthAt = event =>/)
  assert.match(source, /getBoundingClientRect\(\)/)
  assert.match(source, /Math\.round\(\(x - padL\) \/ step\)/)

  const css = read('src/styles.css')
  assert.match(css, /\.runrate-crosshair \{/)
  assert.match(css, /\.runrate-tip \{/)
  assert.match(css, /\.runrate-plot \{ position: relative; \}/)
})

test('one tooltip carries every series at that month', () => {
  // "The readout lists every series at that X — the pointer never has to land
  // on a line or a fill to get a value."
  const source = read('src/pages/MyDashboard.jsx')
  const tip = source.slice(source.indexOf('className={`runrate-tip'), source.indexOf('</div>\n        )}\n      </div>'))
  assert.match(tip, /\{FY_MONTHS\[hover\]\}/, 'the month')
  assert.match(tip, /fmtLakh\(perf\.monthly\[hover\]\)/, 'the actual')
  assert.match(tip, /fmtLakh\(target\[hover\]\)/, 'the target')
  // Values lead, labels follow.
  assert.match(tip, /<strong>\{booked \? fmtLakh\(perf\.monthly\[hover\]\) : '—'\}<\/strong> actual/)
  // Line keys, not boxes.
  assert.match(tip, /<i className="legend-line actual" \/>/)
  assert.match(tip, /<i className="legend-line target" \/>/)
  // A month past the booked window must not read as a booking of zero.
  assert.match(source, /const booked = hover != null && hover < actual\.length/)
  assert.match(tip, /Not booked yet/)
})

test('the keyboard reaches the same readout as the pointer', () => {
  // "Same details on keyboard focus as on hover."
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /tabIndex=\{0\}/)
  assert.match(source, /onKeyDown=\{onKeyDown\}/)
  assert.match(source, /event\.key === 'ArrowRight'/)
  assert.match(source, /event\.key === 'ArrowLeft'/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(read('src/styles.css'), /\.runrate-plot svg:focus-visible/)
})

test('the tooltip enhances but does not gate the values', () => {
  // "Every value a tooltip shows is also reachable without it, through direct
  // labels or the table view."
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /<table className="visually-hidden">/)
  assert.match(source, /<caption>Monthly bookings against target run rate<\/caption>/)
  assert.match(source, /<th scope="row">\{label\}<\/th>/)
  // Twelve rows, both series, and the unbooked months named rather than zeroed.
  assert.match(source, /\{i < actual\.length \? fmtLakh\(perf\.monthly\[i\]\) : 'Not booked yet'\}/)
  assert.match(read('src/styles.css'), /\.visually-hidden \{/)
})
