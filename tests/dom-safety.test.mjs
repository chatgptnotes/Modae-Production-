import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('shared modal focus only acts on connected nodes', () => {
  const ui = read('src/ui.jsx')
  assert.match(ui, /const isConnectedNode = node => !!node\?\.isConnected/)
  assert.match(ui, /if \(!isConnectedNode\(node\) \|\| typeof node\.focus !== 'function'\) return false/)
  assert.match(ui, /\[\.\.\.dialog\.querySelectorAll\(FOCUSABLE\)\]\.filter\(isConnectedNode\)/)
  assert.match(ui, /focusConnectedNode\(restoreRef\.current\)/)
})

test('delayed workspace focus and scrolling guards detached targets', () => {
  const priceLists = read('src/pages/PriceLists.jsx')
  const workbench = read('src/pages/Workbench.jsx')
  const docEditor = read('src/proposal/DocEditor.jsx')
  const details = read('src/OpportunityDetailsEditor.jsx')
  const spares = read('src/workbench/WbSpares.jsx')

  assert.match(priceLists, /if \(row\?\.isConnected\) row\.scrollIntoView/)
  assert.match(workbench, /if \(target\?\.isConnected\) target\.scrollIntoView/)
  assert.match(docEditor, /if \(target\?\.isConnected\) target\.scrollIntoView/)
  assert.match(details, /if \(!target\?\.isConnected\) return/)
  assert.match(spares, /const editor = event\.currentTarget/)
  assert.match(spares, /if \(input\?\.isConnected\) input\.focus\(\)/)
})

test('async attachment rendering stops before touching a detached canvas', () => {
  const viewer = read('src/AttachmentViewer.jsx')
  assert.match(viewer, /if \(!doc \|\| !canvas\?\.isConnected \|\| !canvas\.parentElement\?\.isConnected\) return/)
  assert.match(viewer, /if \(dead \|\| !canvas\.isConnected \|\| !canvas\.parentElement\?\.isConnected\) return/)
})

test('file-input refs are optional before triggering native pickers', () => {
  for (const file of ['src/pages/Inbox.jsx', 'src/pages/TenderIntake.jsx', 'src/pages/Folders.jsx']) {
    const source = read(file)
    assert.doesNotMatch(source, /(?:fileInput|docInput|responseInput)\.current\.click\(\)/, `${file} has an unguarded file-input click`)
  }
  const inbox = read('src/pages/Inbox.jsx')
  assert.match(inbox, /fileInput\.current\?\.click\(\)/)
  assert.match(inbox, /docInput\.current\?\.click\(\)/)
  assert.match(inbox, /responseInput\.current\?\.click\(\)/)
  assert.match(read('src/pages/TenderIntake.jsx'), /fileInput\.current\?\.click\(\)/)
  assert.match(read('src/pages/Folders.jsx'), /fileInput\.current\?\.click\(\)/)
})

test('empty Supabase hydration still preserves populated local slices', () => {
  const store = read('src/store.jsx')
  assert.match(store, /if \(unexpectedEmptyBusinessSlice\(k, s\[k\], v\)\)/)
  assert.match(store, /console\.debug\(`Ignoring empty \$\{k\} hydration response because this browser has populated data/)
  assert.doesNotMatch(store, /console\.warn\(`Ignoring empty \$\{k\} hydration response/)
  assert.match(store, /if \(res\.empty\) \{[\s\S]*local data was preserved and no automatic seed was written/)
})
