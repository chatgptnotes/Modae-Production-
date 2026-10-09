import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({ entryPoints: ['src/pages/InboxToolbar.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) } })
const module = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
const Toolbar = module.exports.default
const noop = () => {}
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(Toolbar, {
  query: '', onQuery: noop, filterCount: 0, onFilters: noop, view: 'all', counts: {all:8,review:2,converted:6,starred:1},
  onView: noop, archive: false, onArchive: noop, archiveCount:2, onRefresh:noop, onNew:noop, actions:[], selectionCount:0, ...overrides,
}))
test('desktop toolbar shows only everyday actions and hides advanced menus initially', () => {
  const html = render()
  for (const label of ['Search mail', 'Filter leads', 'Inbox view', 'Refresh inbox', 'More inbox actions', 'New enquiry']) assert.ok(html.includes(`aria-label="${label}"`))
  assert.doesNotMatch(html, /role="menu"|role="menuitem"|<select/)
  assert.match(html, /All leads/)
  assert.doesNotMatch(html, /Needs review|All statuses|All routes|Archive \(2\)/)
})
test('toolbar shows current view without displaying a second tab row', () => {
  const html = render({view:'review'})
  assert.match(html, /Needs review/)
  assert.doesNotMatch(html, /Converted|Starred/)
})
test('active filters and selected messages have small visible counts', () => {
  const html = render({filterCount:3, selectionCount:5})
  assert.match(html, /3 active filters/)
  assert.match(html, /inbox-filter-count">3</)
  assert.match(html, /inbox-filter-count">5</)
  assert.doesNotMatch(render(), /inbox-filter-count/)
})
test('archive disables inbox views while keeping actions available', () => {
  const html = render({archive:true})
  assert.match(html, /aria-label="Inbox view"[^>]*disabled=""/)
  assert.match(html, /<span>Archive<\/span>/)
  assert.match(html, /aria-label="More inbox actions"/)
})
