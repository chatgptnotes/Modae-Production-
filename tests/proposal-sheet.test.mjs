import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nextCell } from '../src/proposal/sheetNav.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('proposal sheet moves between cells with spreadsheet keys', () => {
  assert.deepEqual(nextCell(1, 1, 'ArrowRight', 4, 6), [1, 2])
  assert.deepEqual(nextCell(1, 1, 'Enter', 4, 6), [2, 1])
  assert.deepEqual(nextCell(0, 0, 'ArrowUp', 4, 6), [0, 0])
  assert.deepEqual(nextCell(3, 5, 'Tab', 4, 6), [3, 5])
  assert.equal(nextCell(1, 1, 'Escape', 4, 6), null)
})

test('BOQ descriptions use a wrapped two-line editor', () => {
  const source = read('src/proposal/ProposalSheetEditor.jsx')
  const css = read('src/styles.css')
  assert.match(source, /<textarea rows=\{2\} className="proposal-description-editor"/)
  assert.match(css, /\.proposal-edit-grid \.proposal-description-editor[\s\S]*height: 42px/)
  assert.match(css, /\.proposal-edit-grid \.proposal-description-editor[\s\S]*overflow-wrap: anywhere/)
})

test('proposal BOQ editing has no extraction or part-picker controls', () => {
  const proposal = read('src/pages/Proposal.jsx')
  const editor = read('src/proposal/ProposalSheetEditor.jsx')
  assert.doesNotMatch(proposal, /Extract BOQ from buyer PDF/)
  assert.doesNotMatch(editor, /Extract BOQ from buyer PDF/)
  assert.doesNotMatch(editor, /PartPicker|Search part number or description/)
})
