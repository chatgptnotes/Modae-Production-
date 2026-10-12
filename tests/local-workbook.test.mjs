import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { seedState, stateFromSaved } from '../src/appState.js'

test('ordinary local boot does not load or reset a hardcoded customer workbook', () => {
  const source = fs.readFileSync(new URL('../src/appState.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /localWorkbookImport|applyLocalWorkbook/)
  const previous = { ...seedState(), demoData: false, opportunities: [{ id: 'edited', sellTo: 'Saved customer', oppName: 'My edit' }], customers: [{ name: 'Saved customer', status: 'Red' }] }
  const restored = stateFromSaved(JSON.stringify(previous))
  assert.equal(restored.opportunities[0].oppName, 'My edit')
  assert.equal(restored.customers[0].name, 'Saved customer')
  assert.equal(restored.customers[0].status, 'Red')
})
