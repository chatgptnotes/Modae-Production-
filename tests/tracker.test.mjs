import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
test('the key-column set includes dates but leaves Closed Reason to the full sheet', () => {
  const m = tracker.match(/const KEY_COLS = \[([^\]]*)\]/)
  assert.ok(m, 'KEY_COLS must exist')
  const keys = m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)
  assert.deepEqual(keys, ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'proposalDate', 'orderDate', 'nextActionOwner'])
  assert.match(tracker, /label: 'Proposal Send Date'/)
  assert.match(tracker, /label: 'Expected Order Date'/)
  assert.match(tracker, /\{ key: 'closedReason', letter: 'AA', label: 'Closed Reason\*'/)
  assert.doesNotMatch(m[1], /closedReason/)
  assert.ok(!keys.includes('owner'), 'Owner is not required for a sales owner')
  assert.ok(!keys.includes('lastUpdated'), 'Updated is not required for a sales owner')
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

test('Excel export includes every tracker column for every role', () => {
  assert.match(tracker, /const exportCols = COLS/)
  assert.doesNotMatch(tracker, /COMMERCIAL_COLS/)
  assert.match(tracker, /\['Sl', \.\.\.exportCols\.map\(col => col\.label\)\]/)
  assert.match(tracker, /rows\.map\(\(o, index\) => \[index \+ 1, \.\.\.exportCols\.map\(col => \{/)
  assert.match(tracker, /case 'gmK': return gmK\(o\)/)
  assert.match(tracker, /case 'gmPct': return gmPct\(o\) \|\| ''/)
  assert.match(tracker, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)\.owner \|\| ''/)
})

test('Value and COGS are editable for every tracker user while GM stays derived', () => {
  assert.match(tracker, /value=\{o\.valueK \? o\.valueK \* 1000 : ''\} onChange=\{upd\(o\.id, 'valueK'\)\}/)
  assert.match(tracker, /value=\{o\.cogsK \? o\.cogsK \* 1000 : ''\} onChange=\{upd\(o\.id, 'cogsK'\)\}/)
  assert.match(tracker, />\{o\.valueK \? fmtRupeesFromK\(gmK\(o\)\) : '-'\}<\/td>/)
  assert.doesNotMatch(tracker, /className="num locked"/)
  assert.doesNotMatch(tracker, /name="lock"/)
})

test('customer and opportunity detail editing is available in the workspace', () => {
  assert.match(read('src/OpportunityDetailsEditor.jsx'), /CustomerPicker/)
  assert.match(read('src/pages/Workbench.jsx'), /opp\.owner === store\.role \|\| isAdminRole\(store\.role\)/)
})

test('the opportunities table does not directly edit workflow stages', () => {
  assert.match(tracker, /Workflow stages are changed from the opportunity workspace/)
  assert.doesNotMatch(tracker, /store\.setMilestone\(o\.id, e\.target\.value/)
})

test('forecast dates retain inline editing while Expected Order Date has usable table width', () => {
  assert.match(tracker, /orderDate: 10,/)
  assert.match(tracker, /wAll: 7/)
  assert.match(tracker, /<input type="date" value=\{o\.orderDate\} max=\{o\.invoiceDate/)
  assert.match(tracker, /<input type="date" value=\{o\.invoiceDate\} min=\{o\.orderDate/)
  assert.doesNotMatch(tracker, /ForecastDateInput/)
})

test('closed opportunities expose the shared mark-won control', () => {
  assert.match(tracker, /MarkWonControl/)
  assert.match(tracker, /o\.status === 'Closed' && o\.stage !== 'Lost' && <MarkWonControl opp=\{o\} store=\{store\} \/>/)
})

test('closed terminal outcomes are explicit in the tracker stage cell', () => {
  assert.match(tracker, /tracker-terminal-stage \$\{o\.stage\.toLowerCase\(\)\}/)
  assert.match(tracker, /<span className="tracker-outcome-label">\{o\.stage\}<\/span>/)
  assert.match(tracker, /<span className="tracker-stage-context">\{workflowStageLabelFor\(o\)\}<\/span>/)
  assert.match(styles, /\.tracker-terminal-stage\.lost \.tracker-outcome-label \{ color: var\(--lost-text\); \}/)
})

test('tracker column text wraps at word boundaries without arbitrary word splitting', () => {
  assert.match(styles, /\.tracker-page \.tracker-th-label[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(styles, /\.tracker-page \.sheet:not\(\.cols-key\) th,[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(styles, /\.tracker-page \.sheet:not\(\.cols-key\) \.tracker-th-label \{[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(styles, /\.tracker-page \.sheet:not\(\.cols-key\) thead tr > :nth-child\(2\)[\s\S]*white-space: nowrap;/)
})

test('key columns use a complete percentage budget rather than pixel floors', () => {
  const widths = tracker.match(/const KEY_COL_WIDTHS = \{([^}]+)\}/)?.[1]
  assert.ok(widths)
  const values = [...widths.matchAll(/\w+: (\d+),?/g)].map(([, value]) => Number(value))
  assert.equal(values.length, 10)
  assert.equal(values.reduce((sum, value) => sum + value, 0), 92)
  assert.match(tracker, /const ROWHEAD_PCT = 3/)
  assert.match(tracker, /width: \$\{KEY_COL_WIDTHS\[c\.key\]\}%; min-width: 0;/)
  assert.doesNotMatch(tracker, /KEY_TABLE_MIN_WIDTH|--tracker-key-min-width/)
})

test('key view reserves a usable share for expected order dates', () => {
  const widths = tracker.match(/const KEY_COL_WIDTHS = \{([^}]+)\}/)?.[1]
  assert.ok(widths)
  assert.match(widths, /orderDate: 10/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key td input\[type="date"\] \{[\s\S]*?min-width: min\(10ch, 100%\);/)
})

test('numeric Value column stays compact while description keeps the recovered width', () => {
  const widths = tracker.match(/const KEY_COL_WIDTHS = \{([^}]+)\}/)?.[1]
  assert.ok(widths)
  assert.match(widths, /valueK: 7/)
  assert.match(widths, /oppName: 21/)
  assert.match(tracker, /label: 'Value \(₹\)\*', num: true, w: 7/)
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
  assert.match(styles, /Keep the plain column labels on an opaque sticky strip while rows scroll/)
  assert.match(styles, /\.opportunities-page \.tracker-page table\.sheet thead th\s*\{[\s\S]*?position: sticky;[\s\S]*?background: #FFFFFF !important;/)
})

test('key view does not pin the ID over the row number when columns narrow', () => {
  assert.match(styles, /\.tracker-page table\.sheet\.cols-key tbody :is\(td\.rowhead, td\.oppid\) \{\s*position: static;\s*left: auto;/)
  assert.match(styles, /\.tracker-page table\.sheet\.cols-key thead :is\(th\.rowhead, th:nth-child\(2\)\) \{\s*left: auto;/)
})

test('key Stage cell keeps the Mark Won control inside its narrow column', () => {
  assert.match(styles, /\.tracker-page \.sheet\.cols-key \.tracker-stage-cell \{[^}]*flex-wrap: wrap;/)
  assert.match(styles, /\.tracker-page \.sheet\.cols-key \.mark-won-control \{[^}]*flex: 0 1 auto;[^}]*white-space: normal;/)
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
  assert.match(tracker, /Choose Won or Lost first, then select the reason/)
  assert.match(tracker, /tracker-close-outcome-options/)
  assert.match(tracker, /closePending\.stage === outcome/)
  assert.match(tracker, /closePending\.stage === 'Won' \? WON_REASONS : CLOSE_REASONS/)
  assert.match(tracker, /store\.closeLost\(closePending\.id, closeReason, null, requiresNote \? note : ''\)/)
  assert.match(tracker, /store\.markWon\(closePending\.id, closeReason, requiresNote \? note : ''\)/)
})

test('Won and Lost closure paths keep terminal milestones and reason notes aligned', () => {
  assert.match(read('src/store.jsx'), /stage: 'Lost', status: 'Closed', closedReason: reason, closedReasonNote: reason === 'Other' \? reasonNote : '', milestone: 'Follow-up'/)
  assert.match(read('src/store.jsx'), /stage: 'Won', status: 'Closed', closedReason: reason, closedReasonNote: reason === 'Other' \? reasonNote : '', milestone: 'Handover'/)
  assert.match(tracker, /o\.stage === 'Won' \? WON_REASONS : CLOSE_REASONS/)
  assert.match(tracker, /closeReason === 'Other'/)
})

test('tracker offers all, mine, and specific-owner filtering', () => {
  assert.match(tracker, /const owners = \[\.\.\.\(isSalesRep \? \['Mine'\] : \[\]\), 'All'/)
  assert.match(tracker, /ownerFilter === 'Mine' \? o\.owner === store\.role/)
  assert.match(tracker, /ownerFilter === 'All' \|\| o\.owner === ownerFilter/)
  assert.match(tracker, /My Opportunities/)
  assert.match(tracker, /All Opportunities/)
  assert.match(tracker, /sortVal = \(o, key\) => \(DATE_KEYS\.includes\(key\) \? \(o\[key\] \|\| ''\)/)
})

test('opportunities scope uses the owner selector without a header checkbox', () => {
  assert.doesNotMatch(tracker, /className="tracker-search-scope"/)
  assert.doesNotMatch(tracker, /type="checkbox"[\s\S]*?checked=\{ownerFilter === 'All'\}/)
  assert.doesNotMatch(tracker, /className="mail-show-all tracker-show-all"[\s\S]*?type="checkbox"/)
  assert.match(myOpps, /className=\{`scope-toggle\$\{showAll \? ' active' : ''\}`\}/)
  assert.match(myOpps, /aria-pressed=\{showAll\}/)
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
  assert.match(tracker, /dateFilteredBase\.filter\(o => matchesFilters\(o\)\)/)
  assert.match(tracker, /toggleSubsetIn\(current\[col\.key\], values, visibleValues\)/)
  assert.match(tracker, /key=\{filterValueKey\(v\)\}/)
  assert.match(tracker, /matchesFilterQuery\(v, query\)/)
  assert.match(tracker, /<button type="button" className="tracker-th-control"/)
  assert.match(styles, /table\.sheet th\.th-filter[\s\S]*font-weight: 700/)
})

test('clicking a column name opens its menu without a separate arrow control', () => {
  assert.match(tracker, /<button type="button" className="tracker-th-control"[\s\S]*onClick=\{e => openColumnMenu\(col, e\)\}/)
  assert.match(tracker, /<span className="tracker-th-label">\{col\.label\}<\/span>/)
  assert.doesNotMatch(tracker, /tracker-th-indicator/)
  assert.match(tracker, /aria-sort=\{sort\?\.key === col\.key/)
})

test('key fields retain a filter menu when their header moves into row labels', () => {
  assert.match(tracker, /aria-label="Sort and filter key opportunity field"/)
  assert.match(tracker, /KEY_COLS\.map\(key =>/)
  assert.match(tracker, /openColumnMenu\(COLS\.find\(col => col\.key === e\.currentTarget\.value\), e\)/)
  assert.match(styles, /\.tracker-secondary-filter \{ display: none; \}/)
  for (const index of [1, 7, 9, 13, 14, 19, 20, 23, 24, 30]) {
    assert.match(tracker, new RegExp(`<span className="tracker-cell-label">\\{COLS\\[${index}\\]\\.label\\}<\\/span>`))
  }
})

test('editable key fields keep accessible names when their headers are hidden', () => {
  assert.match(tracker, /function WrapInput\(\{ value, onChange, title, label \}\)/)
  assert.match(tracker, /<textarea[^>]*aria-label=\{label\}/)
  for (const index of [9, 13, 14, 20, 24, 30]) {
    assert.match(tracker, new RegExp(`aria-label=\\{COLS\\[${index}\\]\\.label\\}`))
  }
})

test('tracker provides dual-layer global and quick filtering with removable chips', () => {
  assert.match(tracker, /matchesGlobalSearch\(o, searchTerm, COLS, cellVal\)/)
  assert.match(tracker, /className="tracker-filter-chips flex flex-wrap items-center gap-1"/)
  assert.match(tracker, /No opportunities match these filters\./)
  assert.match(tracker, /placeholder="Search all opportunities…"/)
})

test('opportunities search is a separate bordered field beside owner scope', () => {
  assert.match(tracker, /className="tracker-owner-filter"[^>]*aria-label="Opportunity owner"/)
  assert.match(tracker, /className="tracker-search" aria-label="Search all opportunities"/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-search-group \.tracker-search \{[\s\S]*?border: 1px solid var\(--border-color\) !important;[\s\S]*?border-radius: 8px !important;/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-search-group \.tracker-search:focus-within \{[\s\S]*?box-shadow: 0 0 0 2px var\(--primary-soft\) !important;/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-toolbar-filters > \.tracker-owner-filter \{[\s\S]*?border: 1px solid var\(--border-color\) !important;/)
})

test('date filter is available inside the Opportunities search surface', () => {
  assert.doesNotMatch(tracker, /className=\{`tracker-date-filter-button\$\{dateFilterActive/)
  assert.match(tracker, /className=\{`tracker-search-filter\$\{dateFilterActive/)
  assert.match(tracker, /<Icon name="filter" size=\{14\} \/> <span>Filter<\/span>/)
  assert.match(tracker, /aria-haspopup="dialog" aria-expanded=\{dateFilterOpen\}/)
  assert.match(styles, /\.opportunities-page > \.tracker-page > \.toolbar \.tracker-search-group \{[\s\S]*?border: 1px solid var\(--border-color\);[\s\S]*?border-radius: 8px;/)
  assert.match(styles, /\.tracker-search-filter-active \{[\s\S]*?text-transform: uppercase;/)
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
  assert.match(tracker, /Custom date filter/)
  assert.match(tracker, /aria-label="Custom filter date field"/)
  assert.match(tracker, /aria-label="Custom filter period"/)
  assert.match(tracker, /OPPORTUNITY_DATE_FIELDS/)
  assert.match(tracker, /OPPORTUNITY_PERIODS/)
  assert.match(tracker, /matchesDateFilter\(o\)/)
})

test('My Opportunities shows the same working columns', () => {
  assert.match(myOpps, /<th>Expected Order Date<\/th><th>Next Action<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Owner<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Updated<\/th>/)
})

test('closed opportunities are labelled My Orders', () => {
  const tracker = read('src/pages/Tracker.jsx')
  assert.match(tracker, /\['Opportunities', 'My Orders'\]/)
  assert.match(tracker, /sheet !== 'My Orders' \|\| \(o\.status === 'Closed' && o\.stage === 'Won'\)/)
  assert.doesNotMatch(tracker, /Old Closed Opps/)
})

test('My Orders contains Won opportunities only', () => {
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(dashboard, /o\.status === 'Closed' && o\.stage === 'Won'/)
  assert.match(dashboard, /My orders \(Won\)/)
})

test('opportunity IDs open the full opportunity workspace', () => {
  assert.match(tracker, /<Link to=\{`\/opp\/\$\{o\.id\}`\} title="Open opportunity workspace">\{displayOpportunityId\(o\.id, store\.config\?\.roleNames\)\}<\/Link>/)
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

test('the derivation is wired into the sheet, the list and the drawer', () => {
  assert.match(tracker, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)/)
  assert.match(myOpps, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)/)
  assert.match(read('src/opppanel.jsx'), /nextActionWith\(opp, store\.getProposal\(oppId\), store\)/)
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

test('expected order and ship dates are flagged when missing', () => {
  assert.match(tracker, /o\.status === 'Open' && !o\.orderDate \? 'need' : ''/)
  assert.match(tracker, /o\.status === 'Open' && !o\.invoiceDate \? 'need' : ''/)
  assert.match(tracker, /Expected order date is required on an open opportunity/)
})

// The rename landed on the tracker only; the drawer, Analytics and the forecast
// dashboard still said Order Date / Invoice Date.
test('no surface still says Order Date or Invoice Date', () => {
  for (const file of [
    'src/pages/Tracker.jsx', 'src/pages/MyOpps.jsx', 'src/opppanel.jsx',
    'src/pages/Analytics.jsx', 'src/pages/Dashboard.jsx',
  ]) {
    const text = read(file)
    const stale = text.match(/(?<!Expected )(Order|Invoice) [Dd]ate/g) || []
    assert.deepEqual(stale, [], `${file} still carries: ${stale.join(', ')}`)
  }
})
