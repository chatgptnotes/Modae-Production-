import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dashboardModel } from '../src/pages/myDashboard/model.js'

// Bundle the real JSX views; Node does not load browser styles.
const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ stdin: { contents: "export { default } from './src/pages/myDashboard/PhoneDashboard.jsx'; export { ThemeProvider } from './src/ui/WorkspaceThemeContext.jsx'", resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' },
  define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) },
})
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const PhoneDashboard = module.exports.default
const opp = (id, valueK, extra = {}) => ({ id, valueK, owner: 'LJS', sellTo: `Customer ${id}`,
  stage: 'RFQ', status: 'Open', orderDate: '2026-11-15', ...extra })
const opportunities = [opp('A', 2400), opp('B', 1850), opp('C', 1200), opp('D', 570), opp('E', 430), opp('F', 200)]
const store = { role: 'LJS', roles: ['LJS'], opportunities, approvals: [], proposals: {},
  customers: [], clarifications: [], config: {}, liveSyncStatus: 'offline',
  sales: { fy: 'FY 2026–27', targets: {}, orders: [] }, auth: { user: { name: 'A Salesperson' } } }
const model = dashboardModel(store, { period: 'fy', topPeriod: 'fy', now: new Date('2026-10-09T12:00:00Z') })
const render = (patch = {}) => renderToStaticMarkup(React.createElement(module.exports.ThemeProvider, { active: true }, React.createElement(PhoneDashboard, { model,
  store, showMoney: true, nav() {}, ...patch })))

test('phone dashboard keeps KPIs first and offers five independent disclosures', () => {
  const html = render()
  const headings = ['Dashboard summary', 'Top 5 Opportunities', 'Priority actions', 'Performance', 'Sales Pipeline Funnel', 'Win/Loss Analysis']
  const positions = headings.map(label => html.indexOf(label))
  assert.ok(positions.every((position, i) => position >= 0 && (!i || position > positions[i - 1])))
  assert.equal((html.match(/<details\b/g) || []).length, 5)
  assert.equal((html.match(/<details[^>]*\bopen=""/g) || []).length, 2)
  assert.doesNotMatch(html, /<table/)
  // Workspace controls now belong to the shell, not a second dashboard header.
  assert.doesNotMatch(html, /Synced just now/)
  for (const id of ['A', 'B', 'C', 'D', 'E']) assert.match(html, new RegExp(`Customer ${id}`))
  assert.doesNotMatch(html, /Customer F/)
})

test('restricted phone dashboard and reports never render currency or commercial totals', () => {
  const html = render({ showMoney: false })
  assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, ''), /₹|24\.0|18\.5/)
  assert.match(html, /Value restricted/)
  assert.match(html, /No closed opportunities yet/)
})

test('empty phone dashboard explains missing opportunities and actions', () => {
  const emptyStore = { ...store, opportunities: [] }
  const emptyModel = dashboardModel(emptyStore, { period: 'fy', topPeriod: 'fy' })
  const html = render({ store: emptyStore, model: emptyModel })
  assert.match(html, /No open opportunities in this view/)
  assert.match(html, /Nothing needs your attention/)
  assert.match(html, /No closed opportunities yet/)
  assert.doesNotMatch(html, /NaN|Infinity/)
})

test('phone summary and Top 5 explanation reflect saved opportunity data', () => {
  const state = { ...store, opportunities: [opp('future', 0, { orderDate: '2027-05-31' }),
    opp('closed', 100, { status: 'Closed', stage: 'Lost' })] }
  const html = render({ store: state, model: dashboardModel(state, { scope: 'my', now: new Date('2026-10-12T06:00:00Z') }) })
  assert.match(html, /2 total · 1 open · 1 closed/)
  assert.match(html, /1 open opportunity.*outside this period or has no expected order date/)
  assert.match(html, /<option value="all">All dates<\/option>/)
})

test('a blocked proposal keeps its danger status and routes to blocker resolution', () => {
  const proposal = { ...opportunities[0], proposalDate: '2026-09-01' }
  const html = render({ model: { ...model, topOpportunityCandidates: [proposal], blocked: [{ opp: proposal,
    blockers: [{ severity: 'block', text: 'Credit terms need approval' }] }] } })
  assert.match(html, /data-tone="danger">Blocked/)
  assert.match(html, /Resolve Blocker/)
  assert.match(html, /Credit terms need approval/)
  assert.doesNotMatch(html, /View Proposal/)
})

test('pending approvals offer review only to roles with approval access', () => {
  const pendingModel = { ...model, pending: [{ id: 'AP-1', oppId: 'A' }] }
  assert.match(render({ model: pendingModel }), /Review Approval/)
  assert.doesNotMatch(render({ model: pendingModel, showMoney: false,
    store: { ...store, role: 'CUST', roles: ['CUST'] } }), /Review Approval/)
})

test('phone search checks all ranked period candidates before selecting five', async () => {
  const { phoneTopOpportunities } = await import('../src/pages/myDashboard/phoneDashboard.js')
  assert.deepEqual(phoneTopOpportunities(model, { query: 'Customer F' }).map(row => row.id), ['F'])
  assert.deepEqual(phoneTopOpportunities(model, { query: 'no match' }), [])
  assert.deepEqual(phoneTopOpportunities(model).map(row => row.id), ['A', 'B', 'C', 'D', 'E'])
})


test('compact opportunity rows retain enquiry, ID, stage and missing-date context', () => {
  const row = opp('COMPACT', 2400, { sellTo: 'A long industrial customer name', oppName: 'Pump retrofit enquiry', orderDate: '', prob: 'High' })
  const html = render({ model: { ...model, topOpportunityCandidates: [row] } })
  const feed = html.split('class="mobile-opportunity-feed"')[1].split('mobile-view-all')[0]
  for (const text of ['A long industrial customer name', 'Pump retrofit enquiry', 'COMPACT', 'RFQ', 'Date not set', 'High', 'View Details']) assert.ok(feed.includes(text), text)
  assert.doesNotMatch(feed, /mobile-customer-avatar|mobile-rank|mobile-opportunity-facts|mobile-card-action/)
  assert.match(feed, /class="mobile-deal-action"/)
  assert.match(feed, /tabindex="0"/)
})
