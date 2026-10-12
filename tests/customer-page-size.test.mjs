import test from 'node:test'
import assert from 'node:assert/strict'
import { customerPageSize } from '../src/pages/customerPageSize.js'

test('customer page size fills the space while reserving pagination and legend', () => {
  assert.equal(customerPageSize({ bodyTop: 300, viewportBottom: 1000, rowHeight: 50, paginationHeight: 44, legendHeight: 40, bottomPadding: 60, totalRows: 64 }), 11)
  assert.equal(customerPageSize({ bodyTop: 300, viewportBottom: 750, rowHeight: 50, paginationHeight: 44, legendHeight: 40, bottomPadding: 60, totalRows: 64 }), 6)
})

test('customer page size uses all rows if they fit without pagination', () => {
  assert.equal(customerPageSize({ bodyTop: 300, viewportBottom: 1000, rowHeight: 50, paginationHeight: 44, legendHeight: 40, bottomPadding: 60, totalRows: 12 }), 12)
  assert.equal(customerPageSize({ bodyTop: 300, viewportBottom: 1000, rowHeight: 50, paginationHeight: 44, legendHeight: 40, bottomPadding: 60, totalRows: 0 }), 1)
})

test('customer page size always allows one row on a short viewport', () => {
  assert.equal(customerPageSize({ bodyTop: 700, viewportBottom: 750, rowHeight: 50, paginationHeight: 44, legendHeight: 40, bottomPadding: 60, totalRows: 64 }), 1)
})
