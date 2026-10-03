import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('the authenticated workspace keeps navigation in the sidebar without a top bar', () => {
  const app = read('src/App.jsx')

  assert.match(app, /<aside className="sidenav">/)
  assert.doesNotMatch(app, /WorkspaceTopbar/)
  assert.doesNotMatch(app, /workspace-topbar/)
})

test('corporate shell and dashboard styling preserve dense responsive grids', () => {
  const css = read('src/styles.css')

  assert.match(css, /Corporate workspace shell/)
  assert.doesNotMatch(css, /\.workspace-topbar\s*\{/)
  assert.match(css, /\.dashboard-page\s*\{[\s\S]*?--dashboard-canvas:/)
  assert.match(css, /\.dashboard-page \.stat-cards\s*\{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(180px, 1fr\)\)/)
  assert.match(css, /@container workspace \(max-width: 44rem\)\s*\{[\s\S]*?\.dashboard-page \.stat-cards\s*\{[\s\S]*?grid-template-columns: 1fr/)
})

test('the Opportunities data grid has white space on both sides', () => {
  const css = read('src/styles.css')

  assert.match(css, /\.opportunities-page > \.tracker-page > \.sheet-wrap\.fill\s*\{[\s\S]*?border-left: 10px solid #fff;[\s\S]*?border-right: 10px solid #fff;/)
})
