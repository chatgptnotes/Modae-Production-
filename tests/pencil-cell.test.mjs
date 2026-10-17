import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Cell, { EditableOpportunityRow, OpportunityRowEditButton } from '../src/ui/EditableOpportunityCell.jsx'

test('cells start as complete readable values without individual edit buttons', () => {
  const value = 'A long customer description that must be readable in full'
  const html = renderToStaticMarkup(React.createElement(Cell, { value, label: 'Customer', onChange() {} }))
  assert.ok(html.includes(value))
  assert.doesNotMatch(html, /<button\b/)
  assert.doesNotMatch(html, /<(input|textarea|select)\b/)
})
test('select cells display their full label, not an internal role identifier', () => {
  const html = renderToStaticMarkup(React.createElement(Cell, { as: 'select', value: 'LJS', label: 'Owner' }, React.createElement('option', { value: 'LJS' }, 'LJ Swaminathan')))
  assert.ok(html.includes('LJ Swaminathan'))
  assert.doesNotMatch(html, /<select\b/)
})
test('protected and empty cells have no individual edit controls', () => {
  const protectedCell = renderToStaticMarkup(React.createElement(Cell, { value: 'Protected', disabled: true }))
  assert.doesNotMatch(protectedCell, /<button\b/)
  const empty = renderToStaticMarkup(React.createElement(Cell, { value: '', label: 'Remarks' }))
  assert.ok(empty.includes('—'))
  assert.doesNotMatch(empty, /<button\b/)
})
test('forecast is plain text until its pencil is activated', () => {
  const html = renderToStaticMarkup(React.createElement(Cell, { type: 'checkbox', checked: true, label: 'Forecast' }))
  assert.ok(html.includes('Yes'))
  assert.doesNotMatch(html, /<input\b/)
})

test('a row exposes one accessible pencil for all its editable fields', () => {
  const html = renderToStaticMarkup(React.createElement('table', null, React.createElement('tbody', null,
    React.createElement(EditableOpportunityRow, null,
      React.createElement('td', null, React.createElement(OpportunityRowEditButton, { label: '2600001' })),
      React.createElement('td', null, React.createElement(Cell, { value: 'Customer' })),
      React.createElement('td', null, React.createElement(Cell, { value: 'Description' }))))))
  assert.equal((html.match(/<button/g) || []).length, 1)
  assert.ok(html.includes('aria-label="Edit opportunity 2600001"'))
})
