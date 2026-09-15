import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalMemoryKey, reviewFindingKey } from '../src/approvalMemory.js'

test('approval memory is stable for the same scoped decision', () => {
  const first = approvalMemoryKey({ oppId: 'OP-1', type: 'Pricing threshold exception', rev: '01', detail: 'Markup above 10%' })
  const same = approvalMemoryKey({ oppId: 'OP-1', type: 'Pricing threshold exception', rev: '01', detail: '  Markup   above 10% ' })
  assert.equal(first, same)
})

test('approval memory changes for a new revision or business detail', () => {
  const base = { oppId: 'OP-1', type: 'Commercial deviation', rev: '01', detail: 'Payment terms differ' }
  assert.notEqual(approvalMemoryKey(base), approvalMemoryKey({ ...base, rev: '02' }))
  assert.notEqual(approvalMemoryKey(base), approvalMemoryKey({ ...base, detail: 'Warranty terms differ' }))
})

test('review finding keys ignore formatting-only differences', () => {
  assert.equal(
    reviewFindingKey({ code: 'line.part', text: 'Missing  part number', evidence: 'Workbook row 3' }),
    reviewFindingKey({ code: ' line.part ', text: 'Missing part number', evidence: 'Workbook row 3' }),
  )
})
