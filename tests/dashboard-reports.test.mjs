import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dashboardModel } from '../src/pages/myDashboard/model.js'

const dashboardLayoutCss = readFileSync(new URL('../src/pages/myDashboard/outcomes.css', import.meta.url), 'utf8')
  + readFileSync(new URL('../src/pages/myDashboard/workspace.css', import.meta.url), 'utf8')

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ stdin: { contents: "export { default as Desktop, Performance as DesktopPerformance, TargetManagerDialog } from './src/pages/myDashboard/WorkspaceDashboard.jsx'; export { PhoneReports } from './src/pages/myDashboard/PhoneDashboardReports.jsx'", resolveDir: process.cwd(), loader: 'js', }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' }, define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) } })
const module = { exports: {} }
let selectedFunnelView = 'normal'
// SSR normally renders the default mode; select a saved browser mode for Dynamic coverage.
const testRequire = name => name === 'react' ? { ...require(name), useSyncExternalStore(subscribe, read, serverRead) {
  const value = serverRead()
  return value === 'normal' ? selectedFunnelView : value
} } : require(name)
new Function('require', 'module', 'exports', outputFiles[0].text)(testRequire, module, module.exports)

test('desktop dashboard renders saved opportunity totals and explains an empty FY preview', () => {
  const store = { role: 'LJS', opportunities: [
    { id: 'future', owner: 'LJS', status: 'Open', stage: 'RFQ', valueK: 0, orderDate: '2027-05-31' },
    { id: 'lost', owner: 'LJS', status: 'Closed', stage: 'Lost' },
    { id: 'abandoned', owner: 'LJS', status: 'Closed', stage: 'Abandoned' },
  ], config: {}, approvals: [], proposals: {}, customers: [], clarifications: [],
  sales: { fy: 'FY 2026-27', targets: {}, orders: [] } }
  const html = renderToStaticMarkup(React.createElement(module.exports.Desktop, { store, nav() {} }))
  assert.match(html.replace(/<[^>]*>/g, ''), /3 total · 1 open · 2 closed/)
  assert.match(html, /1 open opportunity.*outside this period or has no expected order date/)
  assert.match(html, /<option value="all">All dates<\/option>/)
})

test('desktop Top 5 gives rank, opportunity ID, displayed name and probability separate columns', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 12) })
  const store = { role: 'LJS', opportunities: [
    { id: '2505010', owner: 'LJS', status: 'Open', stage: 'Budgetary', valueK: 35000,
      orderDate: '2026-10-30', prob: 'Medium', sellTo: 'KSEB Sabrigiri', oppName: 'Hydro equipment' },
  ], config: {}, approvals: [], proposals: {}, customers: [], clarifications: [],
  sales: { fy: 'FY 2026-27', targets: {}, orders: [] } }
  const html = renderToStaticMarkup(React.createElement(module.exports.Desktop, { store, nav() {} }))
  const topFive = html.match(/Top 5 Global Opportunities[\s\S]*?<\/table>/)?.[0]
  assert.ok(topFive)
  assert.match(topFive, /<th>Sr No<\/th><th>Opp ID<\/th><th>Name<\/th>/)
  assert.match(topFive, /<td><b class="reference-rank">1<\/b><\/td><td><strong>2505010<\/strong><\/td><td>KSEB Sabrigiri<\/td>/)
  assert.doesNotMatch(topFive, /Hydro equipment/)
  assert.match(topFive, /<th>Probability<\/th>/)
  assert.match(topFive, /<td>Medium<\/td>/)
})
test('desktop funnel allocates totals columns only when value data is visible', () => {
  const visible = renderToStaticMarkup(React.createElement(module.exports.Desktop, { store: state, nav() {} }))
  const restricted = renderToStaticMarkup(React.createElement(module.exports.Desktop, { store: { ...state, role: 'TECH' }, nav() {} }))
  assert.match(visible, /class="normal-funnel has-values"/)
  assert.match(restricted, /class="normal-funnel"/)
})

test('dashboard chart layout stacks outcomes compactly and keeps funnel labels on one line', () => {
  assert.match(dashboardLayoutCss, /\.winloss-chart-grid\s*\{[^}]*gap:\s*12px/)
  assert.match(dashboardLayoutCss, /\.winloss-chart-grid\s*\{[^}]*padding:\s*8px\s+0\s+12px/)
  assert.match(dashboardLayoutCss, /\.winloss-comparison-bars\s*\{[^}]*display:\s*grid/)
  assert.match(dashboardLayoutCss, /\.winloss-comparison-track\s*\{[^}]*display:\s*flex/)
  assert.match(dashboardLayoutCss, /\.winloss-comparison\s+\.winloss-chart-heading\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(dashboardLayoutCss, /\.reference-funnel-row\s*>\s*strong\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(dashboardLayoutCss, /\.reference-funnel-row\s*>\s*\.reference-funnel-total\s*\{[^}]*white-space:\s*nowrap/)
})
const state = { role: 'LJS', opportunities: [
  { id: 'won', owner: 'LJS', status: 'Closed', stage: 'Won', closedReason: 'Relationship', valueK: 200 },
  { id: 'lost', owner: 'LJS', status: 'Closed', stage: 'Lost', closedReason: 'Capability', valueK: 100 },
], config: {}, approvals: [], proposals: {}, sales: { fy: 'FY 2026-27', targets: {}, orders: [] } }
const renderReports = (phone, store = state, showMoney = true, view = 'normal') => {
  selectedFunnelView = view
  const model = dashboardModel(store)
  const component = phone ? module.exports.PhoneReports : module.exports.Desktop
  try {
    return renderToStaticMarkup(React.createElement(component, { store, model, showMoney, period: 'all', setPeriod() {}, fy: store.sales.fy, canOpen: () => true, nav() {} }))
  } finally { selectedFunnelView = 'normal' }
}
const render = renderReports

test('desktop and phone show all Won value, estimated disclosure, and period controls', () => {
  const store = { ...state, sales: { ...state.sales, targets: { LJS: { annual: 400, q: [100, 100, 100, 100] } } }, opportunities: [
    { id: 'old', owner: 'LJS', status: 'Closed', stage: 'Won', valueK: 200, orderDate: '2025-05-01' },
    { id: 'current', owner: 'LJS', status: 'Closed', stage: 'Won', valueK: 300, orderDate: '2026-10-01' },
  ] }
  for (const phone of [false, true]) {
    const component = phone ? module.exports.PhoneReports : module.exports.DesktopPerformance
    const renderPeriod = period => renderToStaticMarkup(React.createElement(component, {
      store, model: dashboardModel(store, { period, now: new Date('2026-10-12T06:00:00Z') }),
      showMoney: true, scope: 'global', period, setPeriod() {}, fy: store.sales.fy, canOpen: () => true, nav() {},
    }))
    const all = renderPeriod('all')
    assert.match(all, /Won value/)
    assert.match(all, /₹5\.0 L/)
    assert.match(all, /2 unverified Won/)
    if (phone) assert.match(all, /All history/)
    else assert.match(all, /Shown in YTD or QTD/)
    assert.doesNotMatch(all, /<span>Target<\/span><i><b class="target"/)
    const fy = renderPeriod('fy')
    assert.match(fy, /₹3\.0 L/)
    if (phone) assert.match(fy, /Full-year target/)
    else assert.match(fy, /<span>Target<\/span>/)
  }
})

test('desktop and phone compare verified Won value with a confirmed YTD target', () => {
  const store = { ...state, opportunities: [{ id: 'won', owner: 'LJS', status: 'Closed', stage: 'Won', valueK: 900,
    booking: { id: 'BOOK-won', owner: 'LJS', po: 'PO-1', booked: '2026-10-10', valueK: 120 } }],
    sales: { ...state.sales, targets: { LJS: { annual: 400, q: [100, 100, 100, 100] } } } }
  const model = dashboardModel(store, { period: 'fy', now: new Date('2026-10-12T06:00:00Z') })
  for (const component of [module.exports.DesktopPerformance, module.exports.PhoneReports]) {
    const html = renderToStaticMarkup(React.createElement(component, { store, model, showMoney: true,
      scope: 'global', period: 'fy', setPeriod() {}, fy: store.sales.fy, canOpen: () => true, nav() {} }))
    assert.match(html, /Won value/)
    assert.match(html, /₹1\.2 L/)
    if (component === module.exports.PhoneReports) {
      assert.match(html, /Full-year target/)
      assert.match(html, /Remaining to target/)
    } else {
      assert.match(html, /<span>Target<\/span>/)
      assert.match(html, /<span>Gap<\/span>/)
    }
    assert.doesNotMatch(html, /unverified Won/)
  }
})

for (const phone of [false, true]) {
  const viewport = phone ? 'phone' : 'desktop'
  test(`${viewport} reference summary places outcome shares beside the donut and separates decision totals`, () => {
    const store = { ...state, opportunities: [...state.opportunities,
      { id: 'other', owner: 'LJS', status: 'Closed', stage: 'Abandoned', valueK: 900 },
    ] }
    const html = render(phone, store)
    assert.match(html, /class="winloss-summary-main"/)
    assert.match(html, /aria-label="Won 1 \(50%\)/)
    assert.match(html, /aria-label="Lost 1 \(50%\)/)
    assert.match(html, /Won\/Lost Closed<\/dt><dd>2/)
    assert.match(html, /Total Opportunity Value<\/dt><dd>₹3\.0 L/)
    assert.equal((html.match(/class="winloss-count-axis"/g) || []).length, 2)
    if (phone) assert.doesNotMatch(render(phone, store, false), /Total Opportunity Value/)
    assert.doesNotMatch(render(phone, { ...store, role: 'TECH' }), /Total Opportunity Value/)
    const empty = render(phone, { ...state, opportunities: [] })
    assert.match(empty, /aria-label="Won 0 \(—\)/)
    assert.match(empty, /aria-label="Lost 0 \(—\)/)
    const thirds = render(phone, { ...state, opportunities: [...state.opportunities, { ...state.opportunities[1], id: 'l2' }] })
    assert.match(thirds, /aria-label="Won 1 \(33%\)/)
    assert.match(thirds, /aria-label="Lost 2 \(67%\)/)
  })
  test(`${viewport} outcome labels filter reasons and dashboard counts open records`, () => {
    const html = render(phone)
    if (phone) {
      assert.match(html, /<button type="button" data-result="won" aria-pressed="false" aria-label="Won 1[^"]*"/)
      assert.match(html, /<button type="button" data-result="lost" aria-pressed="false" aria-label="Lost 1[^"]*"/)
    } else {
      assert.match(html, /aria-pressed="false" aria-label="Filter reasons: won"/)
      assert.match(html, /aria-pressed="false" aria-label="Filter reasons: lost"/)
      assert.match(html, /aria-label="Won 1 \(50%\), view opportunities"/)
      assert.match(html, /aria-label="Lost 1 \(50%\), view opportunities"/)
    }
    assert.match(html, /Overall win rate/)
    assert.match(html, /data-result="won"[^>]*>[\s\S]*?class="winloss-count-label"[^>]*>[\s\S]*?Won<\/span>[\s\S]*?class="winloss-count-value">1 /)
    assert.match(html, /data-result="lost"[^>]*>[\s\S]*?class="winloss-count-label"[^>]*>[\s\S]*?Lost<\/span>[\s\S]*?class="winloss-count-value">1 /)
    assert.doesNotMatch(html, /aria-label="0 (won|lost) opportunities"/)
  })
  test(`${viewport} Dynamic funnel bar widths track counts while probability splits and totals follow saved data`, () => {
    const render = (phone, store, showMoney = true) => renderReports(phone, store, showMoney, 'dynamic')
    const store = { ...state, opportunities: [
      { id: 'lead', owner: 'LJS', status: 'Open', stage: 'Lead', valueK: 900, prob: 'Low' },
      { id: 'budget1', owner: 'LJS', status: 'Open', stage: 'Budgetary', valueK: 100, prob: 'High' },
      { id: 'budget2', owner: 'LJS', status: 'Open', stage: 'Budgetary', valueK: 200, prob: 'Low' },
      { id: 'budget3', owner: 'LJS', status: 'Open', stage: 'Budgetary', valueK: 300, prob: 'Low' },
      { id: 'rfq', owner: 'LJS', status: 'Open', stage: 'RFQ', valueK: 50, prob: 'Medium' },
    ] }
    const widths = html => [...html.matchAll(/data-width="([\d.]+)"/g)]
      .map(match => Math.round(Number(match[1])))
    const html = render(phone, store)
    assert.deepEqual(widths(html), [47, 80, 47, 30, 30, 30])
    assert.match(html, /Widths adjusted for readability/)
    assert.match(html, /Current stage/)
    const budget = html.split('class="normal-funnel-row"')[2]
    assert.match(budget, /1 high probability opportunities/)
    assert.match(budget, /2 low probability opportunities/)
    assert.match(budget, /<path[^>]*class="normal-funnel-high"/)
    assert.match(budget, /<path[^>]*class="normal-funnel-low"/)
    assert.match(budget, /₹6\.0 L/)
    const restricted = render(phone, { ...store, role: 'TECH' }, false)
    assert.match(restricted, /1 high probability opportunities/)
    assert.doesNotMatch(restricted, /normal-funnel-value|₹/)
    store.opportunities[4].valueK = 0
    assert.deepEqual(widths(render(phone, store)), [47, 80, 47, 30, 30, 30])
    store.opportunities[4].valueK = null
    assert.deepEqual(widths(render(phone, store)), [47, 80, 47, 30, 30, 30])
    store.opportunities[4].stage = 'Firm Bid'
    assert.deepEqual(widths(render(phone, store)), [47, 80, 30, 47, 30, 30])
    store.opportunities.push({ id: 'new-firm-bid', owner: 'LJS', status: 'Open', stage: 'Firm Bid', valueK: 0, prob: 'Medium' })
    assert.match(render(phone, store), /2 medium probability opportunities/)
    assert.deepEqual(widths(render(phone, store)), [47, 80, 30, 63, 30, 30])
    assert.deepEqual(widths(render(phone, { ...store, opportunities: [] })), [30, 30, 30, 30, 30, 30])
  })
  test(`${viewport} reports compare reasons and rank losses in the reference layout`, () => {
    const html = render(phone)
    assert.match(html, /Won vs Lost by Reason/)
    assert.match(html, /Top Loss Reasons \(by count\)/)
    assert.match(html, /All history/)
    assert.equal((html.replace(/<[^>]*>/g, '').match(/Relationship/g) || []).length, 1)
    assert.equal((html.replace(/<[^>]*>/g, '').match(/Capability/g) || []).length, 2)
    assert.match(html, /class="winloss-chart-grid"/)
    assert.match(html, /data-result="won"/)
    assert.match(html, /data-result="lost"/)
    const funnelRow = /class="normal-funnel-row"/g
    assert.equal((html.match(funnelRow) || []).length, 6)
    assert.doesNotMatch(html, /Closed \/ No Win/)
  })
  test(`${viewport} reason comparison renders one stacked Won and Lost bar per reason`, () => {
    const isolated = { ...state, opportunities: [
      { id: 'won-one', owner: 'LJS', status: 'Closed', stage: 'Won', closedReason: 'Relationship', valueK: 200 },
      { id: 'won-two', owner: 'LJS', status: 'Closed', stage: 'Won', closedReason: 'Relationship', valueK: 200 },
      { id: 'lost-one', owner: 'LJS', status: 'Closed', stage: 'Lost', closedReason: 'Relationship', valueK: 100 },
      { id: 'lost-two', owner: 'LJS', status: 'Closed', stage: 'Lost', closedReason: 'Capability', valueK: 100 },
    ] }
    const html = render(phone, isolated)
    assert.equal((html.match(/class="winloss-comparison-bars"/g) || []).length, 2)
    assert.equal((html.match(/class="winloss-comparison-track"/g) || []).length, 2)
    assert.match(html, /class="winloss-comparison-track"[^>]*>[\s\S]*?data-result="won"[^>]*style="width:66\.66666666666666%"[\s\S]*?data-result="lost"[^>]*style="width:33\.33333333333333%"/)
    assert.match(html, /aria-label="2 won, 1 lost"/)
    assert.match(html, /data-result="won"[^>]*><span class="visually-hidden">Won <\/span>2<\/b>/)
    assert.match(html, /data-result="lost"[^>]*><span class="visually-hidden">Lost <\/span>1<\/b>/)
    assert.match(html, /aria-label="0 won, 1 lost"/)
    assert.match(html, /class="winloss-count-axis"/)
    assert.doesNotMatch(html, /winloss-diverging-track/)
  })
  test(`${viewport} win/loss summary separates all closed outcomes from the win-rate denominator`, () => {
    const html = render(phone, { ...state, opportunities: [...state.opportunities,
      { id: 'other', owner: 'LJS', status: 'Closed', stage: 'Abandoned' },
    ] })
    assert.match(html, /3 closed opportunities/)
    assert.match(html, /1 win out of 2 won\/lost decisions/)
    assert.match(html, /1 other closed outcome is excluded from win rate/)
    assert.match(html, /aria-label="Win rate 50%, 1 won and 1 lost"/)
    assert.match(html, /class="winloss-summary"/)
    assert.ok(html.indexOf('class="winloss-summary"') < html.indexOf('aria-label="Won vs Lost by Reason"'))
  })
  test(`${viewport} comparison bars use a common count scale and loss bars show shares of all losses`, () => {
    const html = render(phone, { ...state, opportunities: [
      { id: 'w1', owner: 'LJS', status: 'Closed', stage: 'Won', closedReason: 'Relationship' },
      { id: 'w2', owner: 'LJS', status: 'Closed', stage: 'Won', closedReason: 'Relationship' },
      { id: 'w3', owner: 'LJS', status: 'Closed', stage: 'Won', closedReason: 'Capability' },
      { id: 'l1', owner: 'LJS', status: 'Closed', stage: 'Lost', closedReason: 'Price' },
    ] })
    assert.match(html, /aria-label="2 won, 0 lost"/)
    assert.match(html, /aria-label="1 won, 0 lost"/)
    assert.match(html, /data-result="won"[^>]*style="width:66\.66666666666666%"/)
    assert.match(html, /aria-label="1 of 1 losses \(100%\)"/)
    assert.match(html, /data-result="lost"[^>]*style="width:33\.33333333333333%"/)
  })
  test(`${viewport} reference charts show top five without changing the outcome totals`, () => {
    const html = render(phone, { ...state, opportunities: Array.from({ length: 6 }, (_, i) => ({
      id: `lost-${i}`, owner: 'LJS', status: 'Closed', stage: 'Lost', closedReason: `Reason ${i + 1}`,
    })) })
    assert.match(html, /6 closed opportunities/)
    assert.match(html, /Top 5 of 6 reasons shown/)
    assert.match(html, /Show all reasons/)
    assert.match(html, /aria-label="1 of 6 losses \(17%\)"/)
    assert.doesNotMatch(html, /Reason 6/)
  })
  test(`${viewport} single-outcome and empty summaries stay explicit without invalid percentages`, () => {
    for (const stage of ['Won', 'Lost']) {
      const html = render(phone, { ...state, opportunities: [{ id: 'one', owner: 'LJS', status: 'Closed', stage }] })
      assert.match(html, /class="winloss-chart-grid"/)
      assert.match(html, stage === 'Won' ? /No lost opportunities yet/ : /No won opportunities yet/)
      assert.match(html, /1 closed opportunity/)
      assert.match(html, stage === 'Won' ? /Win rate 100%/ : /Win rate 0%/)
      assert.doesNotMatch(html, /NaN|Infinity/)
    }
    const html = render(phone, { ...state, opportunities: [] })
    assert.match(html, /No closed opportunities yet/)
    assert.doesNotMatch(html, /NaN|Infinity/)
    const otherOnly = render(phone, { ...state, opportunities: [{ id: 'other', owner: 'LJS', status: 'Closed', stage: 'Abandoned' }] })
    assert.match(otherOnly, /1 closed opportunity/)
    assert.match(otherOnly, /aria-label="No won\/lost decisions yet"/)
    assert.match(otherOnly, /1 other closed outcome is excluded from win rate/)
  })
  test(`${viewport} empty reports explain missing results and show no colored funnel placeholders`, () => {
    const html = render(phone, { ...state, opportunities: [] })
    assert.match(html, /No won opportunities yet/)
    assert.match(html, /No lost opportunities yet/)
    assert.match(html, /Grey = empty/)
    assert.equal((html.match(/title="No opportunities — empty stage"/g) || []).length, 6)
    assert.equal((html.match(/class="normal-funnel-number">0<\/b>/g) || []).length, 6)
    assert.doesNotMatch(html, /width:18%/)
    assert.doesNotMatch(html, /NaN|Infinity/)
  })
}

test('desktop performance hides commercial amounts from restricted roles', () => {
  const html = render(false, { ...state, role: 'TECH', sales: { ...state.sales, targets: { TECH: { annual: 98765, q: [98765, 0, 0, 0] } }, orders: [] } })
  assert.match(html, /Sales values and targets are restricted/)
  assert.doesNotMatch(html, /98765|98,765/)
})

for (const phone of [false, true]) {
  test(`${phone ? 'phone' : 'desktop'} performance explains unverified wins and suppresses misleading gap`, () => {
    const store = { ...state, sales: { ...state.sales, targets: { LJS: { annual: 400, q: [100, 100, 100, 100] } } } }
    const model = dashboardModel(store, { period: 'all' })
    const component = phone ? module.exports.PhoneReports : module.exports.DesktopPerformance
    const html = renderToStaticMarkup(React.createElement(component, { store, model, showMoney: true, scope: 'global',
      period: 'all', setPeriod() {}, fy: store.sales.fy, canOpen: () => true, nav() {} }))
    assert.match(html, /1 unverified Won value uses an opportunity estimate/)
    assert.match(html, /Won value/)
    assert.match(html, /₹2\.0 L/)
    assert.doesNotMatch(html, /Full-year target/)
    assert.doesNotMatch(html, /class="reference-gap is-/)
  })
  test(`${phone ? 'phone' : 'desktop'} performance excludes unlinked bookings from Won value`, () => {
    const store = { ...state, opportunities: [], sales: { ...state.sales, orders: [
      { id: 'B1', owner: 'LJS', po: 'PO-1', booked: '2026-05-01', valueK: 250 },
    ] } }
    const html = render(phone, store)
    assert.match(html, /Won value/)
    assert.doesNotMatch(html, /₹2.5 L/)
    assert.doesNotMatch(html, /Remaining to target/)
  })
}

test('empty desktop performance keeps its period controls available', () => {
  const html = render(false, { ...state, opportunities: [] })
  assert.match(html, />YTD<\/button>/)
  assert.match(html, /aria-haspopup="menu"[^>]*>QTD/)
})

test('desktop performance reserves aligned Target and Gap positions while target confirmation is pending', () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.DesktopPerformance, {
    model: { perf: { targetConfigured: false, targetNeedsConfirmation: true, targetPendingCount: 2, targetOwnerCount: 2, annual: 0 },
      wonPerformance: { valueK: 9100, estimatedCount: 4 }, currentQuarter: 3 },
    showMoney: true, scope: 'global', period: 'fy', setPeriod() {}, nav() {},
  }))
  assert.match(html, /reference-bar reference-bar--pending/)
  assert.match(html, /Target/)
  assert.match(html, /2 owner targets need confirmation/)
  assert.match(html, /reference-gap-placeholder/)

  const styles = readFileSync(new URL('../src/pages/myDashboard/workspace.css', import.meta.url), 'utf8')
  assert.match(styles, /\.dw-reference-dashboard \.reference-bar\s*\{\s*grid-template-columns:\s*53px\s+minmax\(60px,\s*1fr\)\s+79px/)
  assert.doesNotMatch(styles, /reference-performance\.has-no-comparison\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
})

test('authorized reviewers can open the per-owner target editor from Performance', () => {
  const props = { model: { perf: { targetConfigured: false, targetNeedsConfirmation: true, annual: 0 },
    wonPerformance: { valueK: 0, estimatedCount: 0 }, currentQuarter: 3 }, showMoney: true,
    scope: 'global', period: 'fy', setPeriod() {}, nav() {}, store: { role: 'LJS', sales: { fy: 'FY 2026-27', targets: {} }, config: {} } }
  const authorized = renderToStaticMarkup(React.createElement(module.exports.DesktopPerformance, props))
  const restricted = renderToStaticMarkup(React.createElement(module.exports.DesktopPerformance, {
    ...props, store: { ...props.store, role: 'TECH' },
  }))
  assert.match(authorized, />Manage targets<\/button>/)
  assert.doesNotMatch(restricted, />Manage targets<\/button>/)
})

test('target editor lists each owner with annual and quarterly inputs in lakh', () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.TargetManagerDialog, {
    store: { role: 'LJS', sales: { fy: 'FY 2026-27', targets: { LJS: { annual: 60000, q: [15000, 15000, 15000, 15000] } } }, config: {} },
    onClose() {},
  }))
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/)
  assert.match(html, /LJS/)
  assert.match(html, /aria-label="LJS annual target \(₹ lakh\)" value="600"/)
  assert.match(html, /aria-label="LJS Q1 target \(₹ lakh\)" value="150"/)
  assert.match(html, /aria-label="PP annual target \(₹ lakh\)" value="0"/)
  assert.match(html, />Confirm target<\/button>/)
  assert.match(html, />Confirm all<\/button>/)
})
