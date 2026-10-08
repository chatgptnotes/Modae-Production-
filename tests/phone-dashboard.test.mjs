import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PhoneDashboard from '../src/pages/myDashboard/PhoneDashboard.jsx'

const model = {
  headlinePipelineK: 1200, headlineOpenCount: 3, followups: [], pending: [{}], blocked: [],
  perf: { achieved: 100, annual: 500 }, currentQuarter: 2,
  funnel: [{ key: 'lead', label: 'Qualified lead', stages: ['Lead'], count: 3, valueK: 1200, segments: [] }],
  topOpportunities: [{ id: 'test-1', sellTo: 'Customer with a long name', stage: 'Lead', valueK: 1200 }],
  queue: [{ id: 'task-1', text: 'Review requirements', path: '/opp/test-1', opp: { sellTo: 'Test customer' } }],
  outcomes: { summary: { total: 0 }, byReason: [] },
}
const render = (patch = {}) => renderToStaticMarkup(React.createElement(PhoneDashboard, {
  model, showMoney: true, nav() {}, period: 'fy', setPeriod() {}, topPeriod: 'fy', setTopPeriod() {}, fy: 'FY 2026–27', ...patch,
}))

test('phone overview renders four KPIs and performance before pipeline and tasks without desktop tables', () => {
  const html = render()
  assert.equal((html.match(/<article>/g) || []).length, 4)
  assert.ok(html.indexOf('Sales performance') < html.indexOf('Pipeline by stage'))
  assert.ok(html.indexOf('Sales performance') < html.indexOf('Next actions'))
  assert.doesNotMatch(html, /<table/)
  assert.match(html, /Customer with a long name/)
  assert.match(html, /Review requirements/)
})

test('restricted phone view never renders currency', () => {
  assert.doesNotMatch(render({ showMoney: false }), /₹/)
})

test('empty phone overview explains missing records without blank tables', () => {
  const html = render({ model: { ...model, topOpportunities: [], queue: [] } })
  assert.match(html, /No open opportunities expected in this period/)
  assert.match(html, /Nothing needs your attention/)
  assert.doesNotMatch(html, /<table/)
})
