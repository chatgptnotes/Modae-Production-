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
  assert.match(drawer, /const tabNames = \[DETAILS_TAB, \.\.\.subNames\]/,
    'the tab strip must be Details plus the opportunity subfolders')
  // Opening a different opportunity must land on Details, not on whichever
  // folder happened to be selected for the previous one.
  assert.match(drawer, /useState\(DETAILS_TAB\)/)
  assert.match(drawer, /useEffect\(\(\) => \{ setTab\(DETAILS_TAB\) \}, \[oppId\]\)/)
  // A subfolder deleted on the Folders page must not leave a dead tab active.
  assert.match(drawer, /tabNames\.includes\(tab\) \? tab : DETAILS_TAB/)
  assert.match(drawer, /\{tabNames\.map\(sf =>/, 'the tab strip renders tabNames, not subNames')
})

test('the record form belongs to Details, and the file list to the folders', () => {
  assert.match(drawer, /const isDetails = activeTab === DETAILS_TAB/)
  assert.match(drawer, /\{isDetails && \(\s*<div className="drawer-form">/,
    'the form must render only on the Details tab')
  assert.match(drawer, /\{!isDetails && \(\s*<div className="drawer-files">/,
    'the file list must render only on a folder tab')
  // The regression this replaces: an unconditional editor under every tab.
  const gate = drawer.indexOf('{isDetails && (')
  const editor = drawer.indexOf('<OpportunityDetailsEditor')
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

test('the folder panels edit fields but never take the gated decisions', () => {
  // Correcting a field is ordinary editing and belongs wherever you notice the
  // mistake — the panels do it through the parent's `upd`, the same
  // write-through the Details tab and the tracker grid use.
  //
  // Verifying KYC and deciding approvals are different: they are role-gated
  // decisions and stay in the workbench, where the AH gate and the document
  // viewer live. That is what this list protects — not field editing.
  const panelSource = drawer.slice(drawer.indexOf('function SpecsPanel('))
  for (const write of ['setKycState', 'decideApproval', 'addFile']) {
    assert.doesNotMatch(panelSource, new RegExp(`store\\.${write}\\(`),
      `the drawer panels must not call store.${write}`)
  }
  // Field edits go through the injected helper, so the coupling rules in
  // OppPanel.upd (loss reason, date ordering) apply here too rather than being
  // bypassed by a direct store call.
  assert.doesNotMatch(panelSource, /store\.updateOpportunity\(/,
    'panels must use the injected upd, not call the store directly')
  // Each panel instead routes to the workbench tab that owns the action.
  assert.match(panelSource, /\/opp\/\$\{opp\.id\}\/approvals/)
  assert.match(panelSource, /\/opp\/\$\{opp\.id\}\/customer/)
})

test('the panel styling is scoped to the narrow drawer', () => {
  assert.match(css, /^\.drawer-panel \{/m)
  // .check-row is a no-wrap flex line sized for the full-width workbench.
  assert.match(css, /\.drawer-panel \.check-row \{ flex-wrap: wrap; \}/)
})

// ---- the folder panels edit, they do not just print -----------------------
// Customer Specs and Partner Docs printed their context as a read-only table,
// so a correction spotted while reading the requirement had to be made on the
// Details tab or the tracker grid and then found again here.

test('the Customer Specs context is editable', () => {
  assert.match(drawer, /function SpecsPanel\(\{ opp, store, upd \}\)/,
    'SpecsPanel needs the same write-through helper the Details tab uses')
  assert.match(drawer, /<SpecsPanel opp=\{opp\} store=\{store\} upd=\{upd\} \/>/)
  for (const field of ['oppType', 'eucName', 'eucLocation', 'contactPerson', 'contactPhone']) {
    assert.ok(drawer.includes(`upd('${field}')`), `${field} must be editable somewhere in the drawer`)
  }
})

test('the Partner Docs context is editable', () => {
  assert.match(drawer, /function PartnerPanel\(\{ opp, store, nav, upd \}\)/)
  assert.match(drawer, /<PartnerPanel opp=\{opp\} store=\{store\} nav=\{nav\} upd=\{upd\} \/>/)
  for (const field of ['category', 'bu', 'segment', 'solution']) {
    assert.ok(drawer.includes(`upd('${field}')`), `${field} must be editable`)
  }
})

// Route and context are recomputed from oppType on every load (appState.migrate),
// so an input bound to them would accept a value and silently revert on reload.
test('route is shown as derived rather than offered as a field', () => {
  assert.doesNotMatch(drawer, /upd\('route'\)/, 'route must never be directly editable')
  assert.doesNotMatch(drawer, /upd\('context'\)/, 'context must never be directly editable')
  assert.match(drawer, /follows the Opp Type/, 'and the panel must say why it is read-only')
})

test('the editable meta tables are styled to fit their controls', () => {
  assert.match(drawer, /className="cost-table drawer-meta"/)
  assert.match(css, /\.drawer-panel \.drawer-meta input,\s*\.drawer-panel \.drawer-meta select \{[^}]*width: 100%/)
  // A <td> cannot be a flex container without breaking the table's column
  // sizing, so the paired inputs are wrapped.
  assert.match(drawer, /<td>\s*<div className="drawer-meta-pair">/)
})
