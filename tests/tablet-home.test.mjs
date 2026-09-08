import test from 'node:test'
import assert from 'node:assert/strict'

import { ROLES, seedOpportunities } from '../src/seed.js'
import { buildTabletTiles, TABLET_SECTIONS, tabletRoleGroup } from '../src/tablet/tabletTiles.js'

// A minimal store with the slices counts() reads. The tile registry only needs
// the workload counts, not a full seeded store.
const store = { opportunities: seedOpportunities, approvals: [], leads: [], poCompare: {} }

// The tablet home screen went blank for every role once a tile kept a `show:`
// reference to a local the same commit deleted. Modules are strict mode, so the
// stray free variable threw a ReferenceError while the tile array was being
// built — TabletHome calls this on every render, so the whole shell unmounted.
// The tablet tests that existed only regex-matched the source text and never
// ran it, so nothing caught it. This one runs it.
test('the tablet tile registry builds for every role', () => {
  for (const role of Object.keys(ROLES)) {
    assert.doesNotThrow(() => buildTabletTiles({ ...store, role }),
      `buildTabletTiles must not throw for ${role}`)
  }
})

// Every tile needs the fields TabletHome renders, or a tile turns into a dead
// button with no label and no destination.
test('every tile carries a key, label and route', () => {
  for (const role of Object.keys(ROLES)) {
    const tiles = buildTabletTiles({ ...store, role })
    const keys = tiles.map(t => t.key)
    assert.equal(new Set(keys).size, keys.length, `${role} must not get duplicate tile keys`)
    for (const t of tiles) {
      assert.ok(t.key, `a ${role} tile is missing its key`)
      assert.ok(t.label, `${role} tile ${t.key} is missing its label`)
      assert.match(t.to || '', /^\//, `${role} tile ${t.key} needs a route`)
      assert.ok(t.icon, `${role} tile ${t.key} is missing its icon`)
    }
  }
})

// Price Lists is a read-only reference for every internal persona. Editing
// remains gated inside the page to commercial/admin roles.
test('Price Lists is available to every internal role', () => {
  for (const role of Object.keys(ROLES)) {
    const has = buildTabletTiles({ ...store, role }).some(t => t.key === 'pricelists')
    assert.equal(has, role !== 'CUST', `${role} must ${role === 'CUST' ? 'not ' : ''}see the Price Lists tile`)
  }
})

// TabletHome places tiles by key and drops unknown ones, so a section naming a
// key no tile produces silently renders a short section.
test('every section key matches a tile some role can build', () => {
  const every = new Set(Object.keys(ROLES).flatMap(role =>
    buildTabletTiles({ ...store, role }).map(t => t.key)))
  for (const [group, sections] of Object.entries(TABLET_SECTIONS)) {
    for (const sec of sections) {
      for (const key of sec.keys) {
        assert.ok(every.has(key),
          `${group} section "${sec.title}" names tile "${key}", which no role can build`)
      }
    }
  }
})

// Each role group must resolve to a real layout, or TabletHome silently falls
// back to the sales sections for an admin.
test('each role resolves to a defined section layout', () => {
  for (const role of Object.keys(ROLES)) {
    const group = tabletRoleGroup(role)
    assert.ok(TABLET_SECTIONS[group], `${role} maps to unknown tablet group "${group}"`)
  }
})
