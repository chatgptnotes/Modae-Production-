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
  assert.match(html, /No open opportunities expected in this period/)
  assert.match(html, /Nothing needs your attention/)
  assert.match(html, /No closed opportunities yet/)
  assert.doesNotMatch(html, /NaN|Infinity/)
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

test('phone filters search all ranked period candidates before selecting five', async () => {
  const { phoneTopOpportunities } = await import('../src/pages/myDashboard/phoneDashboard.js')
  assert.deepEqual(phoneTopOpportunities(model, { query: 'Customer F' }).map(row => row.id), ['F'])
  assert.deepEqual(phoneTopOpportunities(model, { query: 'no match' }), [])
  const filteredModel = { ...model, blocked: [{ opp: opportunities[5] }] }
  assert.deepEqual(phoneTopOpportunities(filteredModel, { filter: 'blocked' }).map(row => row.id), ['F'])
  assert.deepEqual(phoneTopOpportunities(model).map(row => row.id), ['A', 'B', 'C', 'D', 'E'])
})
