import test from 'node:test'
import assert from 'node:assert/strict'
import { nextCell } from '../src/proposal/sheetNav.js'

test('proposal sheet moves between cells with spreadsheet keys', () => {
  assert.deepEqual(nextCell(1, 1, 'ArrowRight', 4, 6), [1, 2])
  assert.deepEqual(nextCell(1, 1, 'Enter', 4, 6), [2, 1])
  assert.deepEqual(nextCell(0, 0, 'ArrowUp', 4, 6), [0, 0])
  assert.deepEqual(nextCell(3, 5, 'Tab', 4, 6), [3, 5])
  assert.equal(nextCell(1, 1, 'Escape', 4, 6), null)
})
