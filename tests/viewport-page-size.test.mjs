import test from 'node:test'
import assert from 'node:assert/strict'
import { viewportPageSize } from '../src/ui/viewportPageSize.js'

test('viewport capacity uses the list position within its own section', () => {
  const dimensions = { viewportTop: 100, viewportBottom: 900, listOffsetTop: 120, rowHeight: 40, pagerHeight: 44, gap: 0, bottomReserve: 16, totalRows: 100 }
  assert.equal(viewportPageSize(dimensions), 15)
  assert.equal(viewportPageSize({ ...dimensions, listOffsetTop: 60 }), 17)
})

test('viewport capacity keeps a short complete list together and reserves pager space otherwise', () => {
  const dimensions = { viewportTop: 100, viewportBottom: 900, listOffsetTop: 120, rowHeight: 40, pagerHeight: 44, gap: 0, bottomReserve: 16, totalRows: 16 }
  assert.equal(viewportPageSize(dimensions), 16)
  assert.equal(viewportPageSize({ ...dimensions, totalRows: 20 }), 15)
  assert.equal(viewportPageSize({ ...dimensions, viewportBottom: 250, totalRows: 20 }), 1)
})
