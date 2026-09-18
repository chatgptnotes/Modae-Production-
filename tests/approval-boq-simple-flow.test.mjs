import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('approval decisions expose only approve and reject', () => {
  const approvals = read('src/pages/Approvals.jsx')
  const store = read('src/store.jsx')
  assert.match(approvals, /const DECISIONS = \['Approved', 'Rejected'\]/)
  assert.doesNotMatch(approvals, /DECISIONS = \[[^\]]*Approved with conditions/)
  assert.doesNotMatch(approvals, /DECISIONS = \[[^\]]*Returned/)
  assert.doesNotMatch(approvals, /Conditions awaiting incorporation/)
  assert.match(approvals, /approval\.comment-review/)
  assert.match(approvals, /This comment appears to contain a condition/)
  assert.match(approvals, /RejectionRequirements/)
  assert.match(store, /if \(!\['Approved', 'Rejected'\]\.includes\(d\)\) return s/)
  assert.match(store, /rejectionActions/)
  assert.match(store, /previousRejection/)
  assert.doesNotMatch(store, /const anyReturned = Object\.values\(decisions\)/)
})

test('BOQ sourcing uses clear labels, preview links, and removal confirmation', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const approvals = read('src/pages/Approvals.jsx')
  const styles = read('src/styles.css')
  assert.match(spares, /Bill of Quantities \(BOQ\)/)
  assert.match(spares, /<th>Price source<\/th><th>Quantity<\/th>/)
  assert.match(spares, /Open BOQ preview/)
  assert.match(spares, /window\.confirm\(`Remove \$\{sourcingDescription\(line\)\} from this BOQ\?`\)/)
  assert.match(spares, /Next: Proposal<\/button>/)
  assert.match(approvals, /className="approval-boq-link"/)
  assert.match(approvals, /<th scope="col" className="num">Quantity<\/th>/)
  assert.match(approvals, /<th scope="col" className="num">Unit price/)
  assert.match(approvals, /<th scope="col">Price source<\/th>/)
  assert.match(styles, /\.approval-boq-modal \{[\s\S]*top: 50%/)
  assert.match(styles, /\.approval-boq-modal \{[\s\S]*transform: translate\(-50%, -50%\)/)
  assert.match(styles, /\.approval-boq-modal \{[\s\S]*max-height: calc\(100dvh - 48px\)/)
  assert.match(styles, /\.approval-boq-modal > \.section-title \{[\s\S]*position: sticky/)
  assert.match(styles, /\.approval-boq-table td:nth-child\(6\), \.approval-boq-table th:nth-child\(6\)/)
})
