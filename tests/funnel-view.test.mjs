import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ entryPoints: ['src/pages/myDashboard/FunnelView.jsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' } })
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const { default: NormalFunnel, FunnelViewSwitch } = module.exports
const rows = [
  { key: 'budgetary', label: 'Budgetary', count: 6, valueK: 58590, segments: [{ key: 'high', count: 1, valueK: 100 }, { key: 'low', count: 5, valueK: 58490 }] },
  { key: 'firm', label: 'Firm Proposal', count: 0, valueK: 0, segments: [] },
]
const render = props => renderToStaticMarkup(React.createElement(NormalFunnel, { rows, showMoney: true, formatMoney: value => `₹${value / 100} L`, ...props }))

test('normal funnel retains mixed bands, exact totals and empty stages', () => {
  const html = render()
  assert.match(html, /normal-funnel-high/)
  assert.match(html, /normal-funnel-low/)
  assert.match(html, /₹585\.9 L/)
  assert.match(html, /high: 1/)
  assert.match(html, /low: 5/)
  assert.match(html, /No opportunities — empty stage/)
  assert.match(html, /normal-funnel-number">0</)
})

test('normal funnel geometry depends on stage order, not live counts', () => {
  const geometry = html => [...html.matchAll(/<polygon points="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(geometry(render()), geometry(render({ rows: rows.map(row => ({ ...row, count: 10000 })) })))
  assert.notEqual(geometry(render())[0], geometry(render())[1])
})

test('restricted roles cannot see values in totals or probability tooltips', () => {
  const html = render({ showMoney: false })
  assert.doesNotMatch(html, /₹|58590|58490|normal-funnel-value|Value \(/)
  assert.match(html, /Budgetary/)
  assert.match(html, /normal-funnel-count">6</)
})

test('Analytics stage navigation uses native keyboard-accessible buttons', () => {
  assert.match(render({ onStageClick() {} }), /<button type="button">Budgetary<\/button>/)
  assert.doesNotMatch(render(), /<button/)
})

test('switch exposes the selected mode and dispatches the requested view', () => {
  let selected
  const tree = FunnelViewSwitch({ view: 'normal', onChange: mode => { selected = mode } })
  const input = tree.props.children[1].props.children[0]
  assert.equal(input.props.role, 'switch')
  assert.equal(input.props.checked, true)
  input.props.onChange({ target: { checked: false } })
  assert.equal(selected, 'dynamic')
  input.props.onChange({ target: { checked: true } })
  assert.equal(selected, 'normal')
})
