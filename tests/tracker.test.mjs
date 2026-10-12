import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PIPELINE_COLUMNS, financials, fiscalQuarter } from '../src/excelLogic.js'
import { nextActionWith } from '../src/gates.js'
import { seedOpportunities, seedApprovals, seedKyc, seedSparesLines, seedSvcEstimates, newProposal, routeForType } from '../src/seed.js'
import { opportunityDateRange } from '../src/utils.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const tracker = read('src/pages/Tracker.jsx')
const styles = read('src/styles.css')
const myOpps = read('src/pages/MyOpps.jsx')
const state = {
  approvals: seedApprovals, kyc: seedKyc,
  sparesLines: seedSparesLines, svcEstimates: seedSvcEstimates,
}
const opps = seedOpportunities.map(o => ({ ...o, route: o.route || routeForType(o.oppType) }))
const proposalFor = o => newProposal(o.id, o)

// Biji, 13 Aug, listing the columns he needs: "Opportunity ID, Customer,
// Opportunity Name, Stage, Probability… I need value, value and expected order
// date… and I should know where is the next action pending." Opportunity Owner
// and Updated were explicitly not required.
test('key columns use Excel fields while the full sheet keeps closure reasons', () => {
  const keys = tracker.match(/const KEY_COLS = \[([^\]]*)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''))
  assert.deepEqual(keys, ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'proposalDate', 'orderDate', 'fqFy'])
  assert.equal(PIPELINE_COLUMNS.find(c => c.key === 'closedReason').label, 'Closed Reason*')
  assert.equal(PIPELINE_COLUMNS.find(c => c.key === 'proposalDate').label, 'Proposal Date')
  assert.equal(PIPELINE_COLUMNS.find(c => c.key === 'invoiceDate').label, 'Invoice Date*')
})

test('opportunity proposal lookups tolerate incomplete hydration state', () => {
  assert.match(myOpps, /store\.proposals\?\.\[o\.id\]/)
})

test('all roles open on the readable key columns and can switch to the full sheet', () => {
  assert.match(tracker, /const \[colView, setColView\] = useState\('key'\)/)
  // And the full sheet is one click away — nothing is removed.
  assert.match(tracker, /setColView\(colView === 'key' \? 'all' : 'key'\)/)
})

test('status filter is removed from the Opportunities toolbar and More menu', () => {
  assert.doesNotMatch(tracker, /Filter opportunities by status/)
  assert.doesNotMatch(tracker, /All statuses/)
  assert.doesNotMatch(tracker, /statusFilter/)
})

test('Excel export uses workbook columns and K₹ for every role', () => {
  assert.match(tracker, /const exportCols = PIPELINE_COLUMNS/)
  assert.match(tracker, /\['Sl\.', \.\.\.exportCols\.map\(col => col\.label\)\]/)
  assert.match(tracker, /case 'valueK': return o\.valueK \?\? ''/)
  assert.match(tracker, /case 'gmK': return gmK\(o\)/)
  assert.match(tracker, /case 'fqFy': return fiscalQuarter\(o\.orderDate\)/)
  assert.ok(!PIPELINE_COLUMNS.some(c => c.key === 'nextActionOwner'))
})

test('Value and COGS use stored K₹ directly while GM stays derived', () => {
  assert.match(tracker, /value=\{o\.valueK \?\? ''\}.*?onChange=\{upd\(o\.id, 'valueK'\)\}/)
  assert.match(tracker, /value=\{o\.cogsK \?\? ''\}.*?onChange=\{upd\(o\.id, 'cogsK'\)\}/)
  assert.match(tracker, /\{fmt\(gmK\(o\), 3\)\}/)
  assert.deepEqual(financials({ valueK: 100, cogsK: 25 }), { gmK: 75, gmPct: 0.75 })
})

test('customer and opportunity detail editing is available in the workspace', () => {
  assert.match(read('src/OpportunityDetailsEditor.jsx'), /CustomerPicker/)
  assert.match(read('src/pages/Workbench.jsx'), /opp\.owner === store\.role \|\| isAdminRole\(store\.role\)/)
})

test('the opportunities table does not directly edit workflow stages', () => {
  assert.match(tracker, /Workflow stages are changed from the opportunity workspace/)
  assert.doesNotMatch(tracker, /store\.setMilestone\(o\.id, e\.target\.value/)
})

test('order and invoice dates have independent readable date editors', () => {
  assert.match(tracker, /orderDate: 12,/)
  assert.match(tracker, /fqFy: 7,/)
  assert.match(tracker, /<TrackerDateCell value=\{o\.orderDate \|\| ''\} onChange=/)
  assert.match(tracker, /<TrackerDateCell value=\{o\.invoiceDate \|\| ''\} onChange=/)
  assert.doesNotMatch(tracker, /value=\{o\.invoiceDate\} min=/)
})

test('key date cells contain their editors', () => {
  assert.match(styles, /table\.sheet\.cols-key td:nth-child\(22\) input\[type="date"\][\s\S]*width: 100%;[\s\S]*min-width: 11ch;[\s\S]*max-width: 100%;/)
  assert.match(styles, /tracker-toolbar-actions > \.tracker-more-menu\s*\{[\s\S]*flex: 0 0 124px;/)
  assert.match(styles, /tracker-toolbar-actions > \.tracker-create-logo\s*\{[\s\S]*flex: 0 1 240px;/)
})

test('closed opportunities expose the shared mark-won control', () => {
  assert.match(tracker, /MarkWonControl/)
  assert.match(tracker, /o\.status === 'Closed' && !\['Won', 'Lost'\]\.includes\(o\.stage\) && <MarkWonControl opp=\{o\} store=\{store\} \/>/)
})

test('closed terminal outcomes are explicit in the tracker stage cell', () => {
  assert.match(tracker, /tracker-terminal-stage \$\{o\.stage\.toLowerCase\(\)\}/)
  assert.match(tracker, /<span className="tracker-outcome-label">\{o\.stage\}<\/span>/)
  assert.doesNotMatch(tracker, /workflowStageLabelFor/)
  assert.match(styles, /\.tracker-terminal-stage\.lost \.tracker-outcome-label \{ color: var\(--lost-text\); \}/)
})

test('tracker column text wraps at word boundaries without arbitrary word splitting', () => {
  assert.match(styles, /\.tracker-page \.tracker-th-label[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(styles, /\.tracker-page \.sheet:not\(\.cols-key\) th,[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(styles, /\.tracker-page \.sheet:not\(\.cols-key\) \.tracker-th-label \{[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(styles, /\.tracker-page \.sheet:not\(\.cols-key\) thead tr > :nth-child\(2\)[\s\S]*white-space: nowrap;/)
})

test('key columns share proportional tracks without fixed identity widths', () => {
  const widths = tracker.match(/const KEY_COL_WIDTHS = \{([^}]+)\}/)?.[1]
  assert.ok(widths)
  const values = [...widths.matchAll(/\w+: (\d+),?/g)].map(([, value]) => Number(value))
  assert.equal(values.length, 10)
  assert.equal(values.reduce((sum, value) => sum + value, 0), 97)
  assert.match(tracker, /if \(!all\) return.*KEY_COL_WIDTHS/)
  assert.doesNotMatch(tracker, /100% - var\(--tracker-frozen-width\)/)
  assert.match(tracker, /<colgroup>/)
  assert.match(tracker, /max\(100%, 1200px\)/)
})

test('key view reserves a usable share for expected order dates', () => {
  const widths = tracker.match(/const KEY_COL_WIDTHS = \{([^}]+)\}/)?.[1]
  assert.ok(widths)
  assert.match(widths, /orderDate: 12/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key td input\[type="date"\] \{[\s\S]*?min-width: min\(10ch, 100%\);/)
})

test('numeric Value column stays compact while description keeps the recovered width', () => {
  const widths = tracker.match(/const KEY_COL_WIDTHS = \{([^}]+)\}/)?.[1]
  assert.ok(widths)
  assert.match(widths, /valueK: 7/)
  assert.match(widths, /sellTo: 12/)
  assert.match(widths, /oppName: 23/)
  assert.equal(PIPELINE_COLUMNS.find(c => c.key === 'valueK').label, 'Value (K₹)*')
  assert.match(styles, /table\.sheet\.cols-key td\.num,[\s\S]*white-space: nowrap;/)
})

test('desktop tracker actions stay on one logical row until the compact breakpoint', () => {
  assert.match(styles, /\.tracker-page \.tracker-toolbar-actions \{\s*flex-wrap: nowrap;\s*justify-content: flex-end;/)
  assert.match(styles, /@container workspace \(max-width: 70rem\) \{[\s\S]*?\.tracker-page \.tracker-toolbar-actions \{[\s\S]*?flex-wrap: wrap;/)
})

test('key table wraps narrow headers and values without spilling into adjacent columns', () => {
  assert.match(styles, /\.tracker-page \.sheet\.cols-key \.tracker-th-label \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key td\.tracker-free-text \{[^}]*overflow-wrap: anywhere;/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key td input\[type="date"\][\s\S]*min-width: 0;/)
  assert.match(styles, /\.tracker-page table\.sheet\.cols-key th\.th-filter \{ height: auto; min-height: 46px; \}/)
  assert.match(styles, /\.tracker-page table\.sheet\.cols-key td \{ font-size: 12px; \}/)
  assert.match(styles, /\.tracker-page table\.sheet\.cols-key th\.th-filter \{ font-size: 12px; \}/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key th,\s*\.tracker-page \.sheet\.cols-key td \{ padding: 5px 4px; \}/)
})

test('Opportunities headers use plain table labels without boxed controls', () => {
  assert.match(styles, /Flatten the first spreadsheet header row/)
  assert.match(styles, /\.opportunities-page \.tracker-page table\.sheet thead \.tracker-th-control\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?border-radius: 0;/)
  assert.match(styles, /\.opportunities-page \.tracker-page table\.sheet thead \.tracker-th-control:hover,\s*\.opportunities-page \.tracker-page table\.sheet thead \.tracker-th-control:focus-visible\s*\{[\s\S]*?outline: 0 !important;/)
  assert.match(styles, /\.opportunities-page \.tracker-page table\.sheet thead \.tracker-th-control:focus-visible\s*\{[\s\S]*?text-decoration: underline;[\s\S]*?text-underline-offset: 3px;/)
  assert.match(styles, /Keep the plain column labels on an opaque sticky strip while rows scroll/)
  assert.match(styles, /\.opportunities-page \.tracker-page table\.sheet thead th\s*\{[\s\S]*?position: sticky;[\s\S]*?background: #FFFFFF !important;/)
})

test('both views freeze the same identity columns with matching offsets', () => {
  assert.match(styles, /--tracker-sl-width: 40px;/)
  assert.match(styles, /--tracker-id-width: 144px;/)
  assert.match(styles, /--tracker-customer-width: 240px;/)
  assert.match(styles, /left: var\(--tracker-frozen-left\);/)
  assert.match(styles, /thead tr > :nth-child\(-n\+3\) \{ z-index: 5;/)
  assert.doesNotMatch(styles, /cols-key tbody :is\(td\.rowhead, td\.oppid\) \{\s*position: static;/)
})

test('key Stage cell keeps the Mark Won control inside its narrow column', () => {
  assert.match(styles, /\.tracker-page \.sheet\.cols-key \.tracker-stage-cell \{[^}]*flex-wrap: wrap;/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key \.mark-won-control \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;[^}]*overflow-wrap: normal;/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key \.mark-won-control input \{[^}]*width: 13px;[^}]*min-width: 13px;/)
})

test('switching table views returns to the first column without vertical nudging', () => {
  assert.match(tracker, /useLayoutEffect\(\(\) => \{[\s\S]*?sheetWrapRef\.current\.scrollLeft = 0[\s\S]*?\}, \[colView\]\)/)
  assert.doesNotMatch(tracker, /wrap\.scrollTop = Math\.min/)
})

test('tracker has no trailing proposal action column', () => {
  assert.doesNotMatch(tracker, /<th>Proposal<\/th>/)
  assert.doesNotMatch(tracker, /Open ▸/)
  assert.doesNotMatch(tracker, /Revision opened from Opportunities list/)
  assert.doesNotMatch(tracker, /PROPOSAL_PCT|PROPOSAL_PX/)
  assert.match(tracker, /<td colSpan=\{13\}><\/td>/)
})

test('closing from the Status column requires outcome then reason', () => {
  assert.match(tracker, /field === 'status' && value === 'Closed'/)
  assert.match(tracker, /Choose the outcome, then select the reason/)
  assert.match(tracker, /tracker-close-outcome-options/)
  assert.match(tracker, /closePending\.stage === outcome/)
  assert.match(tracker, /closePending\.stage === 'Won' \? WON_REASONS : CLOSE_REASONS/)
  assert.match(tracker, /store\.closeLost\(closePending\.id, closeReason, null, requiresNote \? note : '', closePending\.stage\)/)
  assert.match(tracker, /store\.markWon\(closePending\.id, closeReason, requiresNote \? note : ''\)/)
})

test('Won and Lost closure paths keep terminal milestones and reason notes aligned', () => {
  assert.match(read('src/store.jsx'), /stage: outcome, status: 'Closed', closedReason: reason, closedReasonNote: reason === 'Other' \? reasonNote : '', milestone: 'Follow-up'/)
  assert.match(read('src/store.jsx'), /stage: 'Won', status: 'Closed', closedReason: reason, closedReasonNote: reason === 'Other' \? reasonNote : '', milestone: 'Handover'/)
  assert.match(tracker, /o\.stage === 'Won' \? WON_REASONS : CLOSE_REASONS/)
  assert.match(tracker, /closeReason === 'Other'/)
})

test('tracker owner filtering follows the top-bar scope', () => {
  assert.match(tracker, /scopedOpportunityRows\(aiRows, scope, store\.role, sheet\)/)
  assert.match(tracker, /normalizeOpportunityFilters\(savedFilters, ownerFilter\)/)
  assert.match(read('src/pages/OpportunityFilters.jsx'), /scope === 'global' \|\| key !== 'owner'/)
})

test('My and Global scope comes from the shared top-bar switch', () => {
  assert.doesNotMatch(tracker, /className="tracker-search-scope"/)
  assert.doesNotMatch(tracker, /type="checkbox"[\s\S]*?checked=\{ownerFilter === 'All'\}/)
  assert.doesNotMatch(tracker, /className="mail-show-all tracker-show-all"[\s\S]*?type="checkbox"/)
  assert.match(myOpps, /const \{ scope \} = useWorkspaceView\(\)/)
  assert.match(myOpps, /if \(scope === 'my'\) rows = rows\.filter\(o => o\.owner === role\)/)
  assert.doesNotMatch(myOpps, /scope-toggle/)
  assert.doesNotMatch(myOpps, /className="show-all-toggle"[\s\S]*?type="checkbox"/)
})

test('show-all text toggles have shared accessible active styling', () => {
  assert.match(styles, /\.scope-toggle\s*\{[\s\S]*cursor: pointer/)
  assert.match(styles, /\.scope-toggle\.active\s*\{[\s\S]*font-weight: 650/)
  assert.match(styles, /\.scope-toggle:focus-visible\s*\{[\s\S]*outline/)
})

test('manager tracker views do not show a redundant all-opportunities status label', () => {
  assert.doesNotMatch(tracker, /Showing all opportunities/)
})

test('the opportunities toolbar does not show a total-value chip', () => {
  assert.doesNotMatch(tracker, /title="Total value of the rows shown"/)
  assert.doesNotMatch(tracker, /className="pill Blue"/)
})

test('the Opportunities toolbar uses compact borderless actions and a smaller primary create action', () => {
  assert.match(styles, /\.opportunities-page \.tracker-page > \.toolbar button\s*\{[\s\S]*?min-height: 32px;[\s\S]*?border-color: transparent;[\s\S]*?background: transparent;[\s\S]*?font-size: 13px;/)
  assert.match(styles, /\.opportunities-page \.tracker-page > \.toolbar \.tracker-create-logo\s*\{[\s\S]*?min-width: 144px;[\s\S]*?height: 32px;[\s\S]*?border-color: transparent;[\s\S]*?background: var\(--action-primary\);[\s\S]*?font-size: 13px;/)
  assert.match(styles, /Merge the closed Opportunities controls into one flat header strip/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-create-logo\s*\{[\s\S]*?background: transparent;[\s\S]*?color: var\(--action-primary\)/)
  assert.match(tracker, /className="tracker-create-logo"[\s\S]*?<Icon name="plus" size=\{16\} \/> Create opportunity/)
})

test('the Opportunities toolbar is visually connected to the table shell', () => {
  assert.match(tracker, /className="tracker-grid-shell"[\s\S]*className="toolbar"[\s\S]*sheet-wrap fill/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*min-height:\s*0;[\s\S]*border:\s*1px solid var\(--border-default\);[\s\S]*overflow:\s*hidden;/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar\s*\{[\s\S]*border-bottom:\s*1px solid var\(--border-subtle\);/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.sheet-wrap\.fill\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*padding-bottom:\s*36px;[\s\S]*border:\s*0;/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell \.tracker-create-logo\s*\{[\s\S]*padding:\s*0 16px !important;/)
})

test('the merged Opportunities toolbar keeps desktop controls on one row', () => {
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*flex-wrap:\s*nowrap;/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-toolbar-actions\s*\{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*white-space:\s*nowrap;/)
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.opportunities-page \.tracker-grid-shell > \.toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/)
})

test('editable controls use a flattened surface treatment', () => {
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\)\s*\{[\s\S]*background: transparent;/)
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\)\s*\{[\s\S]*box-shadow: none;/)
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\)\s*\{[\s\S]*border-bottom: 1px solid var\(--border-subtle\)/)
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\):focus-visible[\s\S]*outline: 2px solid var\(--focus-ring\)/)
})

test('spreadsheet focus does not render the red rectangular outline', () => {
  assert.match(styles, /table\.sheet td\.cell-sel\s*\{[\s\S]*outline: 0;[\s\S]*box-shadow: inset 0 -2px 0 var\(--focus-ring\);/)
  assert.match(styles, /table\.sheet td input:focus, table\.sheet td select:focus\s*\{[\s\S]*outline: 0;[\s\S]*box-shadow: inset 0 -2px 0 var\(--focus-ring\)/)
  assert.match(styles, /table\.sheet td \.wrapcell:focus\s*\{[\s\S]*outline: 0;[\s\S]*box-shadow: inset 0 -2px 0 var\(--focus-ring\)/)
})

test('tracker keeps its title uncluttered and makes empty-view causes explicit', () => {
  assert.doesNotMatch(tracker, /resultCountLabel/)
  assert.doesNotMatch(tracker, /tracker-result-count/)
  assert.match(tracker, /No opportunities are loaded for this view\./)
  assert.match(tracker, /All Opportunities is selected; the workspace currently contains no rows to display\./)
})

test('tracker column controls compose filters and support select-all toggling', () => {
  assert.match(tracker, /matchesFilters = \(o, activeFilters = filters, except = null\)/)
  assert.match(tracker, /filterOpportunityRows\(aiRows, criteria, filterContext\)/)
  assert.match(tracker, /toggleSubsetIn\(current\[col\.key\], values, visibleValues\)/)
  assert.match(tracker, /key=\{filterValueKey\(v\)\}/)
  assert.match(tracker, /matchesFilterQuery\(v, query\)/)
  assert.match(tracker, /<button type="button" className="tracker-th-control"/)
  assert.match(styles, /table\.sheet th\.th-filter[\s\S]*font-weight: 700/)
})

test('clicking a column name opens its menu without a separate arrow control', () => {
  assert.match(tracker, /<button type="button" className="tracker-th-control"[\s\S]*onClick=\{e => openColumnMenu\(col, e\)\}/)
  assert.match(tracker, /<span className="tracker-th-label">.*Opportunity description.*col\.label.*<\/span>/)
  assert.doesNotMatch(tracker, /tracker-th-indicator/)
  assert.match(tracker, /aria-sort=\{sort\?\.key === col\.key/)
})

test('key fields retain a filter menu when their header moves into row labels', () => {
  assert.match(tracker, /className="tracker-th-control"[\s\S]*openColumnMenu\(col, e\)/)
  assert.match(tracker, /<OpportunityFilters criteria=\{criteria\}/)
  assert.doesNotMatch(tracker, /Sort and filter key opportunity field/)
})

test('editable key fields keep accessible names when their headers are hidden', () => {
  assert.match(tracker, /function WrapInput\(\{ value, onChange, title, label, disabled = false, onBlur, onFocus, onKeyDown \}\)/)
  assert.match(tracker, /<textarea disabled=\{disabled\}/)
  assert.match(tracker, /<textarea[^>]*aria-label=\{label\}/)
  assert.match(tracker, /label=\{COLS\[20\]\.label\}/)
  for (const index of [9, 13, 14, 25]) {
    assert.match(tracker, new RegExp(`aria-label=\\{COLS\\[${index}\\]\\.label\\}`))
  }
})

test('tracker provides dual-layer global and quick filtering with removable chips', () => {
  assert.match(tracker, /matchesGlobalSearch\(o, searchTerm, COLS, cellVal\)/)
  assert.match(tracker, /className="tracker-filter-chips flex flex-wrap items-center gap-1"/)
  assert.match(tracker, /No opportunities match these filters\./)
  assert.match(read('src/ui/OpportunityAiSearch.jsx'), /placeholder="Search opportunities or ask AI…"/)
})

test('opportunities search is a separate bordered field beside owner scope', () => {
  assert.match(read('src/ui/OpportunityAiSearch.jsx'), /className="tracker-search" aria-label="Search all opportunities"/)
  assert.match(tracker, /className="tracker-toolbar-actions"/)
  assert.doesNotMatch(tracker, /id="opportunities-owner-filter"/)
})

test('date filter is available inside the Opportunities search surface', () => {
  assert.match(tracker, /aria-haspopup="dialog" aria-expanded=\{filtersOpen\}/)
  assert.match(tracker, /<span>Filters\{activeFilterCount/)
  assert.doesNotMatch(tracker, /openDateFilterMenu|phoneFiltersOpen/)
})

test('Opportunities toolbar keeps groups spaced and the filter control icon-only', () => {
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-toolbar-filters \{[\s\S]*?grid-template-columns: minmax\(240px, 1fr\);/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-search-filter \{[\s\S]*?width: 42px;/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-search-filter-active \{[\s\S]*?border-radius: 50%;/)
  assert.match(styles, /\.opportunities-page \.tracker-page table\.sheet:not\(\.cols-key\) \.wrapcell \{[\s\S]*?white-space: normal;/)
})

test('Opportunities toolbar reads search, filter, More, owner, columns, create', () => {
  const search = tracker.indexOf('className="tracker-search"')
  const filter = tracker.indexOf('className={`tracker-search-filter')
  const more = tracker.indexOf('className="tracker-more-menu"')
  const columns = tracker.indexOf('className="tracker-columns-toggle"')
  const create = tracker.indexOf('className="tracker-create-logo"')
  assert.ok(search < filter && filter < more && more < columns && columns < create)
  assert.doesNotMatch(tracker, /className="tracker-owner-filter"/)
})

test('all Opportunities toolbar controls share the neutral treatment', () => {
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-search-group,[\s\S]*?\.tracker-more-trigger,[\s\S]*?\.tracker-owner-filter,[\s\S]*?\.tracker-columns-toggle,[\s\S]*?\.tracker-create-logo\s*\{[\s\S]*background: var\(--action-secondary-bg\) !important;[\s\S]*color: var\(--action-secondary-text\) !important;/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-search-group \.tracker-search-filter\.active\s*\{[\s\S]*background: var\(--primary-soft\);[\s\S]*color: var\(--primary-deep\);/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell \.tracker-create-logo:hover:not\(:disabled\)\s*\{[\s\S]*background: var\(--action-secondary-hover\) !important;[\s\S]*color: var\(--action-secondary-text\) !important;/)
})

test('the Opportunities search bar has a clear input hierarchy and focus state', () => {
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-search-group\s*\{[\s\S]*min-height: 42px;[\s\S]*border-radius: 10px;[\s\S]*box-shadow:/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-search-group \.tracker-search input::placeholder\s*\{[\s\S]*color: var\(--text-tertiary\);[\s\S]*opacity: 1;/)
  assert.match(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-search-group:focus-within\s*\{[\s\S]*border-color: var\(--action-secondary-border\) !important;[\s\S]*box-shadow: inset 0 -2px 0 var\(--focus-ring\)/)
  assert.doesNotMatch(styles, /\.opportunities-page \.tracker-grid-shell > \.toolbar \.tracker-search-group:focus-within\s*\{[^}]*var\(--color-primary\)/)
})

test('tracker date filter supports specific dates and calendar periods', () => {
  assert.deepEqual(opportunityDateRange('specific', { date: '2026-09-19' }).range, ['2026-09-19', '2026-09-19'])
  assert.deepEqual(opportunityDateRange('week', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-09-14', '2026-09-20'])
  assert.deepEqual(opportunityDateRange('month', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-09-01', '2026-09-30'])
  assert.deepEqual(opportunityDateRange('quarter', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-07-01', '2026-09-30'])
  assert.deepEqual(opportunityDateRange('year', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-01-01', '2026-12-31'])
})

test('tracker custom date range validates ordering and allows open bounds', () => {
  assert.equal(opportunityDateRange('custom', { from: '2026-10-01', to: '2026-09-01' }).error, 'From date must be on or before the To date.')
  assert.equal(opportunityDateRange('custom', {}).range, null)
  assert.deepEqual(opportunityDateRange('custom', { from: '2026-09-01', to: '' }).range, ['2026-09-01', ''])
})

test('tracker renders selectable date fields and period controls', () => {
  const popup = read('src/pages/OpportunityFilters.jsx')
  assert.match(popup, /OPPORTUNITY_DATE_FIELDS\.map/)
  assert.match(popup, /OPPORTUNITY_PERIODS\.map/)
  assert.match(popup, /opportunityFilterDateState\(draft.date\)/)
  assert.match(tracker, /matchesOpportunityDate\(o, dateFilter\)/)
})

test('My Opportunities shows the same working columns', () => {
  assert.match(myOpps, /<th>Expected Order Date<\/th><th>Next Action<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Owner<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Updated<\/th>/)
})

test('closed opportunities are labelled My Orders', () => {
  assert.match(tracker, /const sheet = savedSheet === 'My Orders' \? 'My Orders' : 'Opportunities'/)
  assert.match(tracker, /aria-label="Opportunity list view"/)
  assert.match(read('src/opportunityFilters.js'), /row.status === 'Closed' && row.stage === 'Won'/)
  assert.doesNotMatch(tracker, /Old Closed Opps/)
})

test('My Orders contains Won opportunities only', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(dashboard, /o\.status === 'Closed' && o\.stage === 'Won'/)
  assert.match(dashboard, /My orders \(Won\)/)
})

test('opportunity IDs open the full opportunity workspace', () => {
  assert.match(tracker, /<Link to=\{`\/opp\/\$\{o\.id\}`\} title="Open opportunity workspace">\{displayOpportunityId\(o\.id\)\}<\/Link>/)
  assert.doesNotMatch(tracker, /<Link to=\{`\/folders\/\$\{o\.id\}`\}>\{o\.id\}<\/Link>/)
})

test('opportunity rows do not expose a delete action', () => {
  assert.doesNotMatch(tracker, /tracker-row-delete|Delete opportunity|deleteArmedId|store\.deleteOpportunity/)
  assert.doesNotMatch(read('src/opppanel.jsx'), /Delete opportunity|deleteArmed|store\.deleteOpportunity/)
  assert.doesNotMatch(read('src/pages/Folders.jsx'), /<DeleteButton id=\{o\.id\}/)
})

// --------------------------------------------------- next action pending owner
test('the next action owner is derived, not left blank', () => {
  const open = opps.filter(o => o.status === 'Open')
  assert.ok(open.length > 0)
  const named = open.filter(o => nextActionWith(o, proposalFor(o), state).owner)
  assert.equal(named.length, open.length,
    'every open opportunity must name who the next action sits with')
})

test('a typed owner overrides the derivation', () => {
  const o = { ...opps[0], nextActionOwner: 'PP' }
  const na = nextActionWith(o, proposalFor(o), state)
  assert.equal(na.owner, 'PP')
  assert.equal(na.derived, false)
})

// The customer here is Green, i.e. already cleared, so no verification gate
// applies. What is outstanding is the service scope, and that sits with the
// salesperson who owns the opportunity.
test('an unscoped service opportunity names its own salesperson', () => {
  const clear = { id: 'X-1', status: 'Open', owner: 'RS', route: 'Service', customerStatus: 'Green', oppType: 'Service', sellTo: 'ACME', eucName: 'ACME Plant', eucLocation: 'Pune', oppName: 'Service scope', contactPerson: 'Buyer', contactPhone: '9999999999' }
  const na = nextActionWith(clear, { bom: [], terms: [] }, { approvals: [], kyc: {}, sparesLines: [], svcEstimates: [] })
  assert.equal(na.owner, 'RS')
  assert.equal(na.derived, true)
})

test('a KYC block sits with the commercial approver', () => {
  const blue = { id: 'X-2', status: 'Open', owner: 'RS', route: 'Service', oppType: 'Service', customerStatus: 'Blue', sellTo: 'Unknown Ltd' }
  const na = nextActionWith(blue, { bom: [], terms: [] }, { approvals: [], kyc: {}, sparesLines: [], svcEstimates: [] })
  assert.equal(na.owner, 'AH')
  assert.match(na.text, /KYC/)
})

test('Next Action remains in the list and drawer after removal from the Excel sheet', () => {
  assert.doesNotMatch(tracker, /nextActionWith/)
  assert.match(myOpps, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)/)
  assert.match(read('src/opppanel.jsx'), /nextActionWith\(opp, store\.getProposal\(oppId\), store\)/)
})

test('opportunity sheets paginate sorted, filtered rows to fit the viewport', () => {
  assert.match(tracker, /useViewportPageSize\(rows\.length, \{ enabled: !phone, rootRef: gridRef \}\)/)
  assert.match(tracker, /const visiblePageSize = phone \? 10 : pageSize/)
  assert.match(tracker, /const pageRows = rows\.slice\(\(currentPage - 1\) \* visiblePageSize, currentPage \* visiblePageSize\)/)
  assert.match(tracker, /const totals = rows\.reduce/)
  assert.match(tracker, /pageRows\.map\(\(o, index\)/)
  assert.match(tracker, /\[sheet, ownerFilter, searchTerm, savedFilters, conditions, sort, dateFilter, activeAi\]/)
  assert.match(tracker, /setPage\(current => Math\.min\(current, pageCount\)\)/)
  assert.match(tracker, /aria-label="First page"/)
  assert.match(tracker, /aria-label="Previous page"/)
  assert.match(tracker, /aria-label="Next page"/)
  assert.match(tracker, /aria-label="Last page"/)
})

test('the Opportunities alerts render after pagination and before sheet tabs', () => {
  const trackerPage = read('src/pages/Opportunities.jsx')
  assert.match(trackerPage, /afterTable=\{<WorkspaceInsights/)
  assert.match(tracker, /className="tracker-pagination"[\s\S]*?\{afterTable\}[\s\S]*?className="sheet-tabs"/)
})

// ------------------------------------------------------------- dates
// "Create date, proposal date and last update date — it automatically system
// taken." Only the two expected dates are the salesperson's to type.
test('system-stamped dates are read-only on the sheet', () => {
  assert.doesNotMatch(tracker, /value=\{o\.createDate \|\| ''\} onChange=/,
    'Create Date must not be editable')
  assert.doesNotMatch(tracker, /value=\{o\.proposalDate \|\| ''\} onChange=/,
    'Proposal Date must not be editable')
  assert.match(tracker, /Stamped when the opportunity was created — read only/)
  assert.match(tracker, /Auto-stamped — read only/)
})

test('order date is flagged while invoice date remains independent', () => {
  assert.match(tracker, /o\.status === 'Open' && !o\.orderDate \? 'need' : ''/)
  assert.doesNotMatch(tracker, /o\.status === 'Open' && !o\.invoiceDate \? 'need' : ''/)
  assert.equal(fiscalQuarter('2026-04-01'), 'Q1-2027')
})

// The rename landed on the tracker only; the drawer, Analytics and the forecast
// dashboard still said Order Date / Invoice Date.
test('Excel table uses original date labels', () => {
  assert.equal(PIPELINE_COLUMNS.find(c => c.key === 'orderDate').label, 'Order Date*')
  assert.equal(PIPELINE_COLUMNS.find(c => c.key === 'invoiceDate').label, 'Invoice Date*')
  assert.equal(PIPELINE_COLUMNS.findIndex(c => c.key === 'fqFy') + 1, PIPELINE_COLUMNS.findIndex(c => c.key === 'invoiceDate'))
})
