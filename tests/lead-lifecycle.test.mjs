import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const inbox = read('src/pages/Inbox.jsx')
const store = read('src/store.jsx')

// Biji, 13 Aug: "there has to be a place for me to write the reason why you're
// trying to disqualify." The reason was a pre-selected dropdown, so Confirm
// always succeeded and "Other" offered no text box at all.
test('disqualifying requires a written reason', () => {
  assert.match(inbox, /function ReasonBox\(/, 'one shared reason capture')
  assert.match(inbox, /const ready = note\.trim\(\)\.length > 0/)
  assert.match(inbox, /disabled=\{!ready\}/, 'confirm must be blocked without a reason')
  // The old inline confirm wrote the bare category with no note.
  assert.doesNotMatch(inbox, /droppedReason: dropReason \}/,
    'the category alone must not be the whole reason')
  assert.match(inbox, /droppedReason: `\$\{category\} — \$\{note\}`/)
})

test('both lead panels use the same reason capture', () => {
  const uses = inbox.match(/<ReasonBox/g) || []
  assert.ok(uses.length >= 4, `expected disqualify + revert in both panels, found ${uses.length}`)
  // And neither keeps its own private copy of the rule.
  assert.doesNotMatch(inbox, /const \[dropReason, setDropReason\]/,
    'panels must not hold their own reason state')
})

// "By mistake I qualify — I should take it back to the lead list… then I can
// again qualify, disqualify or reassign." The old button was gated on
// !lead.oppId, so it vanished exactly when it was needed. Revert only makes
// sense once there is an opportunity to undo, though, so it now shows for
// Converted leads only — not merely Qualified ones with no opportunity yet.
test('revert only appears once an opportunity actually exists', () => {
  assert.doesNotMatch(inbox, /lead\.status === 'Qualified' && !lead\.oppId/,
    'revert must not be hidden by a stale !oppId check')
  assert.doesNotMatch(inbox, /\(lead\.status === 'Qualified' \|\| lead\.status === 'Converted'\)/,
    'revert must not show for a merely Qualified lead with no opportunity yet')
  assert.match(inbox, /lead\.status === 'Converted' && !reverting/)
  assert.match(inbox, /store\.revertLead\(lead\.id, note\)/)
})

test('revert removes the opportunity it created and reopens the lead', () => {
  assert.match(store, /revertLead\(id, reason = ''\) \{/)
  assert.match(store, /if \(lead\?\.oppId\) api\.deleteOpportunity\(lead\.oppId\)/,
    'the orphaned opportunity must be removed, not left behind')
  assert.match(store, /status: 'New', oppId: null, droppedReason: ''/,
    'the lead must return to a re-qualifiable state')
  assert.match(store, /'Lead reverted to inbox'/, 'the revert must be audited')
})

// Two spellings of the same reason made drop-reason reporting meaningless.
test('marking a duplicate uses the canonical reason', () => {
  assert.doesNotMatch(inbox, /droppedReason: 'Duplicate' \}/)
  assert.match(inbox, /droppedReason: `\$\{DROP_REASONS\[2\]\}/)
})

test('qualify, disqualify and reassign are all offered on the lead itself', () => {
  assert.match(inbox, /Qualify lead|Qualify → intake form/)
  assert.match(inbox, /Disqualify/)
  assert.match(inbox, /onClick=\{reassign\}/)
})

test('lead field edits are persisted and audited with the current role', () => {
  assert.match(store, /updateLead\(id, patch, detail = ''\)/)
  assert.match(store, /withAudit\(next, patch\.status \? `Lead \$\{patch\.status\.toLowerCase\(\)\}` : 'Lead updated'/)
  assert.match(inbox, /AI field "\$\{field\?\.k \|\| 'unknown'\}" updated/)
})

test('lead decisions collect the identity fields required for registration', () => {
  for (const field of ['sellTo', 'eucName', 'eucLocation', 'contactPerson', 'contactPhone']) {
    assert.match(inbox, new RegExp(`decisionDraft\\.${field}`), `${field} must be editable in Lead decisions`)
  }
  assert.match(inbox, /REQUIRED_IDENTITY_FIELDS/)
  assert.match(inbox, /Complete the mandatory fields before saving/)
  assert.match(inbox, /registrationBlocked = missingIdentity\.length > 0/)
})

test('lead decision drafts autosave without audit spam and explicit save remains audited', () => {
  assert.match(inbox, /store\.updateLeadDraft\(lead\.id, patch\)/)
  assert.match(inbox, /setTimeout\(\(\) => \{[\s\S]*persistDecisionDraft\(decisionDraftRef\.current\)/)
  assert.match(inbox, /persistDecisionDraft\(decisionDraft, \{ audit: true \}\)/)
  assert.match(inbox, /Unsaved changes/)
  assert.match(inbox, /Saved just now/)
})
