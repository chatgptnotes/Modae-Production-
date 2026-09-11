// The opportunity drawer carried four folder tabs (Customer Specs / Partner
// Docs / Proposal / KYC) but only the small file table reacted to them: the
// record form was rendered unconditionally underneath. Three of the four
// folders are normally empty, so every tab looked the same and the tabs read as
// decoration. These tests pin the split — a Details tab owns the form, and each
// folder tab carries its own context panel.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SUBFOLDERS } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const drawer = read('src/opppanel.jsx')
const css = read('src/styles.css')

test('the drawer leads with a Details tab, ahead of the folders', () => {
  assert.match(drawer, /const DETAILS_TAB = 'Details'/)
  assert.match(drawer, /const tabItems = \[/,
    'the tab strip must be Details plus the opportunity subfolders')
  // Opening a different opportunity must land on Details, not on whichever
  // folder happened to be selected for the previous one.
  assert.match(drawer, /useState\(DETAILS_TAB\)/)
  assert.match(drawer, /useEffect\(\(\) => \{ setTab\(DETAILS_TAB\) \}, \[oppId\]\)/)
  // A subfolder deleted on the Folders page must not leave a dead tab active.
  assert.match(drawer, /tabItems\.some\(item => item\.show !== false && item\.id === tab\) \? tab : DETAILS_TAB/)
  assert.match(drawer, /items=\{tabItems\}/, 'the tab strip renders tabItems, not subNames')
})

test('the record form belongs to Details, and the file list to the folders', () => {
  assert.match(drawer, /const isDetails = activeTab === DETAILS_TAB/)
  assert.match(drawer, /\{isDetails && \(\s*<div className="drawer-form">/,
    'the form must render only on the Details tab')
  assert.match(drawer, /\{!isDetails && \(\s*<div className="drawer-files">/,
    'the file list must render only on a folder tab')
  // The regression this replaces: an unconditional editor under every tab.
  const gate = drawer.indexOf('{isDetails && (')
  const editor = drawer.indexOf('<OpportunityDetailsView')
  assert.ok(gate !== -1 && editor > gate,
    'the editor must sit inside the isDetails branch, not above it')
})

test('every seeded folder tab has content of its own', () => {
  const panels = {
    'Customer Specs': 'SpecsPanel',
    'Partner Docs': 'PartnerPanel',
    'Proposal': 'drawer-propsum',
    'KYC': 'KycPanel',
  }
  for (const folder of SUBFOLDERS) {
    assert.ok(panels[folder], `${folder} has no drawer panel mapped — add one`)
    assert.match(drawer, new RegExp(`activeTab === '${folder}'`),
      `${folder} must switch on something of its own`)
    assert.match(drawer, new RegExp(panels[folder]),
      `${folder} must render ${panels[folder]}`)
  }
  for (const name of ['SpecsPanel', 'PartnerPanel', 'KycPanel']) {
    assert.match(drawer, new RegExp(`function ${name}\\(`), `${name} must be defined`)
  }
})

test('the folder panels are read-only and never take gated decisions', () => {
  // The drawer is a viewing surface. Corrections belong in the opportunity
  // workbench; role-gated KYC and approval decisions stay there as well.
  const panelSource = drawer.slice(drawer.indexOf('function SpecsPanel('))
  for (const write of ['setKycState', 'decideApproval', 'addFile']) {
    assert.doesNotMatch(panelSource, new RegExp(`store\\.${write}\\(`),
      `the drawer panels must not call store.${write}`)
  }
  // Drawer panels must not write through the store or receive an edit helper.
  assert.doesNotMatch(panelSource, /store\.updateOpportunity\(/,
    'panels must not update opportunities directly')
  // Each panel instead routes to the workbench tab that owns the action.
  assert.match(panelSource, /\/opp\/\$\{opp\.id\}\/approvals/)
  assert.match(panelSource, /\/opp\/\$\{opp\.id\}\/customer/)
})

test('the panel styling is scoped to the narrow drawer', () => {
  assert.match(css, /^\.drawer-panel \{/m)
  // .check-row is a no-wrap flex line sized for the full-width workbench.
  assert.match(css, /\.drawer-panel \.check-row \{ flex-wrap: wrap; \}/)
})

test('the selected detail tab has a distinct accent state', () => {
  assert.match(css, /\.detail-tabs button\.active \{[^}]*background: var\(--action-accent\)/s)
  assert.match(css, /\.detail-tabs button\.active \{[^}]*color: var\(--text-on-accent\)/s)
  assert.match(css, /\.detail-tabs button\.active \{[^}]*border-bottom: 3px solid var\(--action-accent\)/s)
  assert.match(css, /\.detail-tabs-more-trigger\.active \{[^}]*background: var\(--action-accent\)/s)
  assert.match(css, /\.detail-tabs-more-trigger\.active \{[^}]*color: var\(--text-on-accent\)/s)
})

test('all tab families use the same visible current-page treatment', () => {
  for (const selector of [
    '.sheet-tabs .tab.active', '.opportunities-tabs button.active',
    '.users-tabs button.active', '.workbook-switcher button.active',
    '.workbook-tabs button.active', '.workbook-preview-mode-tabs button.active',
    '.drawer-tabs .dtab.active', '.mail-tabs button.active',
    '.wb-tabs .wtab.active', '.wb-sub button.active',
    '.att-view-sheet-tabs button.active', '.admin-tabs button.active',
    '.proposal-artifact-tabs button.active',
  ]) {
    assert.match(css, new RegExp(selector.replaceAll('.', '\\.') + '[\\s\\S]*?background: var\\(--action-accent\\)'),
      `${selector} must have the shared accent background`)
    assert.match(css, new RegExp(selector.replaceAll('.', '\\.') + '[\\s\\S]*?color: var\\(--text-on-accent\\)'),
      `${selector} must have contrasting active text`)
  }
})

// ---- the folder panels print context; editing belongs to the workbench ------

test('the Customer Specs context is read-only', () => {
  assert.match(drawer, /function SpecsPanel\(\{ opp, store \}\)/)
  assert.match(drawer, /<SpecsPanel opp=\{opp\} store=\{store\} \/>/)
  assert.doesNotMatch(drawer, /upd\('(oppType|eucName|eucLocation|contactPerson|contactPhone)'\)/)
})

test('the Partner Docs context is read-only', () => {
  assert.match(drawer, /function PartnerPanel\(\{ opp, store, nav \}\)/)
  assert.match(drawer, /<PartnerPanel opp=\{opp\} store=\{store\} nav=\{nav\} \/>/)
  assert.doesNotMatch(drawer, /upd\('(category|bu|segment|solution)'\)/)
})

// Route and context are recomputed from oppType on every load (appState.migrate),
// so an input bound to them would accept a value and silently revert on reload.
test('route is shown as derived rather than offered as a field', () => {
  assert.doesNotMatch(drawer, /upd\('route'\)/, 'route must never be directly editable')
  assert.doesNotMatch(drawer, /upd\('context'\)/, 'context must never be directly editable')
  assert.doesNotMatch(drawer, /follows the Opp Type/)
})

test('the drawer metadata remains readable without edit controls', () => {
  assert.match(drawer, /className="cost-table drawer-meta"/)
  assert.doesNotMatch(drawer, /className="drawer-meta-pair"/)
  assert.match(css, /\.drawer-panel \.drawer-meta td:first-child/)
})

test('the opportunity preview drawer has no upload controls', () => {
  assert.doesNotMatch(drawer, /filestore\.activeBackend\(\)/)
  assert.doesNotMatch(drawer, /uploadOppFile/)
  assert.doesNotMatch(drawer, /Upload \(mock\)/)
  assert.doesNotMatch(drawer, /fileInput/)
  assert.doesNotMatch(drawer, /Uploading…/)
})
