import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { fiscalQuarter, financials, mergeWorkbookData, PIPELINE_COLUMNS } from '../src/excelLogic.js'
import { parseBetserWorkbook } from '../src/pipelineImport.js'
import { winLossAnalysis } from '../src/kpi.js'

const workbook = () => {
  const w = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([
    ['Sl.', 'Opp ID', 'Sell To Customer*', 'Customer Status', 'Value (K₹)*', 'COGS (K₹)*', 'Order Date*', 'Status*', 'Stage*', 'LJS'],
    [1, 'A', ' Acme ', 'Green', 100, 60, '2026-04-01', 'Closed', 'Won', 'PP'],
    [2, 'B', 'Beta', 'Amber', 0, 0, '', 'Open', 'Budgetary', 'RS'],
  ]), 'Current Opps')
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([
    ['New Opp ID', 'Sell To Customer', 'Opp. Ref. ID', 'Offer Date', 'EOD', 'EDD/ADD', 'Stage'],
    ['C', 'ACME', 'OLD-1', '2025-01-01', '2025-02-01', '2025-03-01', 'No Bid'],
  ]), 'Old Closed Opps')
  return XLSX.write(w, { type: 'array', bookType: 'xlsx' })
}
test('complete imports retain won records, real customer colours and separate historical dates', () => {
  const p = parseBetserWorkbook(workbook())
  assert.equal(p.error, '')
  assert.equal(p.opportunities.length, 3)
  assert.equal(p.customers.length, 2)
  assert.equal(p.customers.find(c => c.name.toLowerCase() === 'acme').status, 'Green')
  assert.notEqual(p.customers[0].kyc, 'Valid')
  assert.equal(p.customers[0].email, '')
  assert.equal(p.opportunities[0].fqFy, 'Q1-2027')
  const old = p.opportunities[2]
  assert.equal(old.offerDate, '2025-01-01')
  assert.equal(old.orderDate, '2025-02-01')
  assert.equal(old.deliveryDate, '2025-03-01')
  assert.equal(old.invoiceDate, null)
  assert.equal(old.stage, 'No Bid')
})
test('repairing an open-only current sheet restores closed wins and losses without duplicates or lost edits', () => {
  const w = XLSX.read(workbook(), { type: 'array' })
  XLSX.utils.sheet_add_aoa(w.Sheets['Current Opps'], [
    [3, 'D', 'Delta', 'Blue', 200, 100, '2026-04-01', 'Closed', 'Lost', 'PP'],
  ], { origin: -1 })
  const imported = parseBetserWorkbook(XLSX.write(w, { type: 'array', bookType: 'xlsx' }))
  assert.equal(imported.error, '')
  const state = {
    opportunities: imported.opportunities.filter(row => row.status === 'Open' || row.sourceSheet === 'Old Closed Opps')
      .map(row => ({ ...row, remarks: 'Saved edit' })),
    customers: [], deletedOpportunityIds: [], files: { B: { quote: ['saved-file'] } },
    proposals: { B: { subject: 'Saved proposal' } }, approvals: [{ id: 'saved-approval' }],
  }
  assert.equal(winLossAnalysis(state.opportunities).summary.won, 0)
  const repaired = mergeWorkbookData(state, imported)
  assert.equal(repaired.opportunities.length, 4)
  assert.equal(repaired.opportunities.find(row => row.id === 'A').stage, 'Won')
  assert.equal(repaired.opportunities.find(row => row.id === 'D').stage, 'Lost')
  assert.equal(repaired.opportunities.find(row => row.id === 'B').remarks, 'Saved edit')
  const report = winLossAnalysis(repaired.opportunities)
  assert.equal(report.summary.won, 1)
  assert.equal(report.summary.lost, 1)
  assert.equal(report.summary.winRate, 50)
  assert.equal(report.closedOther.count, 1)
  assert.deepEqual(repaired.files, state.files)
  assert.deepEqual(repaired.proposals, state.proposals)
  assert.deepEqual(repaired.approvals, state.approvals)
  const again = mergeWorkbookData(repaired, imported)
  assert.deepEqual(again.opportunities, repaired.opportunities)
  assert.equal(new Set(again.opportunities.map(row => row.id)).size, 4)
})
test('fiscal quarter follows Excel and does not produce 1900 for missing dates', () => {
  for (const [date, expected] of [['2026-03-31', 'Q4-2026'], ['2026-04-01', 'Q1-2027'], ['2026-07-01', 'Q2-2027'], ['2026-10-01', 'Q3-2027'], ['2027-01-01', 'Q4-2027'], ['', ''], ['2026-02-30', '']]) assert.equal(fiscalQuarter(date), expected)
  assert.deepEqual(financials({ valueK: 100, cogsK: 60 }), { gmK: 40, gmPct: 0.4 })
  assert.equal(financials({ valueK: 0, cogsK: 0 }).gmPct, null)
})
test('recovery preserves edits, existing customer colours, other slices and deletions', () => {
  const state = { opportunities: [{ id: 'A', oppName: 'Edited', contactPerson: '' }], customers: [{ name: 'Acme', status: 'Red', payment: 'Custom' }], deletedOpportunityIds: ['B'], files: { A: { quote: ['file'] } }, approvals: [{ id: 'approval' }] }
  const imported = { opportunities: [{ id: 'A', oppName: 'Excel', contactPerson: 'Buyer' }, { id: 'B' }, { id: 'C' }], customers: [{ name: 'ACME', status: 'Green', payment: '' }, { name: 'Beta', status: 'Blue' }] }
  const merged = mergeWorkbookData(state, imported)
  assert.equal(merged.opportunities.length, 2)
  assert.equal(merged.opportunities[0].oppName, 'Edited')
  assert.equal(merged.opportunities[0].contactPerson, 'Buyer')
  assert.equal(merged.customers[0].status, 'Red')
  assert.equal(merged.customers[0].payment, 'Custom')
  assert.ok(merged.conflicts.some(c => c.field === 'status'))
  assert.equal(merged.files, state.files)
  assert.equal(merged.approvals, state.approvals)
  const again = mergeWorkbookData(merged, imported)
  assert.deepEqual(again.opportunities, merged.opportunities)
})
test('Excel column order is complete and excludes Next Action', () => {
  assert.equal(PIPELINE_COLUMNS.length, 31)
  assert.equal(PIPELINE_COLUMNS[20].key, 'orderDate')
  assert.equal(PIPELINE_COLUMNS[21].key, 'fqFy')
  assert.equal(PIPELINE_COLUMNS[22].key, 'invoiceDate')
  assert.equal(PIPELINE_COLUMNS.at(-1).key, 'remarks')
  assert.ok(!PIPELINE_COLUMNS.some(c => c.key === 'nextActionOwner'))
})

test('customer guidance is extracted as guidance rather than fictional customer records', async () => {
  const { classificationGuidance } = await import('../src/excelLogic.js')
  assert.deepEqual(classificationGuidance([['Customer status Management'], ['Criteria', 'Blue', 'Red', 'Amber', 'Green'], ['Payment Terms', 'NA', 'Advance', '30 Days', '30-45 Days']]), [{ label: 'Payment Terms', values: { Blue: 'NA', Red: 'Advance', Amber: '30 Days', Green: '30-45 Days' } }])
})

test('customer master classification changes preserve manual lead and opportunity decisions', async () => {
  const { applyCustomerChange } = await import('../src/excelLogic.js')
  const state = { customers: [{ name: 'Acme', status: 'Blue' }], opportunities: [{ id: 'A', sellTo: 'ACME', customerStatus: 'Blue', paymentTerms: 'Agreed' }], leads: [{ sellTo: ' Acme ', customerStatus: 'Blue' }], proposals: { A: { terms: [{ ourResponse: 'Agreed' }] } } }
  const result = applyCustomerChange(state, 'Acme', { status: 'Green' })
  assert.equal(result.customers[0].status, 'Green')
  assert.equal(result.opportunities, state.opportunities)
  assert.equal(result.leads, state.leads)
  assert.equal(result.opportunities[0].customerStatus, 'Blue')
  assert.equal(result.leads[0].customerStatus, 'Blue')
  assert.equal(result.opportunities[0].paymentTerms, 'Agreed')
  assert.equal(result.proposals, state.proposals)
})

test('master classification updates preserve legacy controls on existing records and unrelated customers', async () => {
  const { applyCustomerChange } = await import('../src/excelLogic.js')
  const opportunity = { id: 'O', sellTo: 'Acme', customerStatus: 'Red', legacyCustomerClass: 'Blue', customerClassificationVersion: 2, leadVerification: { type: 'KYC', status: 'Pending' } }
  const lead = { id: 'L', sellTo: 'Acme', customerStatus: 'Green', customerClassificationVersion: 2 }
  const state = { customers: [{name:'Acme',status:'Red'}, {name:'Other',status:'Yellow'}], opportunities:[opportunity], leads:[lead] }
  const result = applyCustomerChange(state, 'ACME', {status:'Yellow', legacyCustomerClass:'', customerClassificationVersion:2})
  assert.equal(result.customers[0].status, 'Yellow')
  assert.equal(result.customers[1], state.customers[1])
  assert.equal(result.opportunities[0], opportunity)
  assert.equal(result.leads[0], lead)
  assert.equal(state.customers[0].status, 'Red')
})
