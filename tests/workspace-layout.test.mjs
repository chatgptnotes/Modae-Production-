import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const styles = fs.readFileSync('src/styles.css', 'utf8')
const dashboard = fs.readFileSync('src/pages/myDashboard/WorkspaceDashboard.jsx', 'utf8')
const workspace = fs.readFileSync('src/pages/myDashboard/workspace.css', 'utf8')
const explanations = fs.readFileSync('src/ui/HoverExplanationLayer.jsx', 'utf8')

test('route gutters cover both themes and both application shells without a title requirement', () => {
  assert.match(styles, /--workspace-page-gutter:\s*18px/)
  assert.match(styles, /--workspace-page-gutter:\s*12px/)
  for (const shell of ['main-scroll', 'mobile-content']) {
    assert.ok(styles.includes(`.shell .${shell} > :is(.page, .forms-bg, .workspace-page)`))
  }
  const start = styles.indexOf('.shell .main-scroll > :is(.page, .forms-bg, .workspace-page)')
  const rules = styles.slice(start, styles.indexOf('}', start))
  assert.match(rules, /width:\s*100%/)
  assert.match(rules, /max-width:\s*none/)
  assert.match(rules, /margin-inline:\s*0/)
  assert.match(rules, /padding-inline:\s*var\(--workspace-page-gutter\)/)
  assert.doesNotMatch(rules, /data-theme|:has/)
})

test('approval request cards and summary expand with the page in both themes', () => {
  const start = styles.indexOf('.shell .approvals-page :is(.approval-summary-three, .approval-card)')
  assert.ok(start >= 0)
  const rule = styles.slice(start, styles.indexOf('}', start))
  assert.match(rule, /width:\s*100%/)
  assert.match(rule, /max-width:\s*none/)
  assert.match(rule, /min-width:\s*0/)
})

test('dark opportunity classes retain semantic background tints', () => {
  for (const [name, token] of [['Green', 'success'], ['Blue', 'info'], ['Amber', 'warning'], ['Red', 'danger']]) {
    const selector = `.shell[data-theme="dark"] .tracker-page table.sheet td.oppid.${name}`
    const start = styles.indexOf(selector)
    assert.ok(start >= 0, `${name} tint must exist`)
    assert.ok(styles.slice(start, styles.indexOf('}', start)).includes(`var(--status-${token}-bg)`))
  }
})

test('pipeline uses the shared curved renderer for both views', () => {
  assert.match(dashboard, /<NormalFunnel view=\{view\} rows=\{model.funnel\}/)
  assert.doesNotMatch(dashboard, /FunnelOutline|funnelBarStyle/)
})

test('explanations dismiss on scrolling instead of remaining over table content', () => {
  assert.ok(explanations.includes("window.addEventListener('scroll', hide, true)"))
  assert.ok(explanations.includes("window.removeEventListener('scroll', hide, true)"))
})
