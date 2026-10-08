import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('workspace top bar carries the dashboard company control without a fiscal-period dropdown', () => {
  const app = read('src/App.jsx')
  assert.match(app, /workspace-company-selector/)
  assert.doesNotMatch(app, /workspace-fy-selector|Dashboard fiscal period/)
})

test('shared controls occupy explicit workspace zones without duplicating the current page name', () => {
  const app = read('src/App.jsx')
  const css = read('src/styles.css')

  assert.match(app, /workspace-topbar__controls/)
  assert.match(app, /workspace-topbar__utilities/)
  assert.match(app, /workspace-refresh/)
  assert.doesNotMatch(app, /workspace-breadcrumb/)
  assert.doesNotMatch(app, /!isDashboardRoute && <>\s*<button type="button" className="workspace-refresh"/)
  assert.doesNotMatch(app, /side-demo-tools/)
  assert.match(css, /\.workspace-topbar\s*\{[\s\S]*grid-template-areas/)
})

test('tablet utilities keep refresh within reach', () => {
  const tablet = read('src/tablet/TabletApp.jsx')
  assert.match(tablet, /tb-utilities/)
  assert.match(tablet, /title="Refresh workspace data"/)
})

test('the global shell provides the requested guide, theme, and system-status controls', () => {
  const app = read('src/App.jsx')
  const css = read('src/styles.css')

  assert.match(app, /Guide/)
  assert.match(app, /workspace-theme-toggle/)
  assert.match(app, /workspace-system-status/)
  assert.match(app, /AI extraction/)
  assert.match(app, /Last sync/)
  assert.match(app, /ThemeProvider/)
  assert.match(css, /\.workspace-topbar\s*\{[\s\S]*?position:\s*sticky/)
  assert.match(css, /\[data-theme="dark"\]/)
})

test('the dashboard uses shared top-bar controls without a duplicate insight rail', () => {
  const dashboard = read('src/pages/myDashboard/WorkspaceDashboard.jsx')

  assert.doesNotMatch(dashboard, /WorkspaceInsights/)
  assert.doesNotMatch(dashboard, /reference-toolbar/)
})

test('inbox preview has separate qualify and open-page destinations', () => {
  const inbox = read('src/pages/Inbox.jsx')
  assert.match(inbox, /previewLead\.status === 'Qualified' \? <button[\s\S]*?nav\(`\/register\/\$\{previewLead\.id\}`\)/)
  assert.match(inbox, /nav\(`\/inbox\/\$\{previewLead\.id\}`\)/)
})

test('approver queue provides a decision drawer entry point', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /approval-decision-drawer/)
  assert.match(approvals, /Decision history/)
  assert.match(approvals, /onReview=\{\(\) => setDecisionDrawerId\(a\.id\)\}/)
})

test('requester approval cards expose a decision timeline', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /View decision timeline/)
  assert.match(approvals, /REQUEST TIMELINE/)
  assert.match(approvals, /Go to proposal workbench/)
})

test('opportunities shows real funnel counts and proposal sent has real-data signals', () => {
  const opps = read('src/pages/Opportunities.jsx')
  assert.match(opps, /insightModel\.funnel\.map/)
  assert.match(opps, /setParams\(\{ stage: stage\.stages\.join\(','\) \}\)/)
  assert.match(read('src/pages/Tracker.jsx'), /\}, \[params\]\)/)
  assert.match(read('src/pages/ProposalSent.jsx'), /WorkspaceInsights signals=\{proposalSignals\}/)
})

test('primary action token uses the ModAE brand primary instead of charcoal', () => {
  const css = read('src/styles.css')
  assert.match(css, /--action-primary:\s*var\(--primary-fill\)/)
  assert.match(css, /--action-primary-hover:\s*var\(--primary-hover\)/)
})

test('reference dashboard renders the operational report stack', () => {
  const dashboard = read('src/pages/myDashboard/WorkspaceDashboard.jsx')
  assert.match(dashboard, /function ActionQueue/)
  assert.match(dashboard, /Nothing requires action right now/)
  assert.match(dashboard, /function Performance/)
  assert.match(dashboard, /function TopOpportunities/)
  assert.match(dashboard, /function Funnel/)
  assert.match(dashboard, /function WinLoss/)
  assert.match(dashboard, /Sales Pipeline Funnel/)
})

test('desktop top-level pages move their heading into the top bar', () => {
  const app = read('src/App.jsx')
  const css = read('src/styles.css')
  const dashboard = read('src/pages/myDashboard/WorkspaceDashboard.jsx')

  assert.doesNotMatch(app, /workspace-breadcrumb/)
  assert.match(app, /topbarTitleFor/)
  assert.match(app, /<h1 className="workspace-topbar-title">/)
  assert.match(app, /has-topbar-page-title/)
  assert.match(css, /\.shell\.has-topbar-page-title:not\(\.tablet-mode\) \.workspace-page-title--topbar-duplicate\s*\{\s*display:\s*none;/)
  assert.doesNotMatch(dashboard, /workspace-page-title--topbar-duplicate/)
  assert.match(dashboard, /dw-reference-dashboard/)
  assert.doesNotMatch(dashboard, /Opportunity register/)

  for (const file of ['src/pages/Inbox.jsx', 'src/pages/ProposalSent.jsx', 'src/pages/Folders.jsx', 'src/pages/Audit.jsx', 'src/pages/PriceLists.jsx']) {
    assert.match(read(file), /workspace-page-title--topbar-duplicate/, `${file} should mark its desktop duplicate title`)
  }
  assert.match(read('src/pages/Tracker.jsx'), /workspace-page-title/)
})

test('the global search yields to pages with their own targeted search', () => {
  const app = read('src/App.jsx')

  assert.match(app, /hasLocalSearch/)
  assert.match(app, /!hasLocalSearch && <div className="workspace-topbar-search">/)
  for (const path of ['/inbox', '/opportunities', '/approvals', '/proposal-sent', '/audit', '/pricelists']) {
    assert.match(app, new RegExp(`['\"]${path}['\"]`))
  }
})
