import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
const tracker = fs.readFileSync(path.join(root, 'src/pages/Tracker.jsx'), 'utf8')

test('Opportunities uses the available canvas instead of reserving outer white space', () => {
  const stylesheet = postcss.parse(css)
  let outer
  let inner
  let title
  let toolbar
  let sheet
  stylesheet.walkRules(rule => {
    if (rule.selector === '.main-scroll > .page.opportunities-page') outer = rule
    if (rule.selector === '.opportunities-page > .page.tracker-page') inner = rule
    if (rule.selector === '.opportunities-page > .tracker-page > h2') title = rule
    if (rule.selector === '.opportunities-page > .tracker-page > .toolbar') toolbar = rule
    if (rule.selector === '.opportunities-page > .tracker-page > .sheet-wrap.fill') sheet = rule
  })
  const value = (rule, property) => rule.nodes.find(node => node.prop === property)?.value
  assert.ok(outer, 'the actual outer Opportunities wrapper must lose shared page padding')
  assert.ok(inner, 'the nested tracker must lose its own page padding')
  assert.equal(value(outer, 'padding'), '0')
  assert.equal(value(inner, 'padding'), '0')
  assert.equal(value(title, 'padding-inline'), '12px')
  assert.equal(value(toolbar, 'padding-inline'), '0')
  assert.equal(value(sheet, 'border'), '0')
  assert.equal(value(sheet, 'box-shadow'), 'none')
})

test('main workspace pages share one title size and top spacing', () => {
  assert.match(css, /\.workspace-page-title\s*\{[^}]*font-size: clamp\(26px, 2vw, 32px\) !important;[^}]*font-weight: 800 !important;[^}]*line-height: 1\.1 !important;/)
  assert.match(css, /\.workspace-page-title\s*\{[^}]*display: flex;[^}]*align-items: center;[^}]*gap: 8px;/)
  assert.match(css, /\.workspace-page-title > \.ic\s*\{[^}]*width: 18px;[^}]*height: 18px;/)
  assert.match(css, /\.opportunities-page > \.tracker-page > \.workspace-page-title\s*\{\s*margin-top: 24px !important;/)
  assert.match(css, /\.dashboard-page \.home-head\s*\{\s*margin-top: 0 !important;/)
  assert.match(css, /\.mailbox-page\s*\{\s*padding-top: 24px !important;/)
})

test('main page titles use the same icons as their sidebar destinations', () => {
  const titleIcons = {
    MyDashboard: 'chartBar', Inbox: 'inbox', Tracker: 'cards', Approvals: 'checkCircle',
    ProposalSent: 'send', Folders: 'folder', Customers: 'users', PriceLists: 'tag',
    Admin: 'gear', Audit: 'list', Users: 'shield',
  }
  for (const [page, icon] of Object.entries(titleIcons)) {
    const source = fs.readFileSync(path.join(root, 'src/pages', page === 'MyDashboard' ? 'myDashboard/WorkspaceDashboard.jsx' : `${page}.jsx`), 'utf8')
    assert.match(source, new RegExp(`className="workspace-page-title"><Icon name="${icon}" size=\\{18\\}`), `${page} title should use sidebar icon ${icon}`)
  }
})

test('primary workspace pages share a responsive inset from the sidebar', () => {
  assert.match(css, /--workspace-page-gutter: clamp\(14px, 1\.5vw, 24px\);/)
  assert.match(css, /\.main-scroll > \.page:has\(\.workspace-page-title\)\s*\{[^}]*width: 100%;[^}]*max-width: none;[^}]*padding-inline: var\(--workspace-page-gutter\);/)
  assert.match(css, /\.opportunities-page > \.tracker-page > \.workspace-page-title\s*\{\s*padding-inline: 0;/)
  assert.match(css, /\.opportunities-page > \.tracker-page > \.sheet-wrap\.fill\s*\{[^}]*border-inline-width: 0;/)
})

test('key view fills the available page width while the full sheet scrolls locally', () => {
  const stylesheet = postcss.parse(css)
  const keyRules = []
  stylesheet.walkRules('.tracker-page table.sheet.cols-key', rule => keyRules.push(rule))
  const effective = property => keyRules.flatMap(rule => rule.nodes.filter(node => node.prop === property)).at(-1)?.value
  assert.equal(effective('width'), '100%')
  assert.equal(effective('min-width'), '0')
  assert.match(css, /\.tracker-page > \.sheet-wrap:has\(table\.sheet:not\(\.cols-key\)\)[\s\S]*?overflow-x: auto;/)
  assert.doesNotMatch(css, /--tracker-key-min-width/)
})

test('key view keeps the same table and one header row at compact widths', () => {
  const stylesheet = postcss.parse(css)
  stylesheet.walkAtRules('container', atRule => {
    if (!atRule.params.startsWith('workspace')) return
    atRule.walkRules(rule => {
      if (!rule.selector.includes('table.sheet.cols-key')) return
      assert.doesNotMatch(rule.selector, /thead tr > :nth-child/)
      assert.doesNotMatch(rule.toString(), /display: (?:grid|block|none)|grid-template-columns|grid-area/)
    })
  })
  assert.match(css, /\.opportunities-page \.tracker-page > \.toolbar \{\s*grid-template-columns: minmax\(0, 1fr\);/)
})

test('shared layout rules allow content to shrink and wrap', () => {
  assert.match(css, /:where\(\.page, \.main-col, \.shell, \.card, \.panel, \[role='dialog'\]\)[\s\S]*?min-width: 0/)
  assert.match(css, /body \{[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(css, /:where\(h1, h2, h3, h4, h5, h6\)[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(css, /:where\(p, li, dd\)[\s\S]*?overflow-wrap: anywhere;/)
})

test('wide table containers scroll locally instead of widening the page', () => {
  assert.match(css, /\.sheet-wrap, \.table-wrap, \.table-scroll, \.dashboard-table-scroll, \[class\$='-table-wrap'\]/)
  assert.match(css, /overscroll-behavior-x: contain/)
  assert.match(css, /sourcing-sheet-wrap[\s\S]*?overflow-x: auto/)
  assert.match(css, /dashboard-table-scroll/)
})

test('controls and media cannot exceed their containing layout', () => {
  assert.match(css, /:where\(img, svg, video, canvas, iframe\)[\s\S]*?max-width: 100%/)
  assert.match(css, /:where\(button, input, select, textarea\)[\s\S]*?max-width: 100%/)
  assert.match(css, /box-sizing: border-box/)
})

test('text fields use simple focus styling without decorative glow', () => {
  assert.match(css, /:where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\):focus[\s\S]*?box-shadow: none !important/)
  assert.match(css, /:where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\):not\(\.error\):not\(\.needs-input\):not\(\[aria-invalid='true'\]\):focus/)
})

test('tracker headers and key-view values are not forcibly clamped', () => {
  assert.match(css, /\.tracker-page \.tracker-th-label[\s\S]*?overflow-wrap: anywhere[\s\S]*?overflow: visible/)
  assert.match(css, /\.tracker-page table\.sheet\.cols-key th\.th-filter \{ height: auto; min-height: 46px; \}/)
  assert.match(css, /\.tracker-page table\.sheet\.cols-key td input,[\s\S]*?text-overflow: clip/)
})

test('tracker layout keeps toolbar and tabs bounded while only the full sheet scrolls locally', () => {
  assert.match(css, /\.tracker-page \{[\s\S]*?width: 100%;[\s\S]*?max-width: none;[\s\S]*?min-width: 0;/)
  assert.match(css, /\.opportunities-page \.tracker-grid-shell\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?min-height:\s*0;/)
  assert.match(css, /\.tracker-page \.tracker-toolbar-actions \{[\s\S]*?flex-wrap: wrap;/)
  assert.match(css, /\.tracker-page > \.sheet-wrap\.fill \{[\s\S]*?max-width: 100%;[\s\S]*?overscroll-behavior-x: contain;/)
  assert.match(css, /\.opportunities-page \.tracker-grid-shell > \.sheet-wrap\.fill\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/)
  assert.match(css, /\.tracker-page table\.sheet\.cols-key \{\s*width: 100%;\s*max-width: 100%;\s*min-width: 0;/)
  assert.match(css, /\.tracker-page > \.sheet-tabs \{[\s\S]*?overflow-x: auto;/)
})

test('key-view headers wrap at words instead of colliding at zoom', () => {
  assert.match(css, /\.tracker-page \.sheet\.cols-key \.tracker-th-label \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: break-word;/)
})

test('desktop tracker filters stay aligned in one toolbar row', () => {
  assert.match(css, /\.tracker-page \.tracker-toolbar-filters \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(145px, auto\) minmax\(220px, 1fr\) minmax\(135px, auto\) auto auto;/)
  assert.match(css, /@media \(max-width: 72em\) \{[\s\S]*?\.tracker-page \.tracker-toolbar-filters \{[\s\S]*?display: flex;/)
  assert.match(css, /\.tracker-page \.tracker-quick-filter \{[\s\S]*?min-width: 135px;[\s\S]*?white-space: nowrap;/)
})

test('browser zoom gets a stacked tracker layout before desktop controls collide', () => {
  assert.match(css, /@media \(max-width: 900px\), \(max-width: 80em\) \{/) 
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 80em\) \{[\s\S]*?\.tracker-page > \.toolbar \{[\s\S]*?grid-template-columns: 1fr;/)
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 80em\) \{[\s\S]*?--sidenav-w: 216px;[\s\S]*?--shell-nav-w: 216px;/)
  assert.match(css, /\.tracker-page > \.sheet-wrap:has\(table\.sheet:not\(\.cols-key\)\)[\s\S]*?overflow-x: auto;/)
  assert.match(css, /\.tracker-page table\.sheet:not\(\.cols-key\) thead \{ display: table-header-group; \}/)
})

test('narrow Opportunities retains the table and full-view horizontal scrolling', () => {
  assert.doesNotMatch(css, /\.tracker-page \.sheet-wrap \{\s*overflow-x: hidden;/)
  assert.doesNotMatch(css, /\.tracker-page table\.sheet thead \{ display: none; \}/)
  assert.match(css, /\.tracker-page > \.sheet-wrap\.fill \{[\s\S]*?overflow-x: auto;/)
})

test('full Opportunities headers wrap at natural word boundaries', () => {
  assert.match(css, /\.tracker-page \.sheet:not\(\.cols-key\) th,[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
  assert.match(css, /\.tracker-page \.sheet:not\(\.cols-key\) \.tracker-th-label \{[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/)
})

test('workspace-width container queries reflow controls at browser zoom', () => {
  assert.match(css, /\.main-scroll \{[\s\S]*?container-name: workspace;[\s\S]*?container-type: inline-size;/)
  assert.match(css, /@container workspace \(max-width: 70rem\) \{[\s\S]*?\.tracker-page > \.toolbar \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(css, /\.tracker-page \.tracker-date-filter-button,[\s\S]*?\.tracker-page \.scope-toggle \{[\s\S]*?white-space: nowrap;/)
  assert.match(css, /@container workspace \(max-width: 44rem\) \{[\s\S]*?\.tracker-page \.tracker-toolbar-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(css, /@container workspace \(max-width: 70rem\) \{[\s\S]*?\.tracker-page > \.sheet-wrap:has\(table\.sheet:not\(\.cols-key\)\)[\s\S]*?overflow-x: auto;/)
})

test('Opportunities density scales the table before browser zoom causes clipping', () => {
  assert.match(css, /\.opportunities-page \.tracker-grid-shell\s*\{[\s\S]*--opp-density:\s*1;/)
  assert.match(tracker, /--tracker-column-min:\s*\$\{px\(c\)\}px; min-width: max\(56px, calc\(var\(--tracker-column-min\) \* var\(--opp-density, 1\)\)\)/)
  assert.match(css, /\.opportunities-page \.tracker-grid-shell > \.sheet-wrap\.fill table\.sheet:not\(\.cols-key\) th,[\s\S]*?min-width: max\(56px, calc\(var\(--tracker-column-min, 78px\) \* var\(--opp-density\)\)\) !important;/)
  assert.match(css, /@container workspace \(max-width: 90rem\) \{[\s\S]*?\.opportunities-page \.tracker-grid-shell \{ --opp-density: \.92; \}/)
  assert.match(css, /@container workspace \(max-width: 60rem\) \{[\s\S]*?\.opportunities-page \.tracker-grid-shell \{ --opp-density: \.76; \}/)
})
