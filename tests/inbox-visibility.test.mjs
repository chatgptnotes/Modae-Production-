// A simulated lead reads as "it did not save" when the inbox quietly drops it.
// The generator routes ownership by the L-05-AI region rules, not to whoever
// clicked, so roughly two in three land with another sales owner — and the
// inbox list hides leads that are not yours. "Show all" compensated, but it was
// component state, so any reload (including the list's own Refresh button) put
// the filter back and the lead vanished again.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { simulatedLead, SIMULATED_CUSTOMER_SCENARIOS } from '../src/simulatedLeads.js'
import { seedState, migrate, syncedOf } from '../src/appState.js'
import { LOCAL_ONLY } from '../src/datastore.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const inbox = read('src/pages/Inbox.jsx')
const WHEN = '2026-08-19T00:00:00.000Z'

// The premise: this is a visibility bug, not a persistence bug. If the lead
// ever stops surviving the boot path, the diagnosis below is wrong.
test('a simulated lead survives the reload that made it look lost', () => {
  const s = seedState()
  const lead = simulatedLead('Green', WHEN, { existingLeads: s.leads, config: s.config })
  const saved = { ...s, leads: [lead, ...s.leads] }
  const booted = migrate(JSON.parse(JSON.stringify(saved)))
  assert.ok(booted.leads.some(l => l.id === lead.id), 'the lead must still be there after a reload')
  assert.equal(booted.leads.length, s.leads.length + 1)
})

test('the generator routes leads away from the person who clicked', () => {
  // Not a defect — it is what the simulator demonstrates. It is also why the
  // list must never hide a row without saying so.
  const s = seedState()
  let leads = s.leads
  const owners = new Set()
  for (let i = 0; i < 24; i++) {
    const scenario = SIMULATED_CUSTOMER_SCENARIOS[i % SIMULATED_CUSTOMER_SCENARIOS.length]
    const lead = simulatedLead(scenario.status, WHEN, { existingLeads: leads, config: s.config })
    owners.add(lead.suggestedOwner)
    leads = [lead, ...leads]
  }
  assert.ok(owners.size > 1, 'ownership must vary, or the visibility rule below is untested')
})

test('"Show all" is stored state, not component state', () => {
  const s = seedState()
  assert.equal(s.inboxShowAll, false, 'it must default to the owner-filtered list')
  const booted = migrate(JSON.parse(JSON.stringify({ ...s, inboxShowAll: true })))
  assert.equal(booted.inboxShowAll, true, 'a reload must not put the filter back')
  // Which browser a salesperson happens to be sitting at is not team state.
  assert.ok(LOCAL_ONLY.includes('inboxShowAll'))
  assert.ok(!('inboxShowAll' in syncedOf(booted)), 'it must never sync to the server')
})

test('the inbox scope comes from the shared top-bar switch', () => {
  assert.match(inbox, /const \{ scope, setScope \} = useWorkspaceView\(\)/)
  assert.match(inbox, /const globalScope = scope === 'global'/)
  assert.match(inbox, /const ownerVisible = l => globalScope \|\| l\.assignedOwner === store\.role \|\| l\.suggestedOwner === store\.role/)
  assert.doesNotMatch(inbox, /useState\(false\)\s*\/\/.*showAll/i)
  assert.doesNotMatch(inbox, /const \[showAll, setShowAll\] = useState/,
    'scope selection belongs to the shared top bar')
})

test('the inbox does not show a redundant all-leads label for unrestricted roles', () => {
  assert.doesNotMatch(inbox, /className="mail-show-all mail-show-all-static"/)
  assert.doesNotMatch(inbox, /All leads visible/)
  assert.doesNotMatch(inbox, /Your role already has access to every lead/)
})

test('the inbox does not duplicate the top-bar scope control', () => {
  assert.doesNotMatch(inbox, /className=\{`scope-toggle\$\{showAll/)
  assert.match(inbox, /Choose Global View in the top bar/)
  assert.doesNotMatch(inbox, /<label className="mail-show-all"><input type="checkbox"/)
})

test('an empty date-filtered inbox offers a direct recovery action', () => {
  assert.match(inbox, /const dateFilterActive = !!receivedF \|\| !!ageF/)
  assert.match(inbox, /Clear date filter/)
  assert.match(inbox, /setReceivedF\(''\); setAgeF\(''\)/)
})

test('inbox rows are ordered by newest received enquiry first', () => {
  assert.match(inbox, /const inboxReceivedAt = lead => lead\?\.ts \|\| lead\?\.receivedAt/)
  assert.match(inbox, /const compareInboxRows = \(a, b\) =>/)
  assert.match(inbox, /const mailboxRows = rows\.sort\(compareInboxRows\)/)
})

test('the owner rule reports what it is holding back', () => {
  // Split out of the column filters so the count is answerable at all.
  assert.match(inbox, /const ownerVisible = l =>/)
  assert.match(inbox, /const hiddenByOwner = listSource\.filter\(l => !ownerVisible\(l\)/)
  // Both the populated list and the empty state have to say it — the empty
  // state is where "nothing saved" was actually concluded.
  assert.match(inbox, /hiddenByOwner > 0 \?/)
  assert.match(inbox, /none assigned to you/)
  assert.match(read('src/styles.css'), /^\.mail-hidden-note \{/m)
})

test('the simulator modal asks for project type before opportunity type', () => {
  assert.match(inbox, /Choose the project type first, then the opportunity type\./)
  assert.match(inbox, /Project type/)
  assert.match(inbox, /Opportunity type/)
  assert.match(inbox, /oppTypesForProjectType\(simProjectType\)/)
  assert.doesNotMatch(inbox, /Generate missing-info lead/)
})

test('converted leads stay in the unified inbox and retain their linked opportunity marker', () => {
  assert.doesNotMatch(inbox, /mailTab|mailTabItems|DetailTabs ariaLabel="Mailbox views"/)
  assert.match(inbox, /className="mail-opportunity-link"/)
  assert.match(inbox, /nav\('\/opp\/' \+ l\.oppId\)/)
  assert.match(inbox, /<span className="pill Green">Opportunity<\/span>/)
})

test('every missing-information row offers a manual add action', () => {
  assert.match(inbox, /fillFor\?\.item !== m[\s\S]{0,300}setFillFor\(\{ item: m, val: '' \}\)/)
  assert.doesNotMatch(inbox, /addMissing\(m, 'Confirmed for simulation', m\)/)
  assert.doesNotMatch(inbox, /fillFor\?\.item !== m[\s\S]{0,500}Simulate/)
})
