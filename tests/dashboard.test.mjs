import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedSales, PERMS, ROLES } from '../src/seed.js'
import { analyticsSnapshot, salesPerformance, FY_QUARTERS, FY_MONTHS, fyQuarter, winLossAnalysis } from '../src/kpi.js'
import { canViewForecast, forecastOwnerScope, isAdminRole } from '../src/utils.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const store = { sales: seedSales }

test('win/loss analysis groups close reasons and joins optional competitors', () => {
  const opportunities = [
    { id: 'W-1', stage: 'Won', closedReason: 'Best Price', valueK: 100, owner: 'RS', sellTo: 'ACME', lastUpdated: '2026-08-01' },
    { id: 'L-1', stage: 'Lost', closedReason: 'Best Price', valueK: 60, owner: 'RS', sellTo: 'ACME', lastUpdated: '2026-08-02' },
    { id: 'L-2', stage: 'Lost', closedReason: '', valueK: 25, owner: 'PP', sellTo: 'BETA', lastUpdated: '2026-08-03' },
  ]
  const competitors = [{ id: 'CP-1', oppId: 'L-1', name: 'Acme Controls', outcome: 'Won against us' }]

  const result = winLossAnalysis(opportunities, competitors, { commercial: true })
  assert.deepEqual(result.summary, { total: 3, won: 1, lost: 2, winRate: 33, wonValueK: 100, lostValueK: 85 })
  assert.deepEqual(result.byReason, [
    { reason: 'Best Price', won: 1, lost: 1, total: 2, wonValueK: 100, lostValueK: 60, totalValueK: 160, winRate: 50 },
    { reason: 'Unspecified', won: 0, lost: 1, total: 1, wonValueK: 0, lostValueK: 25, totalValueK: 25, winRate: 0 },
  ])
  assert.equal(result.rows[1].competitor, 'Acme Controls')
  assert.deepEqual(result.insights, {
    topWinReason: 'Best Price',
    topLossReason: 'Best Price',
    topWinReasonValueK: 100,
    topLossReasonValueK: 60,
    wonValueShare: 54,
  })
})

test('win/loss analysis hides commercial values for restricted roles', () => {
  const result = winLossAnalysis([
    { id: 'W-1', stage: 'Won', closedReason: 'Relationship', valueK: 100 },
    { id: 'L-1', stage: 'Lost', closedReason: 'Relationship', valueK: 60 },
  ], [], { commercial: false })
  assert.deepEqual(result.summary, { total: 2, won: 1, lost: 1, winRate: 50, wonValueK: null, lostValueK: null })
  assert.deepEqual(result.byReason[0], { reason: 'Relationship', won: 1, lost: 1, total: 2, wonValueK: null, lostValueK: null, totalValueK: null, winRate: 50 })
  assert.deepEqual(result.insights, {
    topWinReason: 'Relationship',
    topLossReason: 'Relationship',
    topWinReasonValueK: null,
    topLossReasonValueK: null,
    wonValueShare: null,
  })
})

test('win/loss analysis provides an intentional empty-state insight model', () => {
  const result = winLossAnalysis([], [], { commercial: true })
  assert.deepEqual(result.insights, {
    topWinReason: '',
    topLossReason: '',
    topWinReasonValueK: 0,
    topLossReasonValueK: 0,
    wonValueShare: 0,
  })
})

test('detailed analytics leads with operational win/loss tables instead of the old reason card', () => {
  const analytics = read('src/pages/Analytics.jsx')
  assert.match(analytics, /winLossAnalysis\(opps, store\.competitors, \{ commercial: comm \}\)/)
  assert.match(analytics, /className="analysis-table analysis-reason-table"/)
  assert.match(analytics, /className="analysis-table closed-opportunity-register"/)
  assert.match(analytics, /className="analysis-table open-pipeline-register"/)
  assert.doesNotMatch(analytics, /<CardHead icon="checkCircle" tone="tone-green" count=.*>Win \/ loss reasons/)
  assert.match(analytics, /analysis-hero/)
  assert.match(analytics, /analysis-value-compare/)
  assert.match(analytics, /topWinReason/)
})

test('dashboard win/loss card provides filters, outcome comparison, and loss reasons', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(dashboard, /dashboard-wl-filters/)
  assert.match(dashboard, /option value="90d">Last 90 days/)
  assert.match(dashboard, /option value="fy">This FY/)
  assert.match(dashboard, /<span>Owner<\/span>/)
  assert.match(dashboard, /Close reason/)
  assert.match(dashboard, /dashboard-wl-outcomes/)
  assert.match(dashboard, /dashboard-wl-rate-track/)
  assert.match(dashboard, /Top loss reasons/)
  assert.match(dashboard, /winLoss\.byReason\.filter\(row => row\.lost > 0\)/)
  assert.match(dashboard, /View detailed analysis/)
  assert.doesNotMatch(dashboard, /<WinLossFlow/)
  assert.doesNotMatch(dashboard, /<WinLossPie/)
})

test('dashboard and analytics share the outcome flow with an intentional empty state', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  const analytics = read('src/pages/Analytics.jsx')
  const flow = read('src/WinLossFlow.jsx')
  assert.doesNotMatch(dashboard, /WinLossFlow/)
  assert.match(analytics, /<WinLossFlow/)
  assert.match(flow, /Open opportunities/)
  assert.match(flow, /Closed/)
  assert.match(flow, /Won/)
  assert.match(flow, /Lost/)
  assert.match(flow, /No closed data yet/)
})

// Biji, 13 Aug: "there has to be something called My Dashboard… it will be
// different for all the roles." The page previously split eight roles on one
// boolean and showed everyone the same four cards.
test('My Dashboard branches per role', () => {
  const source = read('src/pages/MyDashboard.jsx')
  for (const fn of ['SalesDashboard', 'OwnerDashboard', 'CommercialDashboard', 'ApproverDashboard', 'AdminDashboard', 'TechDashboard']) {
    assert.match(source, new RegExp(`function ${fn}\\(`), `${fn} must exist`)
  }
  assert.match(source, /const sales = isSalesOwner\(role\)/)
  assert.match(read('src/App.jsx'), /dashboardOwners\.map\(owner => <option key=\{owner\} value=\{owner\}>\{displayRole\(owner\)\}/)
  assert.match(source, /const owner = role === 'LJS'/)
  assert.match(source, /const commercial = role === 'AH'/)
  assert.match(source, /const tech = role === 'TECH'/)
  assert.ok(source.indexOf('if (owner) return <OwnerDashboard') > 0)
  assert.ok(source.indexOf('if (commercial) return <CommercialDashboard') > 0)
  // TECH used to fall into the sales branch and see a near-empty page.
  assert.ok(source.indexOf('if (tech) return <TechDashboard') > 0)
})

test('dashboard cockpits keep broad analytics away from sales and technical users', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const sales = source.slice(source.indexOf('function SalesDashboard'), source.indexOf('// ------------------------------------------------------------ team targets'))
  const tech = source.slice(source.indexOf('function TechDashboard'))
  assert.doesNotMatch(sales, /<AnalyticsOverview/)
  assert.doesNotMatch(sales, /<ForecastReportCard \/>/)
  assert.doesNotMatch(tech, /<AnalyticsOverview/)
  assert.match(source, /function OwnerDashboard\([\s\S]*?<AnalyticsOverview/)
  assert.match(source, /function CommercialDashboard\(props\)/)
  assert.match(source, /function ApproverDashboard\([\s\S]*?<AnalyticsOverview/)
  assert.match(source, /Commercial pipeline/)
  assert.match(source, /Commercial posture/)
})

test('LJS keeps proposal actions and removes the duplicate owner queue', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const owner = source.slice(source.indexOf('function OwnerDashboard'), source.indexOf('// --------------------------------------------------------------- approvers'))
  assert.match(owner, /<ProposalStatusCard/)
  assert.match(owner, /title="Decisions waiting on you"/)
  assert.doesNotMatch(owner, /title="Owner priority queue"/)
})

test('LJS decisions waiting card uses the full dashboard width', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const owner = source.slice(source.indexOf('function OwnerDashboard'), source.indexOf('// --------------------------------------------------------------- approvers'))
  assert.match(owner, /<Card title="Decisions waiting on you"[\s\S]*?span=\{12\}/)
})

test('dashboard visual polish fills KPI space and keeps dense controls compact', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /\.dashboard-page \.stat-cards\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\)/)
  assert.match(styles, /\.dashboard-page \.home-analytics > \.dashboard-card\s*\{[\s\S]*margin-top:\s*12px/)
  assert.match(styles, /\.dashboard-page \.ana-title-action button\s*,\s*\.dashboard-page \.targets-table button\s*\{[\s\S]*min-height:\s*36px/)
  assert.match(styles, /\.dashboard-page \.targets-table td:first-child\s*\{[\s\S]*min-width:\s*220px/)
  assert.match(styles, /\.dashboard-page \.targets-table td:first-child \.hint\s*\{[\s\S]*display:\s*block/)
})

test('dashboard keeps its fiscal controls in the report and omits the top-bar period selector', () => {
  const dashboard = read('src/pages/myDashboard/WorkspaceDashboard.jsx')
  const app = read('src/App.jsx')
  const context = read('src/ui/WorkspaceViewContext.jsx')
  const styles = read('src/pages/myDashboard/workspace.css')
  assert.match(read('src/App.jsx'), /workspace-company-selector/)
  assert.doesNotMatch(app, /workspace-fy-selector|Dashboard fiscal period/)
  assert.match(context, /createContext/)
  assert.match(dashboard, /useWorkspaceView\(\)/)
  assert.match(dashboard, /reference-quarter/)
  assert.match(dashboard, /setPeriod\('fy'\)/)
  assert.doesNotMatch(dashboard, /dw-scope/)
  assert.match(styles, /@media \(max-width: 540px\)/)
})

test('workspace dashboard keeps scope controls compact so the report starts with the KPI strip', () => {
  const app = read('src/App.jsx')
  const dashboard = read('src/pages/myDashboard/WorkspaceDashboard.jsx')
  const styles = read('src/pages/myDashboard/workspace.css')
  assert.doesNotMatch(dashboard, /reference-toolbar/)
  assert.match(dashboard, /reference-kpis/)
  assert.match(app, /workspace-company-selector/)
  assert.match(styles, /\.dw-reference-dashboard \.reference-kpis/)
})

test('workspace dashboard follows the reference report hierarchy', () => {
  const dashboard = read('src/pages/myDashboard/WorkspaceDashboard.jsx')
  assert.match(dashboard, /className="page dashboard-page dw-reference-dashboard"/)
  assert.match(dashboard, /<Performance/)
  assert.match(dashboard, /<TopOpportunities/)
  assert.match(dashboard, /<ActionQueue/)
  assert.match(dashboard, /<Funnel/)
  assert.doesNotMatch(dashboard, /<PipelineStageFlow|<OpportunityRegister/)
  assert.match(dashboard, /<WinLoss/)
})

test('workspace view is controlled from the top bar and dashboard navigation stays neutral', () => {
  const app = read('src/App.jsx')
  const toggle = read('src/ui/WorkspaceViewToggle.jsx')
  const styles = read('src/styles.css')
  const tablet = read('src/tablet/TabletApp.jsx')
  assert.match(app, /const label = t\.page === 'mydashboard' \? 'Dashboard' : t\.label/)
  assert.match(app, /<WorkspaceViewToggle \/>/)
  assert.match(app, /WorkspaceViewProvider initialScope=\{dashboardDefaultScope\(store\.role\)\}/)
  assert.match(toggle, /role="switch"/)
  assert.match(toggle, /aria-label="Workspace view"/)
  assert.match(toggle, /aria-checked=\{isGlobal\}/)
  assert.match(toggle, /onClick=\{\(\) => setScope\(isGlobal \? 'my' : 'global'\)\}/)
  assert.match(toggle, /workspace-view-switch__thumb/)
  assert.match(toggle, /isGlobal \? 'Global View' : 'My View'/)
  assert.match(styles, /\.workspace-view-switch\[aria-checked="true"\][^{]*\{[^}]*background-color: #FFF !important/)
  assert.match(styles, /workspace-view-switch__thumb[^}]*width: 8px; height: 26px;[^}]*border-radius: 999px/)
  assert.match(styles, /workspace-view-switch__label[^}]*max-width: 90px/)
  assert.match(styles, /workspace-view-switch\[aria-checked="true"\] \.workspace-view-switch__thumb[^}]*translateX\(104px\)/)
  assert.match(styles, /\.workspace-view-switch__thumb[^}]*background-color: #282828/)
  assert.match(styles, /\.workspace-view-switch\[aria-checked="true"\] \.workspace-view-switch__thumb[^}]*background-color: var\(--primary-fill\)/)
  assert.match(styles, /\.workspace-view-switch\[aria-checked="true"\] \.workspace-view-switch__label[^}]*color: #282828 !important/)
  assert.match(tablet, /<WorkspaceViewToggle \/>/)
})

test('workspace view scope reaches the main data registers while preserving role-specific page access', () => {
  for (const file of [
    'src/pages/myDashboard/WorkspaceDashboard.jsx',
    'src/pages/Opportunities.jsx',
    'src/pages/Tracker.jsx',
    'src/pages/MyOpps.jsx',
    'src/pages/Inbox.jsx',
    'src/pages/Analytics.jsx',
    'src/pages/Approvals.jsx',
    'src/pages/ProposalSent.jsx',
    'src/pages/PurchaseOrders.jsx',
    'src/pages/Folders.jsx',
    'src/pages/Customers.jsx',
    'src/pages/Audit.jsx',
  ]) assert.match(read(file), /useWorkspaceView\(\)/, `${file} must read the shared workspace scope`)
})

test('dashboard work queue summary uses responsive metric tiles', () => {
  const styles = read('src/styles.css')
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(styles, /\.dashboard-page \.home-alert-rail\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)/)
  assert.match(styles, /\.dashboard-page \.home-alert-rail > button\s*,\s*\.dashboard-page \.home-alert-rail > div\s*\{[\s\S]*border:\s*1px solid/)
  assert.match(styles, /\.dashboard-page \.home-alert-rail \.home-alert-value\s*\{[\s\S]*font-size:\s*20px/)
  assert.match(dashboard, /home-alert-kpi home-alert-leads/)
  assert.match(dashboard, /home-alert-kpi home-alert-requests/)
  assert.match(dashboard, /home-alert-kpi home-alert-stale/)
  assert.match(styles, /\.dashboard-page \.home-analytics \.home-alert-rail > button\.home-alert-kpi\s*\{[\s\S]*height:\s*96px;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*color-mix\(in srgb, var\(--queue-accent\) 9%, white\)/)
  assert.match(styles, /\.dashboard-page \.home-analytics \.home-alert-rail > button\.home-alert-kpi \.home-alert-value\s*\{[\s\S]*font-size:\s*clamp\(36px,\s*2\.8vw,\s*42px\)/)
  assert.match(styles, /\.dashboard-page \.home-analytics \.home-alert-rail > button\.home-alert-kpi > span:last-child\s*\{[\s\S]*font-size:\s*16px;[\s\S]*text-align:\s*center;/)
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.dashboard-page \.home-alert-rail\s*\{[\s\S]*grid-template-columns:\s*1fr/)
})

test('dashboard win-loss result cards use equal square semantic KPI styling', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /\.dashboard-page \.dashboard-wl-outcomes\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(styles, /\.dashboard-page \.dashboard-wl-outcome\.is-won\s*\{[\s\S]*--wl-accent:\s*var\(--dashboard-success\)/)
  assert.match(styles, /\.dashboard-page \.dashboard-wl-outcome\.is-lost\s*\{[\s\S]*--wl-accent:\s*var\(--dashboard-danger\)/)
  assert.match(styles, /\.dashboard-page \.dashboard-wl-reason-track i\s*\{[\s\S]*background:\s*var\(--dashboard-danger\)/)
})

test('dashboard command-center visual system keeps the KPI rail, pipeline, and work queue intentionally structured', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /Dashboard command-center visual system/)
  assert.match(styles, /\.dashboard-page \.stat-cards > \.stat-card-v2\s*\{[\s\S]*border-top: 3px solid var\(--dashboard-accent\)/)
  assert.match(styles, /\.dashboard-page \.home-analytics\s*\{[\s\S]*border-top: 3px solid var\(--dashboard-accent\)/)
  assert.match(styles, /\.dashboard-page \.home-funnel-row:hover\s*\{[\s\S]*transform: translateX\(3px\)/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.dashboard-page \.home-analytics-grid\s*\{[\s\S]*grid-template-columns: 1fr/)
})

test('top dashboard KPIs use neutral figures with a semantic edge treatment', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  const styles = read('src/styles.css')
  assert.match(dashboard, /function Metric\(\{ label, value, hint, tone = '', onClick, variant = 'dashboard-kpi' \}\)/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi\s*\{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*?min-height: 76px;[\s\S]*?border-left: 3px solid var\(--kpi-accent\);/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi \.sc-value\s*\{[\s\S]*?color: var\(--dashboard-ink\);/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi\.tone-sky\s*\{[\s\S]*?--kpi-accent: var\(--dashboard-info\);/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi\.tone-green\s*\{[\s\S]*?--kpi-accent: var\(--dashboard-success\);/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi\.tone-red\s*\{[\s\S]*?--kpi-accent: var\(--dashboard-danger\);/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi\.clickable:focus-visible\s*\{[\s\S]*?outline: 2px solid var\(--focus-ring\);/)
})

test('owner KPI summary is integrated into the Live Business View panel', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  const styles = read('src/styles.css')
  const overview = dashboard.slice(dashboard.indexOf('function AnalyticsOverview'), dashboard.indexOf('// -------------------------------------------------------------'))
  assert.ok(overview.indexOf('className="dashboard-live-kpis"') < overview.indexOf('className="home-analytics-head"'))
  assert.match(dashboard, /<AnalyticsOverview \{\.\.\.\{ store, role, nav, scope \}\} summary=\{/)
  assert.match(styles, /\.dashboard-page \.dashboard-live-kpis \.stat-card-v2\.dashboard-kpi\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?min-height:\s*84px;[\s\S]*?height:\s*84px;[\s\S]*?padding:\s*14px 16px;[\s\S]*?border:\s*1px solid var\(--dashboard-rule\);[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*var\(--surface-default\);[\s\S]*?text-align:\s*center;/)
  assert.match(styles, /\.dashboard-page \.home-analytics \.dashboard-live-kpis \.stat-cards > button\.stat-card-v2\.dashboard-kpi\s*\{[\s\S]*?display:\s*flex;[\s\S]*?height:\s*96px;[\s\S]*?min-height:\s*96px;[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*color-mix\(in srgb, var\(--kpi-accent\) 9%, white\);/)
  assert.match(styles, /\.dashboard-page \.home-analytics \.dashboard-live-kpis \.stat-cards > button\.stat-card-v2\.dashboard-kpi \.sc-value\s*\{[\s\S]*?font-size:\s*clamp\(36px,\s*2\.8vw,\s*42px\);/)
  assert.match(styles, /\.dashboard-page \.home-analytics \.dashboard-live-kpis \.stat-cards > button\.stat-card-v2\.dashboard-kpi \.sc-label\s*\{[\s\S]*?font-size:\s*16px;/)
  assert.ok(styles.lastIndexOf('.dashboard-page .home-analytics .dashboard-live-kpis .stat-cards > button.stat-card-v2.dashboard-kpi') > styles.lastIndexOf('.dashboard-page .stat-card-v2.dashboard-kpi'))
  assert.match(styles, /\.dashboard-page \.dashboard-live-kpis \.stat-cards\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\sminmax\(0,\s*1fr\)\)/)
})

test('dashboard tables and funnel rows use bounded alignment rules', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  const styles = read('src/styles.css')
  assert.match(dashboard, /proposal-customer-name dashboard-cell-ellipsis[^>]*title=/)
  assert.match(dashboard, /proposal-owner-name dashboard-cell-ellipsis[^>]*title=/)
  assert.match(dashboard, /className="num dashboard-value-cell"/)
  assert.match(dashboard, /className="num targets-action-cell"/)
  assert.match(styles, /\.dashboard-page \.proposal-status-table\s*\{[\s\S]*table-layout:\s*fixed;/)
  assert.match(styles, /\.dashboard-page \.proposal-status-table \.proposal-customer-name,[\s\S]*text-overflow:\s*ellipsis;/)
  assert.match(styles, /\.dashboard-page \.proposal-status-table \.dashboard-value-cell\s*\{\s*text-align:\s*right;/)
  assert.match(styles, /\.dashboard-page \.targets-table th\.num,[\s\S]*\.dashboard-page \.targets-table td\.num\s*\{[\s\S]*text-align:\s*right;/)
  assert.match(styles, /\.dashboard-page \.dashboard-funnel\.funnel-visual \.dashboard-funnel-row\s*\{[\s\S]*min-height:\s*64px;[\s\S]*height:\s*auto;/)
})

test('dashboard cards and KPI tiles share the spacing pass', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /\.dashboard-page \.dashboard-card\s*\{\s*padding:\s*20px;\s*min-height:\s*0;/)
  assert.match(styles, /\.dashboard-page \.stat-card-v2\.dashboard-kpi\s*\{[\s\S]*grid-template-areas:\s*'value' 'label' 'hint';[\s\S]*min-height:\s*92px;/)
  assert.match(styles, /\.dashboard-page \.performance-scorecard-grid,\s*\.dashboard-page \.performance-lower-grid\s*\{\s*align-items:\s*stretch;/)
  assert.match(styles, /\.dashboard-page \.attainment-summary\s*\{\s*height:\s*auto;\s*align-content:\s*start;/)
})

test('commercial approvers see the pipeline before their priority queue', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const approver = source.slice(source.indexOf('function ApproverDashboard'), source.indexOf('function AdminDashboard'))
  const commercialPipeline = approver.indexOf('{commercial && <AnalyticsOverview')
  assert.notEqual(commercialPipeline, -1)
  assert.ok(commercialPipeline < approver.indexOf('title="Act on these first"'))
})

test('LJS proposal status card has one bottom register link', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const styles = read('src/styles.css')
  const card = source.slice(source.indexOf('function ProposalStatusCard'), source.indexOf('// ------------------------------------------------------------- owner cockpit'))
  assert.match(card, /title="Proposal status & follow-up"/)
  assert.match(card, /View all proposals/)
  assert.match(card, /nav\('\/proposal-sent'\)/)
  assert.match(card, /To be prepared/)
  assert.match(card, /Awaiting approval/)
  assert.match(card, /Follow-up due/)
  assert.doesNotMatch(card, /Track what is ready, sent, waiting, and overdue\./)
  assert.doesNotMatch(card, /Sent proposals needing customer follow-up/)
  assert.doesNotMatch(card, /action=\{<button[^>]*>View all proposals/)
  assert.match(card, /proposal-status-summary/)
  assert.match(card, /proposal-status-table/)
  assert.match(card, /proposal-opportunity-name/)
  assert.match(card, /proposal-status-summary__item--prepare/)
  assert.match(card, /proposal-status-summary__item--approval/)
  assert.match(card, /proposal-status-summary__item--sent/)
  assert.match(card, /proposal-status-summary__item--follow-up/)
  assert.doesNotMatch(card, /proposal-follow-up-alert/)
  assert.match(card, /is-empty/)
  assert.match(styles, /\.proposal-status-summary__item--prepare \{ --summary-color: var\(--status-warning\);/)
  assert.match(styles, /\.proposal-status-summary__item--approval \{ --summary-color: var\(--status-info\);/)
  assert.match(styles, /\.proposal-status-summary__item--sent \{ --summary-color: var\(--status-success\);/)
  assert.match(styles, /\.proposal-status-summary\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.proposal-status-summary__item--follow-up \{ --summary-color: var\(--status-danger\);/)
  assert.match(styles, /\.proposal-status-summary__item\.is-empty \{ --summary-color: var\(--text-subtle\);/)
  assert.match(styles, /\.proposal-status-summary__item \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*grid-template-areas: 'label value';/)
  assert.match(styles, /\.proposal-status-summary \.home-alert-value \{ grid-area: value;[\s\S]*text-align: right;/)
  assert.match(styles, /\.proposal-status-summary__item > span:last-child \{\s*grid-area: label;/)
  assert.match(card, /const \[selectedStatus, setSelectedStatus\] = useState\('all'\)/)
  assert.match(card, /const filteredPriority = selectedStatus === 'all' \? priority : allStatusRows\.filter\(item => item\.status === selectedStatus\)/)
  assert.match(card, /<button[^>]*aria-pressed=\{selectedStatus === 'To be prepared'\}/)
  assert.match(card, /<button[^>]*aria-pressed=\{selectedStatus === 'Awaiting approval'\}/)
  assert.match(card, /<button[^>]*aria-pressed=\{selectedStatus === 'Sent'\}/)
  assert.match(card, /<button[^>]*className=\{`proposal-status-summary__item proposal-status-summary__item--follow-up/)
  assert.match(card, /filteredPriority\.map/)
  assert.match(card, /const filteredSummaryLabel = selectedStatus === 'all'/)
  assert.match(card, /\{filteredSummaryLabel\}/)
  assert.match(styles, /\.proposal-status-summary__item\.is-selected/)
})

test('LJS has company scope while sales owners remain owner-scoped', () => {
  const opportunities = [
    { id: 'LJS-1', owner: 'LJS', status: 'Open', stage: 'RFQ', valueK: 100 },
    { id: 'RS-1', owner: 'RS', status: 'Open', stage: 'RFQ', valueK: 250 },
  ]
  const ljs = analyticsSnapshot({ opportunities, sales: { targets: {}, orders: [] } }, 'LJS')
  const rs = analyticsSnapshot({ opportunities, sales: { targets: {}, orders: [] } }, 'RS')
  assert.equal(ljs.owner, null)
  assert.equal(ljs.openCount, 2)
  assert.equal(rs.owner, 'RS')
  assert.equal(rs.openCount, 1)
})

test('technical reviewers use the shared company work queue', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /useWorkQueue\(store, role, sales && scope === 'my'\)/)
  assert.doesNotMatch(source, /useWorkQueue\(store, role, sales \|\| tech\)/)
})

test('clickable dashboard table rows support keyboard activation', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.equal((source.match(/tabIndex=\{0\} role="link"/g) || []).length, 4,
    'opportunity, customer, and proposal rows must be keyboard-focusable links')
  assert.equal((source.match(/onKeyDown=\{event => activateDashboardRow\(event, go\)\}/g) || []).length, 3,
    'opportunity, customer, and proposal rows must activate from the keyboard')
})

test('My Dashboard leads with a capped daily-work queue for every role', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /const PREVIEW_LIMIT = 5/)
  assert.equal((source.match(/title="Act on these first"/g) || []).length, 4,
    'sales, approver, admin, and technical dashboards each need one action queue')
  assert.equal((source.match(/title="Act on these first"[^>]+span=\{12\}/g) || []).length, 4,
    'action queues must use the full dashboard width')
  assert.match(source, /\.slice\(0, PREVIEW_LIMIT\)/,
    'dashboard record previews must be capped at five rows')
  assert.doesNotMatch(source, /title="My funnel"/,
    'the daily dashboard must not keep the secondary funnel card')
  assert.match(source, /function SalesDashboard\(\{ store, nav, role, c, open, blocked, nextActions, head, scope \}\)/,
    'sales work summary needs the scoped dashboard counts')
  assert.match(source, /const staleCount = scope === 'my' \? c\.myStale/,
    'sales needs-update count must reflect the selected scope, not the five-row preview')
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

test('every internal role can open detailed reporting from their reporting action', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const app = read('src/App.jsx')
  const tabletApp = read('src/tablet/TabletApp.jsx')
  const overview = source.slice(source.indexOf('function AnalyticsOverview'))
  assert.match(overview, /className="home-analytics-link" onClick=\{\(\) => nav\('\/analytics'\)\}/)
  assert.doesNotMatch(overview, /title="Detailed reporting"/)
  assert.doesNotMatch(overview, /<Analytics embedded \/>/)
  assert.equal((source.match(/Open detailed analytics/g) || []).length, 2,
    'sales and shared reporting surfaces each expose one contextual analytics action')
  assert.doesNotMatch(app, /#detailed-analytics/)
  assert.doesNotMatch(tabletApp, /#detailed-analytics/)
  assert.doesNotMatch(app, /path="\/dashboard"[^\n]*#forecast-details/)
  assert.doesNotMatch(tabletApp, /path="\/dashboard"[^\n]*#forecast-details/)
  assert.match(app, /<Route path="\/dashboard" element=\{<Navigate to="\/my-dashboard" replace \/>\} \/>/)
  assert.match(tabletApp, /<Route path="\/dashboard" element=\{<Navigate to="\/my-dashboard" replace \/>\} \/>/)
  assert.match(app, /<Route path="\/po" element=\{<PageGate page="po"><PurchaseOrders \/><\/PageGate>\} \/>/)
  assert.match(app, /<Route path="\/analytics" element=\{<PageGate page="analytics"><Analytics \/><\/PageGate>\}/)
  assert.match(tabletApp, /<Route path="\/analytics" element=\{<TabletGate page="analytics"><Analytics \/><\/TabletGate>\}/)
  for (const role of Object.keys(ROLES).filter(r => r !== 'CUST')) {
    assert.ok(PERMS[role]?.includes('analytics'), `${role} must reach detailed reporting`)
  }
  assert.ok(!PERMS.CUST.includes('analytics'))
})

test('annual attainment scorecard leads with progress above the figures', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  const styles = read('src/styles.css')
  const card = dashboard.slice(dashboard.indexOf("'Annual attainment'"), dashboard.indexOf('title="Quarterly target vs actual"'))

  assert.match(card, /className="attainment-summary"/)
  assert.match(card, /className="attainment-progress"/)
  assert.ok(card.indexOf('attainment-progress') < card.indexOf('attainment-summary-stats'),
    'the progress track remains above the supporting figures')
  assert.match(styles, /\.attainment-progress\s*\{[^}]*height:\s*12px/s)
  assert.match(styles, /\.attainment-summary-stats\s*\{[^}]*grid-template-columns:\s*repeat\(3/s)
})

test('ADMIN and LJS are co-equal application authorities', () => {
  assert.equal(isAdminRole('ADMIN'), true)
  assert.equal(isAdminRole('LJS'), true)
  assert.deepEqual(PERMS.LJS, PERMS.ADMIN)
})

test('forecast reporting is available internally with sales-owner scoping', () => {
  for (const role of Object.keys(ROLES).filter(r => r !== 'CUST')) {
    assert.equal(canViewForecast(role), true, `${role} should see forecast reporting`)
  }
  assert.equal(canViewForecast('CUST'), false)
  assert.equal(forecastOwnerScope('RS'), 'RS')
  assert.equal(forecastOwnerScope('LJS'), null)
  assert.equal(forecastOwnerScope('TECH'), null)

  const source = read('src/pages/Dashboard.jsx')
  assert.match(source, /forecastOwnerScope/)
  assert.match(source, /visibleOpportunities/)
  assert.doesNotMatch(source, /visible to approvers\/admin only/)
})

test('win and loss reasons are grouped in the owner dashboard overview', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const overview = source.slice(source.indexOf('function AnalyticsOverview'))
  assert.match(overview, /winLossAnalysis\(/)
  assert.match(overview, /Win \/ loss analysis/)
  assert.match(overview, /winLoss\.byReason\.filter\(row => row\.lost > 0\)/)
  assert.match(overview, /dashboard-wl-reason-list/)
  assert.doesNotMatch(overview, /topWinReason/)
  assert.doesNotMatch(overview, /<WinLossPie/)
  assert.doesNotMatch(overview, /o\.closedReason \|\| '—'/)
})

test('dashboard palette is semantic and contained to dashboard surfaces', () => {
  const styles = read('src/styles.css')
  const palette = styles.slice(styles.indexOf('Dashboard semantic palette'))

  assert.match(palette, /\.dashboard-page\s*\{[^}]*--dashboard-canvas:/s)
  assert.match(palette, /\.dashboard-page\s*\{[^}]*--dashboard-success:/s)
  assert.match(palette, /\.dashboard-page\s*\{[^}]*--dashboard-warning:/s)
  assert.match(palette, /\.dashboard-page\s*\{[^}]*--dashboard-danger:/s)
  assert.match(palette, /\.dashboard-page \.stat-card-v2\.tone-sky\s*\{[^}]*background:\s*var\(--dashboard-card\)/s)
  assert.doesNotMatch(palette, /^\.main-col\s*\{/m)
  assert.doesNotMatch(palette, /\.sidenav/)
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
  assert.equal(rs.gap, Math.max(0, rs.annual - rs.achieved))
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

test('the actual line runs the full year, like the Ver 1.1 chart', () => {
  // 21 Aug, screenshot comparison: the client wants the prototype look — the
  // red line spans Apr–Mar, dropping to the baseline for unbooked months.
  // (This reverses the 20 Aug stop-at-today behaviour on purpose.)
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /const actual = perf\.monthly\r?\n/, 'the plotted series is the whole year')
  assert.doesNotMatch(source, /const actual = perf\.monthly\.slice\(0, elapsed\)/)
  // Both series are drawn across all twelve months.
  assert.match(source, /points=\{pts\(target\)\}/)
  assert.match(source, /points=\{pts\(actual\)\}/)
  // But an unbooked month must still read as "not booked yet", never as a
  // ₹0 booking — elapsed gates the tooltip and the table, not the line.
  assert.match(source, /const booked = hover != null && hover < elapsed/)
  assert.match(source, /\{i < elapsed \? fmtLakh\(perf\.monthly\[i\]\) : 'Not booked yet'\}/)
})

test('target is dotted and the actual series uses the dashboard coral token', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /strokeDasharray="5 4"/, 'the target run rate is the dashed line')
  assert.match(source, /stroke="var\(--dashboard-coral\)" strokeWidth="2\.6"/, 'the actual is the solid coral line')
  assert.doesNotMatch(source, /#94a3b8/, 'the target colour was a hardcoded slate literal')
  const css = read('src/styles.css')
  assert.doesNotMatch(css, /\.legend-line\.target \{ border-top-color: #94a3b8/)
  // The legend has to name both series the way the client does.
  assert.match(source, /Target run rate/)
  assert.match(source, /Actual run rate/)
})

test('the run-rate chart stays flat like the reference without an area fill', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.doesNotMatch(source, /linearGradient id=/)
  assert.doesNotMatch(source, /<polygon points=\{area\}/)
})

test('there is one run-rate card, not two, under the prototype title', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const sales = source.slice(source.indexOf('function SalesDashboard'), source.indexOf('// ------------------------------------------------------------ team targets'))
  assert.equal((sales.match(/title="Monthly performance against run rate"/g) || []).length, 1)
  assert.doesNotMatch(source, /title="Monthly bookings"/)
  // The old sparkline card plotted the same array with no target and no labels.
  assert.doesNotMatch(source, /<Sparkline points=\{monthPoints\}/)
  assert.doesNotMatch(source, /ArcGauge/, 'the old gauge must go too')
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
  assert.match(source, /const booked = hover != null && hover < elapsed/)
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
  assert.match(source, /\{i < elapsed \? fmtLakh\(perf\.monthly\[i\]\) : 'Not booked yet'\}/)
  assert.match(read('src/styles.css'), /\.visually-hidden \{/)
})

// ------------------------------------------------- 21 Aug: Ver 1.1 parity
// The client showed the Ver 1.1 prototype dashboard and asked for the same
// look: grouped quarter columns with the three-way legend, the lead-lifecycle
// funnel with conversion captions, and pipeline-snapshot bars — plus a way
// for LJS/AH to set each owner's targets.

test('the quarterly card pairs the column chart with the quarter cards', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /function QuarterColumns\(\{ perf \}\)/)
  const card = source.slice(source.indexOf('title="Quarterly target vs actual"'))
  assert.ok(card.indexOf('<QuarterColumns perf={perf} />') > 0
    && card.indexOf('<QuarterColumns perf={perf} />') < card.indexOf('<QuarterBars perf={perf} />'),
    'columns render above the quarter cards, as in the prototype')
  // The prototype's three-way legend, on tokens rather than its hex literals.
  for (const label of ['Target', 'Actual', 'At or above target']) {
    assert.ok(source.includes(`className="legend-swatch"`) && source.includes(`/>${label}</span>`),
      `legend names ${label}`)
  }
  assert.match(source, /fill=\{target > 0 && actual >= target \? 'var\(--won-text\)' : 'var\(--primary-accent\)'\}/,
    'a quarter at or above target turns green')
})

test('performance scorecard is shared across personal and company dashboard scopes', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /function PerformanceScorecard\(\{ perf, scope = 'personal', funnel \}\)/)
  assert.match(source, /'Annual attainment'/)
  assert.match(source, /className=\"attainment-summary\"/)
  assert.match(source, /className=\"attainment-progress\"/)
  assert.match(source, /<PerformanceScorecard perf=\{perf\} scope=\"personal\"\s+funnel=/)
  assert.match(source, /<PerformanceScorecard perf=\{perf\} scope=\"company\"\s+funnel=/)
})

test('role dashboards place the ModAE Funnel beside quarterly performance', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /function DashboardFunnel\(\{ store, role, nav, title = 'ModAE Funnel', scope = 'role' \}\)/)
  assert.match(source, /className=['\"]dashboard-funnel funnel-visual['\"]/)
  const kpi = read('src/kpi.js')
  assert.match(kpi, /Qualified Lead/)
  assert.match(kpi, /Firm Proposal/)
  assert.match(kpi, /FUNNEL_STAGES/)
  assert.match(kpi, /stages: \['Lead', 'RFI'\]/)
  assert.match(kpi, /stages: \['Firm Bid'\]/)
  assert.doesNotMatch(source, /dashboard-funnel-connector/)
  assert.match(source, /function PerformanceScorecard\(\{ perf, scope = 'personal', funnel \}\)/)
  assert.match(source, /funnel=\{<DashboardFunnel store=\{store\} role=\{role\} nav=\{nav\} scope=\{scope\} \/>\}/)
  assert.match(source, /<AttainmentCard perf=\{perf\} scope="company" \/>/)
  assert.match(source, /className=\"performance-lower-grid\"/)
})

test('ModAE Funnel uses reference rails and coral-to-green stage treatment', () => {
  const styles = read('src/styles.css')
  for (const [token, color] of [
    ['qualified', '#F44336'],
    ['budgetary', '#FF5A4E'],
    ['rfq', '#F46A5F'],
    ['proposal', '#F8897F'],
    ['negotiate', '#237A32'],
  ]) assert.match(styles, new RegExp(`--modae-funnel-${token}: ${color}`))
  assert.match(styles, /\.dashboard-page \.dashboard-funnel\.funnel-visual \.dashboard-funnel-row\s*\{[^}]*background:\s*#F1F1F1;/s)
  assert.match(styles, /\.dashboard-page \.dashboard-funnel\.funnel-visual \.dashboard-funnel-row\.stage-negotiate \.dashboard-funnel-shape\s*\{[^}]*color:\s*#FFFFFF;/s)
})

test('monthly run-rate uses the reference coral actual series', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /stroke="var\(--dashboard-coral\)" strokeWidth="2\.6"/)
  assert.match(source, /stroke="var\(--dashboard-coral\)" strokeWidth="2"/)
  const styles = read('src/styles.css')
  assert.match(styles, /--dashboard-coral:\s*#F44336/)
  assert.match(styles, /\.legend-line\.actual\s*\{[^}]*border-top-color:\s*var\(--dashboard-coral\)/s)
})

test('shared button resets leave dashboard funnel rows borderless', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /\.dashboard-page button:not\(\.home-funnel-row\):not\(\.home-alert-rail button\):not\(\.dashboard-funnel-row\)/)
  assert.match(styles, /button:not\(\.primary\):not\(\.danger\):not\(\.dark\):not\(\.ghost\):not\(\.dashboard-funnel-row\)/)
  assert.match(styles, /\.shell button:not\([^\n]*\.dashboard-funnel-row\),/)
  assert.match(styles, /\.shell button:not\([^\n]*\.dashboard-funnel-row\):hover:not\(:disabled\)/)
  assert.match(styles, /workspace-theme-toggle/)
})

test('run-rate chart remains visible when no bookings are recorded', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /const hasBookings = actual\.some\(value => Number\(value\) > 0\)/)
  assert.match(source, /className=\{`runrate-chart\$\{hasBookings \? '' : ' is-empty'\}`\}/)
  assert.match(source, /\{!hasBookings && \(/)
  assert.match(source, /No bookings recorded yet/)
  assert.match(source, /<polyline points=\{pts\(target\)\}/)
  assert.match(source, /<polyline points=\{pts\(actual\)\}/)
  assert.match(read('src/styles.css'), /\.runrate-empty-note\s*\{[^}]*pointer-events:\s*none/s)
})

test('paired performance rows stretch to aligned card heights', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /\.dashboard-page \.performance-lower-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.85fr\)\s+minmax\(260px,\s*1fr\);[\s\S]*max-width:\s*1120px;[\s\S]*align-items:\s*stretch;/)
  assert.match(styles, /\.dashboard-page \.performance-scorecard-grid,\s*\.dashboard-page \.performance-lower-grid\s*\{\s*align-items:\s*stretch;/)
  assert.doesNotMatch(styles, /\.dashboard-page \.performance-lower-grid > \.dashboard-card\s*\{[\s\S]*align-self:\s*start;/)
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.performance-lower-grid\s*\{\s*grid-template-columns:\s*1fr;/)
})

test('the detailed analytics page owns the funnel instead of the daily dashboard', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.doesNotMatch(source, /AnalyticsFunnel|funnelStages|title="My funnel"/)

  const analytics = read('src/pages/Analytics.jsx')
  assert.match(analytics, /conversion = false/)
  assert.match(analytics, /% of prior/)
  assert.match(analytics, /% of open pipeline/, 'the stage-share caption must survive for the analytics funnel')
})

test('the pipeline snapshot is bars plus a stat list, not a table', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const start = source.indexOf('title="Pipeline snapshot"')
  const card = source.slice(start, source.indexOf('<ForecastReportCard />', start))
  for (const row of ['Open value', 'Weighted', 'Booked orders']) assert.ok(card.includes(`'${row}'`), row)
  assert.match(card, /className=\{`mb-fill \$\{row\.cls\}`\}/)
  assert.match(card, /className="stat-list pipeline-stat-list"/)
  assert.doesNotMatch(card, /cost-table/, 'the flat table gave way to the prototype bars')
  const css = read('src/styles.css')
  for (const cls of ['snap-open', 'snap-weighted', 'snap-booked']) assert.match(css, new RegExp(`\.mb-fill\.${cls}`))
  // Both weighted consumers share kpi.js's PROB_WEIGHT, not a re-typed map.
  assert.match(source, /PROB_WEIGHT\[o\.prob\] \?\? PROB_WEIGHT\.Low/)
  assert.doesNotMatch(source, /\{ Low: \.25, Medium: \.5, High: \.75 \}/)
})

test('LJS and AH can set targets for the owners, and it is audited', () => {
  const store = read('src/store.jsx')
  assert.match(store, /setSalesTarget\(owner, \{ annual, q \}\)/)
  assert.match(store, /withAudit\(\{[\s\S]{0,200}targets: \{ \.\.\.\(s\.sales\?\.targets \|\| \{\}\), \[owner\]: \{ annual, q \} \}/,
    'the write must land in store.sales.targets under audit')
  assert.match(store, /'Sales target updated'/)

  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /function TeamTargetsCard\(\{ store/)
  // The approver dashboard is exactly LJS/AH (isApprover minus admins); the
  // admin dashboard keeps parity. Sales owners never see the editor.
  const approver = source.slice(source.indexOf('function ApproverDashboard'), source.indexOf('function AdminDashboard'))
  const admin = source.slice(source.indexOf('function AdminDashboard'), source.indexOf('function TechDashboard'))
  const sales = source.slice(source.indexOf('function SalesDashboard'), source.indexOf('function TeamTargetsCard'))
  assert.match(approver, /<TeamTargetsCard store=\{store\} \/>/)
  assert.match(admin, /<TeamTargetsCard store=\{store\} \/>/)
  assert.doesNotMatch(sales, /TeamTargetsCard/)
  // The editor speaks lakhs while the store keeps K₹.
  assert.match(source, /const toK = l => Math\.round\(\(parseFloat\(l\) \|\| 0\) \* 100\)/)
  assert.match(source, /store\.setSalesTarget\(editing, \{ annual: toK\(draft\.annual\), q: draft\.q\.map\(toK\) \}\)/)
  // Every owner gets a row, including ones not yet in the seed targets.
  assert.match(source, /\[\.\.\.new Set\(\[\.\.\.OWNERS, \.\.\.Object\.keys\(targets\)\]\)\]/)
})

test('My opportunities is table-only', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /title="My opportunities"[\s\S]*dashboard-table/)
  assert.doesNotMatch(source, /ViewSwitch|dashboard-view-switch|sales-opportunity-cards|sales-compact-list/)
  assert.doesNotMatch(source, /view === ['"](?:cards|compact)['"]/) 
})

test('My orders spans the full dashboard width', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /<Card title="My Opportunities \/ My Orders"[\s\S]*?span=\{12\}/)
})

test('Pipeline snapshot spans the full dashboard width', () => {
  const source = read('src/pages/MyDashboard.jsx')
  assert.match(source, /<Card title="Pipeline snapshot"[\s\S]*?span=\{12\}/)
})

test('sales dashboard follows the action-to-outcome workflow', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const sales = source.slice(source.indexOf('function SalesDashboard'), source.indexOf('// ------------------------------------------------------------ team targets'))
  const positions = [
    'title="Act on these first"',
    'title="Pipeline snapshot"',
    '<SalesPipelineSection ',
    '<SalesCustomerSection ',
    '<div className="section-title">Performance</div>',
  ].map(marker => sales.indexOf(marker))
  assert.ok(positions.every(position => position >= 0), 'all sales dashboard sections must be present')
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i - 1] < positions[i], `${positions[i - 1]} must precede ${positions[i]}`)
  }
})

test('pipeline summary and empty orders use deliberate full-width states', () => {
  const source = read('src/pages/MyDashboard.jsx')
  const styles = read('src/styles.css')
  assert.match(source, /className="pipeline-summary"/)
  assert.match(source, /className="stat-list pipeline-stat-list"/)
  assert.match(source, /pipeline-filter-row/)
  assert.match(styles, /\.dashboard-page \.pipeline-summary,[\s\S]*?width:\s*100%/)
  assert.match(styles, /\.dashboard-page \.pipeline-stat-list li[\s\S]*?width:\s*100%/)
  assert.match(styles, /\.pipeline-filter-row/)
})

test('dashboard view-all actions open the matching workspaces', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  const app = read('src/App.jsx')
  const myOpps = read('src/pages/MyOpps.jsx')
  const styles = read('src/styles.css')
  assert.match(dashboard, /title="My Opportunities \/ My Orders"[\s\S]*?nav\('\/opportunities'\)/)
  assert.match(dashboard, /title="Act on these first"[\s\S]*?nav\('\/my'\)/)
  assert.match(dashboard, /title="My Opportunities \/ My Orders"[\s\S]*?nav\('\/opportunities'\)/)
  assert.match(app, /const PurchaseOrders = lazyWithRecovery\(\(\) => import\('\.\/pages\/PurchaseOrders\.jsx'\)\)/)
  assert.match(app, /<Route path="\/po" element=\{<PageGate page="po"><PurchaseOrders \/><\/PageGate>\} \/>/)
  assert.doesNotMatch(app, /<Route path="\/po" element=\{<Navigate to="\/proposal-sent"/)
  assert.match(myOpps, /<table className="sheet opportunity-list">/)
  assert.match(styles, /\.opportunity-list th, \.opportunity-list td \{[\s\S]*?white-space: normal/)
})
