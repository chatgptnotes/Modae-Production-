import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('post-registration opportunity details are rendered read-only and guarded in the store', () => {
  const editor = read('src/OpportunityDetailsEditor.jsx')
  const workbench = read('src/pages/Workbench.jsx')
  const store = read('src/store.jsx')
  assert.match(editor, /editable = true/)
  assert.match(editor, /if \(!editable\) return <OpportunityDetailsView/)
  assert.match(workbench, /\['Intake', 'Registration'\]\.includes\(opp\.milestone\)/)
  assert.match(store, /Registration facts are editable only while the opportunity is being/)
  assert.match(store, /captured\. Later stages, including Approval/)
  assert.match(store, /detailFields = new Set/)
})

test('active vendor/manufacturer sourcing actions are removed while history remains available', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const workbench = read('src/pages/Workbench.jsx')
  assert.doesNotMatch(spares, /apply a current manufacturer quote/i)
  assert.doesNotMatch(spares, /store\.vendorQuotes/)
  assert.doesNotMatch(workbench, /<option>Manufacturer \/ Supplier<\/option>/)
  assert.match(workbench, /vendor-rfq.*Manufacturer RFQ/)
})

test('uploaded proposal review has a stored file and no longer presents the old AI-draft instruction', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.doesNotMatch(proposal, /Review the AI draft before approval/)
  assert.match(proposal, /Uploaded proposal/)
  assert.match(proposal, /Open uploaded file/)
  assert.doesNotMatch(proposal, /Upload reviewed workbook/)
})

test('uploaded proposal viewer normalizes reviewed-upload filenames', () => {
  const proposal = read('src/pages/Proposal.jsx')
  const viewer = read('src/AttachmentViewer.jsx')
  assert.match(proposal, /attachment=\{\{[\s\S]*name: p\.reviewedUpload\.name \|\| p\.reviewedUpload\.filename[\s\S]*workbook: p\.reviewedUpload\.sheets\?\.length/)
  assert.match(viewer, /attachment\?\.name \|\| attachment\?\.filename/)
  assert.match(viewer, /getFile\(leadId, filename\)/)
  assert.match(viewer, /setLoadError\(/)
  assert.match(viewer, /attachment\.workbook\?\.sheets\?\.length/)
  assert.match(proposal, /workbook: p\.reviewedUpload\.sheets\?\.length/)
})
