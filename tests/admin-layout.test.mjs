import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const styles = fs.readFileSync('src/styles.css', 'utf8')
const admin = fs.readFileSync('src/pages/Admin.jsx', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')

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

test('Admin workflow includes region filtering, visual owner/risk badges, and save feedback', () => {
  assert.match(admin, /type="search" value=\{regionSearch\}/)
  assert.match(admin, /admin-owner-badge/)
  assert.match(admin, /risk-badge/)
  assert.match(app, /showAdminSaveStatus=\{loc\.pathname === '\/admin'\}/)
  assert.match(app, /notification-save-status/)
})

test('Admin access controls merge the three ownership cards into one panel', () => {
  assert.match(admin, /className="admin-access-controls-panel"/)
  assert.match(admin, /Access &amp; Routing Controls/)
  assert.match(admin, /Configure user permissions, regional routing, and opportunity ownership\./)
  assert.match(admin, /className="admin-access-controls-grid"/)
  assert.match(admin, /className="admin-access-column"/)
  assert.match(styles, /\.admin-access-controls-panel \{[\s\S]*?border: 1px solid var\(--admin-border-subtle\);[\s\S]*?border-radius: 12px;[\s\S]*?overflow: hidden;/)
  assert.match(styles, /\.admin-access-controls-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/)
  assert.match(styles, /\.admin-access-column \+ \.admin-access-column \{[\s\S]*?border-left: 1px solid var\(--admin-border-subtle\);/)
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.admin-access-controls-grid \{[\s\S]*?grid-template-columns: 1fr;/)
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

test('Admin settings use a landscape adaptive grid before stacking', () => {
  assert.match(styles, /\.admin-page \.admin-setting-grid,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(styles, /@media \(min-width: 1280px\) \{[\s\S]*?\.admin-page \.admin-setting-grid[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/)
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.admin-page \.admin-setting-grid,[\s\S]*?grid-template-columns: 1fr;/)
  assert.match(styles, /\.admin-page \.admin-workflow-layout \{[\s\S]*?display: block;/)
  assert.match(styles, /\.admin-page \.admin-workflow-tabs \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
  assert.match(styles, /\.admin-page \.admin-setting-grid > \.admin-card,[\s\S]*?grid-column: span 1;/)
})
