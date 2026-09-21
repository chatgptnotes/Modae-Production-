import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const ui = read('src/ui.jsx')
const styles = read('src/styles.css')
const sourceFiles = [
  'src/App.jsx', 'src/drawer.jsx', 'src/install.jsx', 'src/pages/Folders.jsx',
  'src/pages/Home.jsx', 'src/pages/Inbox.jsx', 'src/pages/Proposal.jsx',
  'src/pages/Users.jsx', 'src/workbench/WbSpares.jsx',
]

test('shared modal contract includes accessible labelling and keyboard containment', () => {
  assert.match(ui, /role="dialog" aria-modal="true" aria-labelledby=\{title \? titleId : undefined\}/)
  assert.match(ui, /event\.key === 'Escape'/)
  assert.match(ui, /event\.key !== 'Tab'/)
  assert.match(ui, /restoreRef\.current\?\.focus/)
  assert.match(ui, /className="modal-close"/)
  assert.match(styles, /\.modal-header \.section-title/)
  assert.match(styles, /\.modal-close:focus-visible/)
})

test('destructive and input flows use shared in-app dialogs', () => {
  assert.match(ui, /export function ConfirmModal/)
  assert.match(ui, /export function PromptModal/)
  for (const file of sourceFiles) {
    const source = read(file)
    assert.doesNotMatch(source, /window\.confirm\s*\(/, `${file} still uses native confirm()`)
    assert.doesNotMatch(source, /\bprompt\s*\(/, `${file} still uses native prompt()`)
  }
})

test('custom popup surfaces expose dialog or popup semantics', () => {
  assert.match(read('src/drawer.jsx'), /role=\{sel \? 'dialog' : undefined\}/)
  assert.match(read('src/App.jsx'), /id="notification-popover" className="notification-popover" role="dialog"/)
  assert.match(read('src/pages/Tracker.jsx'), /role="dialog" aria-label=\{`\$\{col\.label\} sort and filter`\}/)
  assert.match(read('src/OpportunityDetailsEditor.jsx'), /role="listbox" aria-label="Solutions"/)
})
