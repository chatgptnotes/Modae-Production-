import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Cell from '../src/ui/EditableOpportunityCell.jsx'

test('editable cells start as complete readable values with an accessible pencil', () => {
  const value = 'A long customer description that must be readable in full'
  const html = renderToStaticMarkup(React.createElement(Cell, { value, label: 'Customer', onChange() {} }))
  assert.ok(html.includes(value))
  assert.ok(html.includes('aria-label="Edit Customer"'))
  assert.doesNotMatch(html, /<(input|textarea|select)\b/)
})
test('select cells display their full label, not an internal role identifier', () => {
  const html = renderToStaticMarkup(React.createElement(Cell, { as: 'select', value: 'LJS', label: 'Owner' }, React.createElement('option', { value: 'LJS' }, 'L. J. Swaminathan')))
  assert.ok(html.includes('L. J. Swaminathan'))
  assert.doesNotMatch(html, /<select\b/)
})
test('protected cells have no edit control and empty editable cells retain their pencil', () => {
  const protectedCell = renderToStaticMarkup(React.createElement(Cell, { value: 'Protected', disabled: true }))
  assert.doesNotMatch(protectedCell, /<button\b/)
  const empty = renderToStaticMarkup(React.createElement(Cell, { value: '', label: 'Remarks' }))
  assert.ok(empty.includes('—'))
  assert.ok(empty.includes('Edit Remarks'))
})
test('forecast is plain text until its pencil is activated', () => {
  const html = renderToStaticMarkup(React.createElement(Cell, { type: 'checkbox', checked: true, label: 'Forecast' }))
  assert.ok(html.includes('Yes'))
  assert.doesNotMatch(html, /<input\b/)
})
