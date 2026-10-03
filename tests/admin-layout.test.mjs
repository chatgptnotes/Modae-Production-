import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const styles = fs.readFileSync('src/styles.css', 'utf8')
const admin = fs.readFileSync('src/pages/Admin.jsx', 'utf8')

test('Admin cards use content height instead of stretched minimum heights', () => {
  assert.match(styles, /\.admin-setting-grid,\s*\.admin-wide-grid,\s*\.admin-bottom-grid \{[\s\S]*?align-items: start;/)
  assert.match(styles, /\.admin-page \.admin-card \{[\s\S]*?min-height: 0;/)
  assert.match(styles, /\.admin-page \.admin-card--featured \{[\s\S]*?min-height: 0;/)
})

test('Admin text keeps natural word wrapping', () => {
  assert.match(styles, /\.admin-page \.admin-card,[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/)
  assert.match(styles, /\.admin-page \.admin-card \.arow > span,[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/)
})

test('Admin workflow exposes nested category navigation', () => {
  assert.match(admin, /className="admin-section-rail admin-workflow-tabs"/)
  assert.doesNotMatch(admin, /Workflow &amp; governance/)
  assert.doesNotMatch(admin, /admin-section-rail-label/)
  assert.match(admin, /id: 'access', label: 'Access & routing'/)
  assert.match(admin, /id: 'clauses', label: 'T&C Clause Library'/)
  assert.match(admin, /id: 'commercial', label: 'Commercial & automation'/)
  assert.match(admin, /id: 'customer', label: 'Customer governance'/)
  assert.match(admin, /role="tablist"/)
  assert.match(admin, /id="admin-subpanel-access"/)
  assert.match(admin, /id="admin-subpanel-clauses"/)
  assert.match(admin, /id="admin-subpanel-commercial"/)
  assert.match(admin, /id="admin-subpanel-customer"/)
})

test('Admin workflow includes region filtering and visual owner/risk badges', () => {
  assert.match(admin, /type="search" value=\{regionSearch\}/)
  assert.match(admin, /admin-owner-badge/)
  assert.match(admin, /risk-badge/)
})

test('Admin access controls keep users and regional ownership in one panel', () => {
  assert.match(admin, /className="admin-access-controls-panel"/)
  assert.match(admin, /Access &amp; Routing Controls/)
  assert.match(admin, /Configure user permissions, regional routing, and opportunity ownership\./)
  assert.match(admin, /className="admin-access-controls-grid"/)
  assert.match(admin, /className="admin-access-column"/)
  assert.match(styles, /\.admin-access-controls-panel \{[\s\S]*?border: 1px solid var\(--admin-border-subtle\);[\s\S]*?border-radius: 12px;[\s\S]*?overflow: hidden;/)
  assert.match(styles, /\.admin-access-controls-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(styles, /\.admin-access-column \+ \.admin-access-column \{[\s\S]*?border-left: 1px solid var\(--admin-border-subtle\);/)
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.admin-access-controls-grid \{[\s\S]*?grid-template-columns: 1fr;/)
  assert.doesNotMatch(admin, /Owner by opportunity type/)
  assert.doesNotMatch(admin, /ownerRules/)
})

test('Admin clause library uses a responsive editable data table', () => {
  assert.doesNotMatch(admin, /openClause/)
  assert.match(admin, /className="clause-library-section"/)
  assert.match(admin, /className="clause-library-table"/)
  assert.match(admin, /Clause title/)
  assert.match(admin, /Clause text/)
  assert.match(admin, /Actions/)
  assert.match(admin, /className="clause-library-title-field"/)
  assert.match(admin, /className="clause-library-text-field"/)
  assert.match(admin, /store\.saveClause/)
  assert.match(admin, /mintId\('CL'/)
  assert.match(admin, /\+ Add New Clause/)
  assert.match(styles, /\.clause-library-table-wrap \{[\s\S]*?overflow-x: auto;[\s\S]*?border: 1px solid var\(--admin-border-subtle\);[\s\S]*?border-radius: 8px;/)
  assert.match(styles, /\.clause-library-table th \{[\s\S]*?text-transform: uppercase;/)
  assert.match(styles, /\.clause-library-table td \{[\s\S]*?border-top: 1px solid var\(--admin-border-subtle\);/)
  assert.match(styles, /\.clause-library-title-col \{[\s\S]*?width: 25%;/)
  assert.match(styles, /\.clause-library-actions-col \{[\s\S]*?width: 80px;/)
  assert.match(styles, /\.clause-library-text-field \{[\s\S]*?resize: vertical;[\s\S]*?white-space: pre-wrap;[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(styles, /\.clause-library-remove \{[\s\S]*?color: var\(--status-danger\);[\s\S]*?background: var\(--status-danger-soft\);/)
  assert.doesNotMatch(admin, /clause-library-entry/)
  assert.doesNotMatch(styles, /clause-library-entry/)
})

test('Admin clause text editors size to content instead of reserving an oversized box', () => {
  assert.match(admin, /function AutoSizingTextarea\(/)
  assert.match(admin, /<AutoSizingTextarea[\s\S]*?className="clause-library-text-field"/)
  assert.match(styles, /\.admin-page \.clause-library-text-field \{[\s\S]*?min-height: 1\.5em;[\s\S]*?resize: none;/)
  assert.doesNotMatch(admin, /className="clause-library-text-field"[\s\S]*?rows=\{3\}/)
  assert.doesNotMatch(admin, /useLayoutEffect\(\(\) => resize\(ref\.current\), \[value\]\)/)
})

test('Admin settings use a landscape adaptive grid before stacking', () => {
  assert.match(styles, /\.admin-page \.admin-setting-grid,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(styles, /@media \(min-width: 1280px\) \{[\s\S]*?\.admin-page \.admin-setting-grid[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/)
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.admin-page \.admin-setting-grid,[\s\S]*?grid-template-columns: 1fr;/)
  assert.match(styles, /\.admin-page \.admin-workflow-layout \{[\s\S]*?display: block;/)
  assert.match(styles, /\.admin-page \.admin-workflow-tabs \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
  assert.match(styles, /\.admin-page \.admin-setting-grid > \.admin-card,[\s\S]*?grid-column: span 1;/)
})

test('Admin card labels and ownership controls keep readable widths', () => {
  assert.match(styles, /\.admin-page \.admin-workflow-tabs \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(180px, 1fr\)\);/)
  assert.match(styles, /\.admin-page \.admin-workflow-tabs button > span:last-child \{[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/)
  assert.match(styles, /\.admin-page \.admin-setting-grid > \.admin-card,[\s\S]*?height: auto;[\s\S]*?align-self: start;/)
  assert.match(styles, /\.admin-page \.admin-access-controls-grid \{[\s\S]*?minmax\(460px, 1\.22fr\)/)
  assert.match(styles, /\.admin-page \.admin-access-column \.arow \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(150px, auto\);/)
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?\.admin-page \.admin-access-column \.arow \{[\s\S]*?grid-template-columns: 1fr;/)
})

test('Admin ownership rows keep the region and owner controls on one line', () => {
  assert.match(admin, /className="arow admin-ownership-row"/)
  assert.match(styles, /\.admin-page \.admin-access-column \.admin-ownership-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 156px;[\s\S]*?align-items: center;/)
  assert.match(styles, /\.admin-page \.admin-access-column \.admin-ownership-row \.admin-select-with-badge \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?white-space: nowrap;/)
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?\.admin-page \.admin-access-column \.admin-ownership-row \{[\s\S]*?grid-template-columns: 1fr;/)
})

test('Admin routing review is advisory and uses the server AI task', () => {
  const ai = fs.readFileSync('api/ai.js', 'utf8')
  assert.match(admin, /runTaskResult\('admin\.routing-review'/)
  assert.match(admin, /Review routing with AI/)
  assert.match(admin, /ownershipRules: config\.ownershipRules/)
  assert.match(admin, /stateRegions: config\.stateRegions/)
  assert.match(admin, /routingReview\.findings/)
  assert.match(ai, /admin\.routing-review/)
  assert.match(ai, /routingReviewSchema/)
  assert.match(ai, /Deterministic[\s\S]*authoritative/)
  assert.doesNotMatch(admin, /updateConfig\(.*routingReview/)
})
