import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const require = createRequire(import.meta.url)
const source = readFileSync('src/ui/WorkspaceDataBoundary.jsx', 'utf8')
  .replace("import { useStore, WorkspacePageStoreProvider } from '../store.jsx'", 'const useStore = () => globalThis.__workspaceBoundaryStore; const WorkspacePageStoreProvider = ({ children }) => children')
  .replace("import { dbEnabled } from '../datastore.js'", 'const dbEnabled = () => true')
const { outputFiles } = buildSync({ stdin: { contents: source, resolveDir: `${process.cwd()}/src/ui`, loader: 'jsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react','react-router-dom'] })
const module = { exports: {} }
new Function('require','module','exports',outputFiles[0].text)(require,module,module.exports)
const render = (path, store, Component = module.exports.default) => {
  globalThis.__workspaceBoundaryStore = { auth: { user: { id: 'A' } }, authReady: true, ...store }
  try { return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, null, React.createElement('form', null, 'Editor')))) }
  finally { delete globalThis.__workspaceBoundaryStore }
}
test('uncached content shows a page loader; fresh and expired cached content paint immediately', () => {
  assert.match(render('/inbox', { peekWorkspaceView: () => null }), /Loading this page/)
  for (const fresh of [true, false]) assert.match(render('/inbox', { peekWorkspaceView: () => ({ fresh, value: {} }) }), /Editor/)
})
test('cached workspace data cannot mount a pricing editor before catalogue dependencies', () => {
  const store = { peekWorkspaceView: () => ({ fresh: true, value: {} }), priceListsLoaded: false }
  const pending = render('/proposal/A', store)
  assert.match(pending, /Loading catalogue/)
  assert.doesNotMatch(pending, /Editor/)
  assert.match(render('/proposal/A', { ...store, priceListsLoaded: true }), /Editor/)
  assert.doesNotMatch(render('/opp/A?step=sourcing', store, module.exports.WorkspaceCatalogueBoundary), /Editor/)
})
test('route boundaries stay inside desktop and phone chrome', () => {
  const app = readFileSync('src/App.jsx','utf8'), phone = readFileSync('src/tablet/TabletApp.jsx','utf8')
  assert.match(app, /<main id="main-content"[^>]*>\s*<WorkspaceDataBoundary>/)
  assert.doesNotMatch(app, /<WorkspaceDataBoundary><LoadedAppShell/)
  assert.match(phone, /<MobileContent[^>]*><WorkspaceDataBoundary>/)
})

test('archived lead deletion does not require an active mailbox row', () => {
  const storeSource = readFileSync('src/store.jsx','utf8')
  const method = storeSource.slice(storeSource.indexOf('    deleteLead(id) {'), storeSource.indexOf('    processLeadDeadlines(', storeSource.indexOf('    deleteLead(id) {')))
  let state = { leads: [], leadArchive: [{ id: 'OLD', subject: 'Archived' }], leadDeadlines: [], deletedLeadIds: [] }
  const dependencies = { stateRef: { current: state }, datastore: { dbEnabled: () => true }, api: { loadLeadDetails: () => { throw new Error('Unnecessary detail load') } }, leadBlobs: { deleteLead() {} }, setState: update => { state = update(state) }, withAudit: value => value }
  const api = new Function(...Object.keys(dependencies), `return {${method}}`)(...Object.values(dependencies))
  assert.equal(api.deleteLead('OLD'), true)
  assert.deepEqual(state.leadArchive, [])
  assert.deepEqual(state.deletedLeadIds, ['OLD'])
})

import { recordBooking } from '../src/orderBookings.js'
test('scoped booking edits validate against global snapshots and save only the loaded opportunity', () => {
  const storeSource = readFileSync('src/store.jsx','utf8')
  const helper = storeSource.slice(storeSource.indexOf('  const bookingContext ='), storeSource.indexOf('  const displayRows ='))
  const method = storeSource.slice(storeSource.indexOf('    confirmOrderBooking('), storeSource.indexOf('    setPOBookingDetails('))
  const other = { id: 'B', owner: 'KK', booking: { id: 'BOOK-B', oppId: 'B', owner: 'KK', customer: 'Customer', po: 'EXISTING', booked: '2020-01-01', valueK: 12 } }
  let state = { role: 'LJS', opportunities: [{ id: 'A', owner: 'PP', sellTo: 'Customer', status: 'Closed', stage: 'Won', importedFrom: 'Excel workbook / Current Opps' }], sales: { orders: [] }, poCompare: {} }
  const stateRef = { current: state }
  const api = new Function('overview','recordBooking','stateRef','setState','withAudit', `${helper}; return {${method}}`)(
    { opportunities: [other] }, recordBooking, stateRef, update => { state = update(state); stateRef.current = state }, value => value)
  const details = { po: 'EXISTING', booked: '2020-01-01', valueK: 5, evidence: 'Signed PO' }
  assert.throws(() => api.confirmOrderBooking('A', details), /already has a booking/)
  api.confirmOrderBooking('A', { ...details, po: 'NEW-PO' })
  assert.deepEqual(state.opportunities.map(row => row.id), ['A'])
  assert.equal(state.opportunities[0].booking.po, 'NEW-PO')
})
