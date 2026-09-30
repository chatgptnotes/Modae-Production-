import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('approval decision notes keep a quiet focus treatment', () => {
  const approvals = read('src/pages/Approvals.jsx')
  const styles = read('src/styles.css')

  assert.match(approvals, /className="approval-decision-input"/)
  assert.match(approvals, /rows=\{4\}/)
  assert.match(approvals, /aria-label="Decision note \(required\)"/)
  assert.match(approvals, /onInput=\{e => \{[\s\S]*style\.height = 'auto'[\s\S]*scrollHeight/)
  assert.match(styles, /\.approvals-page \.approval-decision-form textarea\.approval-decision-input\s*\{[\s\S]*min-height: 92px;[\s\S]*padding: 9px 10px;[\s\S]*border: 1px solid var\(--border-default\) !important;[\s\S]*border-radius: 5px;[\s\S]*resize: vertical;[\s\S]*line-height: 1\.45;/)
  assert.match(styles, /\.approvals-page \.approval-decision-form textarea\.approval-decision-input:focus,[\s\S]*?border: 1px solid var\(--action-accent\) !important;[\s\S]*outline: 0;[\s\S]*box-shadow: none;/)
})

test('text controls do not create a full focus rectangle, while buttons keep focus rings', () => {
  const styles = read('src/styles.css')

  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\)\s*\{[\s\S]*font-size: 14px;[\s\S]*line-height: 1\.45;/)
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\)::placeholder\s*\{[\s\S]*font-size: inherit;/)
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\):focus-visible[\s\S]*outline: 0;/)
  assert.match(styles, /\.shell :where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\):focus-visible[\s\S]*border-bottom-color: var\(--action-accent\)/)
  assert.match(styles, /button:focus-visible, \.btn:focus-visible \{[\s\S]*outline: 2px solid var\(--primary-accent\)/)
})

test('approval filter bar keeps a stable component identity while typing', () => {
  const approvals = read('src/pages/Approvals.jsx')
  const approvalsStart = approvals.indexOf('export default function Approvals()')
  const filterBarStart = approvals.indexOf('function FilterBar(')

  assert.ok(filterBarStart >= 0, 'FilterBar should be a module-scoped component')
  assert.ok(filterBarStart < approvalsStart, 'FilterBar must be declared before Approvals')
  assert.doesNotMatch(approvals.slice(approvalsStart), /const FilterBar\s*=\s*\(\)\s*=>/)
  assert.match(approvals, /function FilterBar\([\s\S]*q[\s\S]*statusF[\s\S]*typeF[\s\S]*onQueryChange/)
  assert.match(approvals, /const filterBarProps = \{[\s\S]*onQueryChange: e => setQ\(e\.target\.value\)/)
  assert.match(approvals, /<FilterBar \{\.\.\.filterBarProps\} \/>/)
})
